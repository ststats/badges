// 자동 등록: 상태 화면에서 켠 멤버(SOOP ID)의 새 글을 그 멤버의 와고 게시판에 올린다. SOOP은 캐시 없이 직접 조회한다.
import { createHash } from 'node:crypto';
import { boardApiUrl, recentOwnPosts, escapeHTML, postUrl } from './lib.mjs';

export const validSoopId = id => /^[a-z0-9_]{1,50}$/.test(id || '');
export const validBoard = board => /^[a-z0-9_]{2,60}$/.test(board || '');

// 게시판 주소(https://ygosu.com/board/pan_x/…)나 이름(pan_x)에서 게시판 이름만
export function boardName(input) {
    const text = String(input || '').trim();
    const match = /^(?:https?:\/\/(?:www\.)?ygosu\.com)?\/?(?:board\/)?([a-z0-9_]+)\/?(?:[?#].*)?$/i.exec(text);
    const board = match?.[1].toLowerCase();
    return validBoard(board) ? board : null;
}

export function postingKey(board, titleNo) {
    if (!validBoard(board) || !/^[1-9]\d*$/.test(String(titleNo))) throw new Error('와고 등록 원문 번호 확인 실패');
    return createHash('sha256').update(`${board}:${titleNo}`).digest('hex');
}

// 게시판에 '공지' 분류가 있으면 그 코드, 없으면 null(분류 없이 올린다)
export function noticeCategoryCode(links, board) {
    for (const link of links) {
        if (String(link.text).trim() !== '공지') continue;
        const url = new URL(link.href, 'https://ygosu.com');
        const code = url.searchParams.get('s_category');
        if (
            url.origin === 'https://ygosu.com' &&
            url.pathname.replace(/\/$/, '') === `/board/${board}` &&
            /^C[a-zA-Z0-9._-]+$/.test(code || '')
        )
            return code;
    }
    return null;
}
export const postTime = p => Date.parse(String(p.regDate).replace(' ', 'T') + '+09:00');

export function articleSubject(post, name) {
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(post.regDate)) || !Number.isFinite(postTime(post)))
        throw new Error('공지 제목 날짜 확인 실패');
    return `${post.regDate.slice(2, 10).replaceAll('-', '')} ${name} 공지`;
}

