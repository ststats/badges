import assert from 'node:assert/strict';
import test from 'node:test';
import middleware, { config } from '../middleware.js';

const sha = 'b'.repeat(40);

test('최신 경기 커밋의 파일을 이 사이트 주소로 전한다(GitHub로 넘기지 않음)', async t => {
    t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ object: { sha } }) }));
    assert.deepEqual(config.matcher, ['/rider/latest.webp', '/rider/latest.json']);
    const res = await middleware(new Request('https://example.com/rider/latest.webp'));
    assert.equal(res.status, 200); // 302가 아니다
    assert.equal(
        res.headers.get('x-middleware-rewrite'),
        `https://raw.githubusercontent.com/ststats/badges/${sha}/latest.webp`
    );
    assert.match(res.headers.get('cache-control'), /max-age=0/);
});
