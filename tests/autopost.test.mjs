import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPosts, newPosts, publishPosts, postTime, articleBody } from '../src/autopost.mjs';
import { fullContent, noticeDocument } from '../src/notice-document.mjs';

const post = (id, date = '2026-10-12 12:00:00') => ({ titleNo: id, userId: 'soju2022', regDate: date, titleName: '제목', content: { content: '<p>전체 본문</p>' }, photos: [] });
const state = () => ({ version: 1, since: postTime(post(1)) - 1000, done: {} });

test('즐겨찾기 쿠키를 그대로 사용하고 여러 페이지/고정글을 중복 제거한다', async () => {
    const pages = [];
    const p = post(2);
    const result = await collectPosts({ soopId: 'soju2022', cookie: 'auth=test', since: postTime(p) - 1000, fetcher: async (url, opts) => {
        if (!opts.headers) return { ok: true, json: async () => ({ contents: [], noticeData: [] }) };
        assert.equal(opts.headers.Cookie, 'auth=test');
        const page = Number(url.searchParams.get('page'));
        pages.push(page);
        return { ok: true, json: async () => ({ contents: page === 1 ? [p] : [post(1, '2026-10-01 00:00:00')], noticeData: [p], meta: { totalPages: 3 } }) };
    } });
    assert.deepEqual(result.map(p => p.titleNo), [2]);
    assert.deepEqual(pages, [1, 2]);
});

test('인증 수집 오류를 공개 목록으로 대체하지 않는다', async () => {
    await assert.rejects(collectPosts({ soopId: 'soju2022', cookie: '', fetcher: () => assert.fail() }), /SOOP_COOKIE/);
    let calls = 0;
    await assert.rejects(collectPosts({ soopId: 'soju2022', cookie: 'auth=test', fetcher: async () => { calls++; return { ok: false, status: 401 }; } }), /공개 글로 대체하지/);
    assert.equal(calls, 1);
    await assert.rejects(collectPosts({ soopId: 'soju2022', cookie: 'expired', fetcher: async () => ({ ok: true, json: async () => ({ contents: [post(1)] }) }) }), /즐겨찾기 글 접근/);
});

test('등록 전 pending을 영구 저장하고 이미 처리한 글은 건너뛴다', async () => {
    const s = state(); s.done['1'] = 123;
    const events = [];
    await publishPosts({ state: s, posts: [post(1), post(2)], prepare: async p => { events.push(`prepare:${p.titleNo}`); return []; },
        save: async s => { events.push(s.pending ? 'pending' : 'done'); }, publish: async () => { events.push('publish'); return 456; } });
    assert.deepEqual(events, ['prepare:2', 'pending', 'publish', 'done']);
    assert.equal(s.done['2'], 456);
});

test('상태 저장 실패 시 전송하지 않고, 전송 응답 불명 시 다음 실행도 멈춘다', async () => {
    const s = state();
    await assert.rejects(publishPosts({ state: s, posts: [post(1)], prepare: async () => [], save: async () => { throw Error('DB'); }, publish: () => assert.fail() }));
    assert.throws(() => newPosts(s, [post(1)]), /확인 필요/);
    const t = state();
    await assert.rejects(publishPosts({ state: t, posts: [post(1)], prepare: async () => [], save: async () => {}, publish: async () => { throw Error('timeout'); } }));
    assert.throws(() => newPosts(t, [post(1)]), /자동 재전송/);
});

test('준비 실패 시 pending을 만들지 않아 재실행할 수 있다', async () => {
    const s = state();
    await assert.rejects(publishPosts({ state: s, posts: [post(1)], prepare: async () => { throw Error('image'); }, save: () => assert.fail(), publish: () => assert.fail() }));
    assert.equal(newPosts(s, [post(1)]).length, 1);
});

test('긴 제목/100문단/사진 7장을 모두 포함하고 위험한 HTML은 제거한다', async () => {
    const p = post(1); p.titleName = '긴 제목 '.repeat(40);
    p.content.content = Array.from({ length: 100 }, (_, i) => `<p>본문 ${i} 끝</p>`).join('') + '<script>alert(1)</script>';
    p.photos = Array.from({ length: 7 }, (_, i) => ({ url: `https://stimg.sooplive.co.kr/${i}.png` }));
    const html = await noticeDocument({ name: '소주양', post: p });
    assert.ok(html.includes(p.titleName));
    assert.ok(html.includes('본문 99 끝'));
    assert.equal((html.match(/alt="첨부 사진"/g) || []).length, 7);
    assert.ok(!html.includes('alert(1)'));
    assert.ok(!html.includes('line-clamp'));
    const body = articleBody('soju2022', p, [{ fileUrl: 'https://image.ygosu.com/a.png', part: '1/1' }]);
    assert.ok(body.includes('/post/1'));
});

test('요약뿐인 글/누락 사진/영상은 생략한 채 게시하지 않는다', () => {
    assert.throws(() => fullContent({ content: { textContent: '요약...' } }), /전체 본문/);
    assert.throws(() => fullContent({ content: { content: '<img src="http://localhost/private">' } }), /중단/);
    assert.throws(() => fullContent({ content: { content: '<video src="https://a.com/a.mp4"></video>' } }), /영상/);
});
