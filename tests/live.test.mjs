import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COOKIE_KEY = 'test-key-for-unit-tests-123456';
const { checkCookie, cookieStatus } = await import('../src/live.mjs');

const json = body => new Response(JSON.stringify(body), { status: 200 });

test('쿠키 확인은 지금 멤버 게시판을 그 쿠키로 읽어 본다', async t => {
    const boards = [];
    t.mock.method(globalThis, 'fetch', async (url, opts) => {
        const u = String(url);
        if (u.includes('/rpc/api_site_members'))
            return json({
                members: [
                    { 이름: '나간 멤버', 'SOOP ID': 'old01', 퇴단일: '2026-10-01' },
                    { 이름: '멤버A', 'SOOP ID': 'member01' },
                ],
            });
        if (u.includes('/rpc/')) return json({});
        boards.push([u, opts.headers.Cookie]);
        return opts.headers.Cookie === 'good=1' ? json({ contents: [] }) : new Response('', { status: 500 });
    });
    await checkCookie('good=1');
    assert.ok(boards[0][0].includes('/channel/member01/board'));
    // .com이 거절하면 .co.kr도 보고, 둘 다 거절하면 실패
    await assert.rejects(checkCookie('expired=1'), /HTTP 500/);
    assert.deepEqual(
        boards.slice(1).map(([u]) => new URL(u).host),
        ['api-channel.sooplive.com', 'api-channel.sooplive.co.kr']
    );
    // 저장된 쿠키가 없으면 none
    assert.deepEqual(await cookieStatus(), { state: 'none' });
});
