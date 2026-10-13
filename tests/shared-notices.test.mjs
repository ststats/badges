import test from 'node:test';
import assert from 'node:assert/strict';
import { sharedNoticeHandler } from '../src/shared-notices.mjs';
const secret = 'test-only-bridge-secret-123456';
const res = () => ({ setHeader() {}, end(text) { this.body = JSON.parse(text); } });
test('anonymous and wrong credentials never read the cookie', async () => {
    const handler = sharedNoticeHandler({ secret, currentCookie: () => assert.fail('No anonymous cookie access') });
    for (const authorization of ['', 'Bearer wrong']) {
        const response = res();
        await handler({ method: 'GET', headers: { authorization }, url: '/api/shared-notices?soop_id=alice&page=2' }, response);
        assert.equal(response.statusCode, 401);
    }
});
test('authenticated page 2 reads allowlisted SOOP, strips extra fields and never returns credentials', async () => {
    const response = res();
    const handler = sharedNoticeHandler({ secret, currentCookie: async () => 'session=test-cookie', fetcher: async (url, options) => {
        assert.equal(url.hostname, 'api-channel.sooplive.com');
        assert.equal(url.searchParams.get('page'), '2');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Cookie, 'session=test-cookie');
        return new Response(JSON.stringify({ contents: [{ titleNo: 2, userId: 'alice', extraSecret: 'omit' }], meta: { totalPages: 3 } }));
    } });
    await handler({ method: 'GET', headers: { authorization: 'Bearer ' + secret }, url: '/api/shared-notices?soop_id=alice&page=2' }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.posts[0].titleNo, 2);
    assert.equal(response.body.totalPages, 3);
    assert.doesNotMatch(JSON.stringify(response.body), /cookie|secret|omit/i);
});
test('invalid parameters and missing cookie fail safely', async () => {
    const handler = sharedNoticeHandler({ secret, currentCookie: async () => '' });
    for (const [query, status] of [['soop_id=../evil&page=2', 400], ['soop_id=alice&page=0', 400], ['soop_id=alice&page=2', 503]]) {
        const response = res();
        await handler({ method: 'GET', headers: { authorization: 'Bearer ' + secret }, url: '/?' + query }, response);
        assert.equal(response.statusCode, status);
    }
});
