import test from 'node:test';
import assert from 'node:assert/strict';

process.env.EDIT_PASSWORD = 'test-password';
const { default: save } = await import('../api/save.js');

const json = body => new Response(JSON.stringify(body), { status: 200 });

async function post(body) {
    const res = {
        headers: {},
        setHeader(k, v) {
            this.headers[k] = v;
        },
        end(text) {
            this.body = JSON.parse(text);
        },
    };
    await save({ method: 'POST', body: { password: 'test-password', file: 'targets', ...body } }, res);
    return res;
}

test('자동 등록 설정은 지금 멤버만, 게시판·분류를 확인하고 게시판 없는 줄은 빼고 저장한다', async t => {
    const put = [];
    t.mock.method(globalThis, 'fetch', async (url, opts) => {
        const u = String(url);
        if (u.includes('/rpc/api_site_members'))
            return json({
                members: [
                    { 이름: '멤버A', 'SOOP ID': 'Member01' },
                    { 이름: '멤버B', 'SOOP ID': 'member02' },
                    { 이름: '나간 멤버', 'SOOP ID': 'old01', 퇴단일: '2026-10-01' },
                ],
            });
        if (u.includes('/rpc/badge_autopost_targets_put')) {
            put.push(JSON.parse(opts.body).p_targets);
            return json([]);
        }
        return json(null);
    });
    const bad = async (targets, pattern) => {
        const res = await post({ targets });
        assert.equal(res.statusCode, 400);
        assert.match(res.body.error, pattern);
    };
    await bad([{ soopId: 'old01', board: 'pan_a' }], /지금 멤버가 아닌/);
    await bad([{ soopId: 'member01', board: 'https://evil.example/x y' }], /게시판 주소/);
    await bad([{ soopId: 'member01', enabled: true }], /켜려면/);
    await bad([{ soopId: 'member01', board: 'pan_a', category: '가'.repeat(21) }], /20자/);
    assert.equal(put.length, 0);

    const res = await post({
        targets: [
            { soopId: 'member01', enabled: true, board: 'https://ygosu.com/board/pan_a/', category: ' 방송공지 ' },
            { soopId: 'member02', enabled: false, board: '' },
        ],
    });
    assert.equal(res.statusCode, 200);
    // 게시판을 비운 멤버는 저장하지 않고, SOOP ID는 소문자·게시판은 이름만·분류는 앞뒤 공백 없이
    assert.deepEqual(put, [
        [{ soopId: 'member01', name: '멤버A', board: 'pan_a', category: '방송공지', enabled: true }],
    ]);
});
