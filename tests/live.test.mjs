import test from 'node:test';
import assert from 'node:assert/strict';

delete process.env.SOOP_COOKIE;
delete process.env.COOKIE_KEY;
const { recentPosts } = await import('../src/live.mjs');

const board = titles => ({
    contents: titles.map((t, i) => ({ titleNo: i + 1, titleName: t, userId: 'soju2022', regDate: `2026-10-1${i} 10:00:00` })),
    noticeData: [],
});

test('SOOP이 실패하면 직전 목록을 쓰고, 6시간이 지나면 실패를 알린다', async t => {
    let now = Date.parse('2026-10-12T00:00:00Z');
    t.mock.method(Date, 'now', () => now);
    let fail = false;
    t.mock.method(globalThis, 'fetch', async () => {
        if (fail) throw new Error('SOOP down');
        return new Response(JSON.stringify(board(['가', '나'])), { status: 200 });
    });
    assert.deepEqual((await recentPosts()).map(p => p.titleName), ['나', '가']);
    fail = true;
    now += 60 * 1000; // 30초 기억이 지난 뒤
    assert.deepEqual((await recentPosts()).map(p => p.titleName), ['나', '가']);
    now += 7 * 3600 * 1000;
    await assert.rejects(recentPosts(), /SOOP down|HTTP/);
});
