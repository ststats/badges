import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPosts, newPosts, postingCandidates, publishPosts, postTime, articleBody, articleSubject, noticeCategoryCode } from '../src/autopost.mjs';
import { fullContent, noticeDocument } from '../src/notice-document.mjs';

const post = (id, date = '2026-10-12 12:00:00') => ({ titleNo: id, userId: 'soju2022', regDate: date, titleName: '제목', content: { content: '<p>전체 본문</p>' }, photos: [] });
const state = () => ({ version: 1, since: postTime(post(1)) - 1000, done: {} });

test('공지 카테고리는 같은 게시판의 실제 분류 링크에서만 읽는다', () => {
    assert.equal(noticeCategoryCode([
        { text: '공지', href: '/board/other/?s_category=Cwrong' },
        { text: '공지사항', href: '/board/notice' },
        { text: '공지', href: 'https://evil.example/board/pan_sojuyang/?s_category=Cwrong' },
        { text: ' 공지 ', href: '/board/pan_sojuyang/?s_category=C6a50b533b88545.30004058' },
    ]), 'C6a50b533b88545.30004058');
    assert.throws(() => noticeCategoryCode([]), /카테고리/);
});

test('와고 제목은 원문 공지 날짜의 YYMMDD 소주양 공지 형식이다', () => {
    assert.equal(articleSubject(post(1)), '261012 소주양 공지');
    assert.equal(articleSubject(post(2, '2025-12-31 23:59:59')), '251231 소주양 공지');
    assert.throws(() => articleSubject({ regDate: '' }), /날짜/);
});

test('초기 테스트는 기준 이전 최신 하나만 등록하고 재실행해도 다른 과거 글을 올리지 않는다', async () => {
    const s = { version: 1, since: Date.now(), done: { '1': 'baseline', '2': 'baseline', '3': 'baseline' } };
    const posts = [post(1), post(3), post(2)];
    assert.equal(newPosts(s, posts).length, 0);
    const sent = [];
    const args = { state: s, posts, includeLatest: true, prepare: async p => { sent.push(p.titleNo); return []; },
        save: async () => {}, publish: async () => 901, now: () => 1000000 };
    await publishPosts(args);
    assert.deepEqual(sent, [3]);
    assert.equal(s.done['3'], 901);
    assert.equal(s.done['2'], 'baseline');
    assert.equal(postingCandidates(s, posts, true).length, 0);
    await publishPosts({ ...args, now: () => 2000000 });
    assert.deepEqual(sent, [3]);
    s.pending = { id: '4' };
    assert.throws(() => postingCandidates(s, posts, true), /확인 필요/);
});

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

test('밀린 글 100개도 최신 하나만 전송하고 나머지는 영구적으로 건너뛴다', async () => {
    const s = state();
    const posts = Array.from({ length: 100 }, (_, i) => post(i + 1));
    const sent = [];
    const snapshots = [];
    await publishPosts({ state: s, posts, prepare: async p => { sent.push(p.titleNo); return []; },
        save: async v => { snapshots.push(structuredClone(v)); }, publish: async () => 900, now: () => 1000000 });
    assert.deepEqual(sent, [100]);
    assert.equal(s.done['100'], 900);
    assert.equal(s.done['99'], 'skipped');
    assert.equal(snapshots[0].done['1'], 'skipped');
    assert.equal(newPosts(s, posts).length, 0);
    // 재실행/수동 실행에서도 5분 안에는 추가 등록하지 않는다.
    await publishPosts({ state: s, posts: [post(101)], prepare: () => assert.fail(), save: () => assert.fail(), publish: () => assert.fail(), now: () => 1000001 });
    assert.equal(s.done['101'], undefined);
    await publishPosts({ state: s, posts: [post(101)], prepare: async () => [], save: async () => {}, publish: async () => 901, now: () => 1300000 });
    assert.equal(s.done['101'], 901);
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
