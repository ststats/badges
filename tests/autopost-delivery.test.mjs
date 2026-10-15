import test from 'node:test';
import assert from 'node:assert/strict';
import { withDelivery } from '../src/autopost-delivery.mjs';
import { publishPosts, postTime } from '../src/autopost.mjs';
import { githubState } from '../src/autopost-state.mjs';
import resultHandler from '../api/autopost-result.js';

const lease = '11111111-1111-4111-8111-111111111111';
const post = { titleNo: 2, regDate: '2026-10-12 12:00:00' };
const fresh = () => ({ version: 1, since: postTime(post) - 1000, done: {} });

for (const scenario of ['preparation', 'cooldown', 'success', 'write-timeout', 'save-after-write']) {
    test(`감지 후 ${scenario}: 영구 이력으로 완료·재시도·중단을 구분한다`, async () => {
        let durable = fresh();
        const state = structuredClone(durable);
        const now = postTime(post) + 10000;
        if (scenario === 'cooldown') state.lastPostedAt = now - 1000;
        const reports = [];
        let writes = 0;
        const task = withDelivery({
            lease,
            titleNo: '2',
            run: () =>
                publishPosts({
                    state,
                    posts: [post],
                    now: () => now,
                    prepare: async () => {
                        if (scenario === 'preparation') throw Error('image');
                        return [];
                    },
                    publish: async () => {
                        writes++;
                        if (scenario === 'write-timeout') throw Error('timeout');
                        return 900;
                    },
                    save: async value => {
                        if (scenario === 'save-after-write' && !value.pending) throw Error('storage');
                        durable = structuredClone(value);
                    },
                }),
            loadState: async () => durable,
            report: async (_, status) => reports.push(status),
        });
        if (['preparation', 'write-timeout', 'save-after-write'].includes(scenario)) await assert.rejects(task);
        else await task;
        assert.deepEqual(reports, [
            scenario === 'success' ? 'complete' : ['preparation', 'cooldown'].includes(scenario) ? 'retry' : 'blocked',
        ]);
        assert.equal(writes, ['preparation', 'cooldown'].includes(scenario) ? 0 : 1);
        if (scenario === 'save-after-write') {
            assert.equal(state.done['2'], 900); // 메모리상 성공을 완료로 보내면 안 된다.
            assert.equal(durable.pending.id, '2');
        }
    });
}

test('완료 콜백 실패 후 재실행해도 같은 글을 다시 쓰지 않는다', async () => {
    const state = fresh();
    state.done['2'] = 900;
    let reports = 0;
    const args = {
        lease,
        titleNo: '2',
        run: () =>
            publishPosts({
                state,
                posts: [post],
                prepare: () => assert.fail(),
                publish: () => assert.fail(),
                save: () => assert.fail(),
            }),
        loadState: async () => state,
        report: async () => {
            reports++;
            if (reports === 1) throw Error('callback');
        },
    };
    await assert.rejects(withDelivery(args));
    await withDelivery(args);
    assert.equal(reports, 2);
});

test('수동 실행은 감지 상태를 바꾸지 않고 잘못된 실행 번호는 등록 전에 막는다', async () => {
    let ran = false;
    await withDelivery({
        run: async () => {
            ran = true;
        },
        loadState: () => assert.fail(),
        report: () => assert.fail(),
    });
    assert.equal(ran, true);
    await assert.rejects(withDelivery({ lease: 'bad', titleNo: '2', run: () => assert.fail() }), /Invalid delivery/);
});

test('결과 API도 인증 없는 완료 통보를 거절한다', async () => {
    const res = {
        setHeader() {},
        end(body) {
            this.body = JSON.parse(body);
        },
    };
    await resultHandler({ method: 'POST', headers: {}, body: { lease, status: 'complete' } }, res);
    assert.equal(res.statusCode, 401);
});

test('이력 브랜치 유실과 깨진 이력은 초기화하거나 쓰지 않는다', async () => {
    const original = globalThis.fetch;
    try {
        for (const missing of ['branch', 'file', 'invalid']) {
            let mutations = 0;
            globalThis.fetch = async (url, opts) => {
                if (opts.method !== 'GET') mutations++;
                if (String(url).includes('/git/ref/') && missing !== 'branch')
                    return { ok: true, json: async () => ({ ref: 'existing' }) };
                if (missing === 'invalid')
                    return {
                        ok: true,
                        json: async () => ({
                            sha: 'sha',
                            content: Buffer.from(JSON.stringify({ ...fresh(), done: { '2': 'unknown' } })).toString(
                                'base64'
                            ),
                        }),
                    };
                return { ok: false, status: 404 };
            };
            await assert.rejects(
                githubState({ repository: 'ststats/badges', token: 'test', soopId: 'member01' }),
                /이력|올바르지/
            );
            assert.equal(mutations, 0);
        }
    } finally {
        globalThis.fetch = original;
    }
});

test('멤버를 켠 뒤 첫 등록은 켠 시각부터의 새 이력 파일로 시작한다', async () => {
    const original = globalThis.fetch;
    const urls = [];
    try {
        globalThis.fetch = async (url, opts) => {
            urls.push(`${opts.method || 'GET'} ${url}`);
            if (String(url).includes('/git/ref/')) return { ok: true, json: async () => ({ ref: 'existing' }) };
            if (opts.method === 'PUT') return { ok: true, json: async () => ({ content: { sha: 'new' } }) };
            return { ok: false, status: 404 };
        };
        const store = await githubState({
            repository: 'ststats/badges',
            token: 'test',
            soopId: 'member01',
            since: 1234,
        });
        assert.deepEqual(store.state, { version: 1, since: 1234, done: {} });
        assert.ok(urls.every(u => u.startsWith('GET'))); // 읽기만 하고 등록 전에는 쓰지 않는다
        assert.ok(urls.some(u => u.includes('contents/targets/member01.json?ref=autopost-state')));
        await assert.rejects(
            githubState({ repository: 'ststats/badges', token: 'test', soopId: '../x', since: 1 }),
            /대상/
        );
    } finally {
        globalThis.fetch = original;
    }
});
