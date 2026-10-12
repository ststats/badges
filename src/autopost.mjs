// 자동 등록에는 뱃지의 캐시/공개 글 대체를 사용하지 않는다.
import { boardApiUrl, recentOwnPosts, escapeHTML, postUrl } from './lib.mjs';

export const BOARD = 'pan_sojuyang';
export const postTime = p => Date.parse(String(p.regDate).replace(' ', 'T') + '+09:00');

export async function collectPosts({ soopId, cookie, since, fetcher = fetch }) {
    if (!cookie) throw new Error('SOOP_COOKIE 또는 저장된 SOOP 쿠키와 COOKIE_KEY가 필요합니다');
    const found = new Map();
    for (let page = 1; page <= 100; page++) {
        const url = new URL(boardApiUrl(soopId));
        url.searchParams.set('page', page);
        const res = await fetcher(url, {
            headers: { Cookie: cookie, Referer: `https://www.sooplive.co.kr/station/${soopId}/board`, 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) throw new Error(`SOOP 수집 실패 (${res.status}), 공개 글로 대체하지 않았습니다`);
        const board = await res.json();
        if (!Array.isArray(board.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');
        if (page === 1) {
            const publicRes = await fetcher(url, { signal: AbortSignal.timeout(15000) });
            if (!publicRes.ok) throw new Error('즐겨찾기 접근 검증용 공개 목록 조회 실패');
            const publicBoard = await publicRes.json();
            if (!Array.isArray(publicBoard.contents)) throw new Error('공개 목록 응답 확인 실패');
            const publicIds = new Set(recentOwnPosts(publicBoard, soopId, Infinity).map(p => String(p.titleNo)));
            if (!recentOwnPosts(board, soopId, Infinity).some(p => !publicIds.has(String(p.titleNo)))) {
                // 만료 쿠키에 200 + 공개 목록만 주는 경우도 있다. 접근을 확인하지 못하면 조용히 누락시키지 않는다.
                throw new Error('즐겨찾기 글 접근을 확인하지 못했습니다. SOOP 쿠키 또는 최근 즐겨찾기 글 유무를 확인하세요');
            }
        }
        const own = recentOwnPosts(board, soopId, Infinity);
        for (const p of own) {
            if (!Number.isFinite(postTime(p))) throw new Error('SOOP 글 날짜를 확인할 수 없습니다');
            if (!since || postTime(p) >= since) found.set(String(p.titleNo), p);
        }
        // 최초 실행은 현재 시각을 기준으로 시작한다. 과거 글은 자동으로 올리지 않는다.
        if (!since || page >= Number(board.meta?.totalPages || 1)) break;
        // 고정 공지는 contents 순서와 별개이므로 페이지 종료 기준에서 제외한다.
        const dates = board.contents.map(postTime);
        if (dates.length && dates.every(t => Number.isFinite(t) && t < since)) break;
        if (page === 100) throw new Error('수집 범위를 초과했습니다. 기준 시각을 확인하세요');
    }
    return [...found.values()].sort((a, b) => postTime(a) - postTime(b));
}

export function newPosts(state, posts) {
    if (state.pending) throw new Error(`SOOP ${state.pending.id} 등록 결과 확인 필요: 자동 재전송을 중단했습니다`);
    return posts.filter(p => postTime(p) >= state.since && !Object.hasOwn(state.done, String(p.titleNo)));
}

export function articleBody(soopId, post, uploads) {
    if (!uploads.length) throw new Error('완성된 공지 이미지가 없습니다');
    return uploads.map(x => `<p><img src="${escapeHTML(x.fileUrl)}" alt="공지 전체 ${x.part}" style="max-width:100%;height:auto"></p>`).join('')
        + `<p><a href="${escapeHTML(postUrl(soopId, post.titleNo))}">SOOP 원문 보기</a></p>`;
}

export const coolingDown = (state, now = Date.now()) => Number.isFinite(state.lastPostedAt) && now - state.lastPostedAt < 5 * 60000;

export async function publishPosts({ state, posts, save, prepare, publish, now = Date.now }) {
    const candidates = newPosts(state, posts);
    if (coolingDown(state, now()) || !candidates.length) return state;
    // 배열 순서와 무관하게 최신 하나만 선택한다. 밀린 글을 루프로 전송하지 않는다.
    const post = [...candidates].sort((a, b) => postTime(b) - postTime(a) || Number(b.titleNo) - Number(a.titleNo))[0];
        // 이미지 생성·업로드 실패는 글을 보내기 전이므로 다음 실행에서 다시 준비해도 된다.
        const prepared = await prepare(post);
        for (const older of candidates) {
            if (String(older.titleNo) !== String(post.titleNo)) state.done[String(older.titleNo)] = 'skipped';
        }
        state.pending = { id: String(post.titleNo), at: new Date().toISOString() };
        await save(state); // 영구 저장에 성공하기 전에는 등록 요청을 보내지 않는다.
        const articleId = await publish(post, prepared);
        state.done[String(post.titleNo)] = articleId;
        state.lastPostedAt = now();
        delete state.pending;
        await save(state); // 응답 이후 저장이 실패해도 원격 pending이 남아 재전송을 막는다.
    return state;
}
