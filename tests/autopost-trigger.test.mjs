import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPair, SignJWT } from 'jose';
import { verifyActionsIdentity, ISSUER, AUDIENCE } from '../src/actions-identity.mjs';
import { validDetectorSecret, detectAndDispatch, detectTargets, dispatchPosting } from '../src/autopost-detect.mjs';
import { vercelPosts } from '../src/autopost-source.mjs';
import sourceHandler from '../api/autopost-source.js';

const pair = await generateKeyPair('RS256');
const claims = {
    repository_id: '1413985650',
    repository_owner_id: '322625611',
    ref: 'refs/heads/main',
    workflow_ref: 'ststats/badges/.github/workflows/autopost.yml@refs/heads/main',
    event_name: 'workflow_dispatch',
};
const sign = (overrides = {}, key = pair.privateKey, sub = 'repo:ststats/badges:ref:refs/heads/main') =>
    new SignJWT({ ...claims, ...overrides })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject(sub)
        .setIssuedAt()
        .setNotBefore('0s')
        .setExpirationTime('5m')
        .sign(key);

test('GitHub 서명과 저장소·main·워크플로를 모두 검증한다', async () => {
    await verifyActionsIdentity(await sign(), pair.publicKey);
    await verifyActionsIdentity(
        await sign({}, pair.privateKey, 'repo:ststats@322625611/badges@1413985650:ref:refs/heads/main'),
        pair.publicKey
    );
    for (const altered of [
        { repository_id: '1' },
        { repository_owner_id: '1' },
        { ref: 'refs/heads/other' },
        { workflow_ref: 'ststats/badges/.github/workflows/test.yml@refs/heads/main' },
        { event_name: 'pull_request' },
    ]) {
        await assert.rejects(verifyActionsIdentity(await sign(altered), pair.publicKey));
    }
    const forged = await generateKeyPair('RS256');
    await assert.rejects(verifyActionsIdentity(await sign({}, forged.privateKey), pair.publicKey));
    await assert.rejects(
        verifyActionsIdentity(await sign({}, pair.privateKey, 'repo:other/badges:ref:refs/heads/main'), pair.publicKey)
    );
    const expired = await new SignJWT(claims)
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setSubject('repo:ststats/badges:ref:refs/heads/main')
        .setIssuedAt(1)
        .setNotBefore(1)
        .setExpirationTime(2)
        .sign(pair.privateKey);
    await assert.rejects(verifyActionsIdentity(expired, pair.publicKey));
});

test('인증 없는 요청은 SOOP 내용을 반환하지 않는다', async () => {
    const res = {
        setHeader() {},
        end(body) {
            this.body = JSON.parse(body);
        },
    };
    await sourceHandler({ method: 'POST', headers: {} }, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.posts, undefined);
    assert.equal(validDetectorSecret(undefined, 'x'.repeat(32)), false);
    assert.equal(validDetectorSecret('x'.repeat(32), 'x'.repeat(32)), true);
    assert.equal(validDetectorSecret('wrong', 'x'.repeat(32)), false);
});

const post = (titleNo, regDate = '2026-10-12 12:00:00') => ({ titleNo, regDate });
test('새 글이 없거나 잠금 중이면 GitHub를 실행하지 않는다', async () => {
    for (const reason of ['baseline', 'unchanged', 'cooldown']) {
        const result = await detectAndDispatch({
            posts: [post(1)],
            secret: 'secret',
            rpc: async () => ({ reason }),
            dispatch: () => assert.fail(),
        });
        assert.deepEqual(result, { dispatched: false, reason });
    }
});

test('여러 새 글도 최신 번호로 잠금을 얻어 워크플로를 한 번만 호출한다', async () => {
    const calls = [];
    let dispatched = 0;
    const result = await detectAndDispatch({
        posts: [post(1), post(3), post(2)],
        secret: 'secret',
        rpc: async (fn, args) => {
            calls.push([fn, args]);
            return fn.endsWith('claim') ? { lease: 'uuid' } : true;
        },
        dispatch: async () => {
            dispatched++;
        },
    });
    assert.equal(result.dispatched, true);
    assert.equal(dispatched, 1);
    assert.equal(calls[0][1].p_title_no, 3);
    assert.equal(calls.length, 1); // dispatch 접수로 완료 기록하지 않는다.
});