// 첫 페이지 본인 글. 쿠키가 있으면 즐겨찾기 글까지 받고, 쿠키가 없거나 SOOP이 거절하면 공개 글만 받는다.
export async function collectPosts({ soopId, cookie, fetcher = fetch }) {
    if (!validSoopId(soopId)) throw new Error('SOOP ID 확인 실패');
    const url = new URL(boardApiUrl(soopId));
    const read = async headers => {
        const res = await fetcher(url, { headers, signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`SOOP 수집 실패 (${res.status})`);
        const board = await res.json();
        if (!Array.isArray(board?.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');
        return board;
    };
    let board;
    if (cookie)
        board = await read({
            Cookie: cookie,
            Referer: `https://www.sooplive.co.kr/station/${soopId}/board`,
            'User-Agent': 'Mozilla/5.0',
        }).catch(() => null);
    board ||= await read({});
    const own = recentOwnPosts(board, soopId, Infinity);
    for (const p of own) {
        if (!Number.isSafeInteger(Number(p.titleNo)) || Number(p.titleNo) <= 0 || !Number.isFinite(postTime(p))) {
            throw new Error('SOOP 글 번호/날짜를 확인할 수 없습니다');
        }
    }
    return own;
}

export const latestPost = posts =>
    [...posts].sort((a, b) => postTime(b) - postTime(a) || Number(b.titleNo) - Number(a.titleNo))[0];

export function newPosts(state, posts) {
    if (state.pending) throw new Error(`SOOP ${state.pending.id} 등록 결과 확인 필요: 자동 재전송을 중단했습니다`);
    return posts.filter(p => postTime(p) >= state.since && !Object.hasOwn(state.done, String(p.titleNo)));
}

export function postingCandidates(state, posts, includeLatest = false) {
    const fresh = newPosts(state, posts); // pending은 수동 테스트도 우회하지 않는다.
    if (!includeLatest) return fresh;
    const latest = latestPost(posts);
    if (!latest) return [];
    const done = state.done[String(latest.titleNo)];
    // 초기 기준/건너뛴 글만 일회성 등록 가능. 이미 등록한 최신 글이면 과거 글로 내려가지 않는다.
    if (Object.hasOwn(state.done, String(latest.titleNo)) && !['baseline', 'skipped'].includes(done)) return [];
    return [latest];
}

export function articleBody(soopId, post, uploads) {
    if (!uploads.length) throw new Error('완성된 공지 이미지가 없습니다');
    return (
        uploads
            .map(x => {
                if (
                    !/^S[a-zA-Z0-9._-]+$/.test(x.code || '') ||
                    new URL(x.fileUrl).searchParams.get('code') !== x.code
                ) {
                    throw new Error('와고 본문 이미지와 첨부 코드 불일치');
                }
                // 와고 편집기가 저장하는 첨부 참조. src만 있으면 V3가 editor 첨부와 본문 불일치로 거절한다.
                return `<p><img src="${escapeHTML(x.fileUrl)}" data-storage-code="${escapeHTML(x.code)}" alt="공지 전체 ${x.part}" style="max-width:100%;height:auto"></p>`;
            })
            .join('') +
        `<p style="text-align:right"><a href="${escapeHTML(postUrl(soopId, post.titleNo))}" target="_blank" rel="noopener noreferrer" style="display:inline-block;border:1px solid #e4e4e7;padding:7px 12px;background-color:#fafafa;color:#52525b;font-size:13px;font-weight:bold;text-decoration:none">원문 링크 ↗</a></p>`
    );
}

export const coolingDown = (state, now = Date.now()) =>
    Number.isFinite(state.lastPostedAt) && now - state.lastPostedAt < 5 * 60000;

// 운영자가 번호를 지정한 복구만 허용한다. 자동 실행은 계속 pending에서 멈춘다.
export async function recoverPending({ state, id, posts, prepare, publish, save, now = Date.now }) {
    if (!/^\d+$/.test(id || '') || state?.pending?.id !== id) throw new Error('복구할 미확정 글 번호 불일치');
    const age = now() - Date.parse(state.pending.at);
    if (!Number.isFinite(age) || age < 0 || age > 60 * 60000)
        throw new Error('미확정 글 복구 시간 초과: 등록 결과 수동 확인 필요');
    const post = posts.find(p => String(p.titleNo) === id);
    if (!post) throw new Error('복구할 원문을 찾지 못했습니다');
    const prepared = await prepare(post);
    // pending을 지우거나 새 번호로 옮기지 않는다. publisher는 원문 번호로 같은 멱등키를 만든다.
    const articleId = await publish(post, prepared);
    state.done[id] = articleId;
    state.lastPostedAt = now();
    delete state.pending;
    await save(state);
}

export async function publishPosts({ state, posts, save, prepare, publish, now = Date.now, includeLatest = false }) {
    const candidates = postingCandidates(state, posts, includeLatest);
    if (coolingDown(state, now()) || !candidates.length) return state;
    // 배열 순서와 무관하게 최신 하나만 선택한다. 밀린 글을 루프로 전송하지 않는다.
    const post = latestPost(candidates);
    // 이미지 생성·업로드 실패는 글을 보내기 전이므로 다음 실행에서 다시 준비해도 된다.
    const prepared = await prepare(post);
    for (const older of candidates) {
        if (String(older.titleNo) !== String(post.titleNo)) state.done[String(older.titleNo)] = 'skipped';
    }
    state.pending = { id: String(post.titleNo), at: new Date(now()).toISOString() };
    await save(state); // 영구 저장에 성공하기 전에는 등록 요청을 보내지 않는다.
    const articleId = await publish(post, prepared);
    state.done[String(post.titleNo)] = articleId;
    state.lastPostedAt = now();
    delete state.pending;
    await save(state); // 응답 이후 저장이 실패해도 원격 pending이 남아 재전송을 막는다.
    return state;
}
