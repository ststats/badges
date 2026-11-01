import assert from 'node:assert/strict';
import test from 'node:test';
import middleware, { config } from '../middleware.js';

const sha = 'b'.repeat(40);

test('경기 WebP는 최신 경기 커밋의 GitHub 주소로 넘긴다(Vercel 전송량을 쓰지 않음)', async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ object: { sha } }) }));
    assert.deepEqual(config.matcher, ['/rider/latest.webp', '/rider/latest.json']);
    const res = await middleware(new Request('https://example.com/rider/latest.webp'));
    assert.equal(res.status, 302);
    assert.equal(res.headers.get('location'), `https://raw.githubusercontent.com/ststats/badges/${sha}/latest.webp`);
    assert.equal(res.headers.get('x-middleware-rewrite'), null);
    assert.match(res.headers.get('cache-control'), /max-age=0/);
});

test('latest.json은 이 사이트 주소로 그대로 전한다', async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ object: { sha } }) }));
    const res = await middleware(new Request('https://example.com/rider/latest.json'));
    assert.equal(res.status, 200);
    assert.equal(
        res.headers.get('x-middleware-rewrite'),
        `https://raw.githubusercontent.com/ststats/badges/${sha}/latest.json`
    );
});