test('켠 멤버를 차례로 보고 한 번에 한 멤버만 실행을 요청한다', async () => {
    const claimed = [];
    const dispatched = [];
    const results = await detectTargets({
        targets: [{ soopId: 'a' }, { soopId: 'b' }, { soopId: 'c' }, { soopId: 'd' }],
        collect: async soopId => {
            if (soopId === 'a') throw new Error('SOOP down');
            return [post(soopId === 'b' ? 5 : 7)];
        },
        secret: 'secret',
        rpc: async (fn, args) => {
            claimed.push(args.p_soop_id);
            return args.p_soop_id === 'b' ? { reason: 'unchanged' } : { lease: '11111111-1111-4111-8111-111111111111' };
        },
        dispatch: async delivery => dispatched.push(delivery),
    });
    // 한 멤버의 실패가 다른 멤버를 막지 않고, 실행을 요청한 뒤에는 멈춘다(대기 실행이 서로 취소되지 않게)
    assert.deepEqual(results, { a: 'failed', b: 'unchanged', c: 'dispatched' });
    assert.deepEqual(claimed, ['b', 'c']);
    assert.deepEqual(dispatched, [{ lease: '11111111-1111-4111-8111-111111111111', titleNo: '7', target: 'c' }]);
});

test('dispatch 실패는 성공으로 저장하지 않는다', async () => {
    const finishes = [];
    await assert.rejects(
        detectAndDispatch({
            posts: [post(1)],
            secret: 'secret',
            rpc: async (fn, args) => {
                if (fn.endsWith('claim')) return { lease: 'uuid' };
                finishes.push(args);
                return true;
            },
            dispatch: async () => {
                throw Error('timeout');
            },
        })
    );
    assert.equal(finishes[0].p_status, 'retry');
});

test('Vercel에서 본문을 읽을 때 쿠키·COOKIE_KEY 대신 일회성 GitHub 신원만 보낸다', async () => {
    const calls = [];
    const posts = [post(2)];
    const target = { soopId: 'member01', name: '멤버A', board: 'pan_member01', since: 1 };
    const result = await vercelPosts(
        'member01',
        {
            ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github.example/identity',
            ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'request-token',
        },
        async (url, options) => {
            calls.push({ url: String(url), options });
            return { ok: true, json: async () => (calls.length === 1 ? { value: 'signed-token' } : { posts, target }) };
        }
    );
    assert.deepEqual(result, { posts, target });
    assert.deepEqual(JSON.parse(calls[1].options.body), { soopId: 'member01' });
    assert.equal(new URL(calls[0].url).searchParams.get('audience'), AUDIENCE);
    assert.equal(calls[1].url, 'https://staruniv-badges.vercel.app/api/autopost-source');
    assert.deepEqual(calls[1].options.headers, {
        Authorization: 'Bearer signed-token',
        'Content-Type': 'application/json',
    });
    // 다른 멤버의 설정이 오면 쓰지 않는다
    await assert.rejects(
        vercelPosts(
            'member02',
            { ACTIONS_ID_TOKEN_REQUEST_URL: 'https://github.example/identity', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 't' },
            async url => ({
                ok: true,
                json: async () => (String(url).includes('identity') ? { value: 's' } : { posts, target }),
            })
        ),
        /Invalid SOOP source/
    );
    await dispatchPosting(
        'dispatch-token',
        async (url, opts) => {
            assert.equal(JSON.parse(opts.body).ref, 'main');
            assert.ok(url.endsWith('/autopost.yml/dispatches'));
            assert.deepEqual(JSON.parse(opts.body).inputs, {
                delivery_lease: '11111111-1111-4111-8111-111111111111',
                delivery_title: '2',
                target: 'member01',
            });
            return { status: 204 };
        },
        { lease: '11111111-1111-4111-8111-111111111111', titleNo: '2', target: 'member01' }
    );
    await dispatchPosting(
        'dispatch-token',
        async (_url, opts) => {
            assert.deepEqual(JSON.parse(opts.body).inputs, { diagnose_only: true, target: 'member01' });
            return { status: 204 };
        },
        { diagnoseOnly: true, target: 'member01' }
    );
    await assert.rejects(
        dispatchPosting('dispatch-token', () => assert.fail(), { diagnoseOnly: true }),
        /Invalid/
    );
});
