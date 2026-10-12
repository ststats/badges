// SOOP 게시판 읽기와 로그인 쿠키(즐겨찾기 전용 글용), 일정 읽기
import crypto from 'node:crypto';
import { config } from './config.mjs';
import { boardApiUrl, recentOwnPosts } from './lib.mjs';
import { getFile } from './store.mjs';

// ----- 쿠키: 편집 화면에서 저장한 암호문(badge_files의 cookie)을 COOKIE_KEY로 푼다 -----
const cookieCipherKey = () => crypto.createHash('sha256').update(process.env.COOKIE_KEY || '').digest();
export const cookieKeyReady = () => (process.env.COOKIE_KEY || '').length >= 16;

export function encryptCookie(cookie) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cookieCipherKey(), iv);
    const body = Buffer.concat([cipher.update(cookie, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64') + '\n';
}

export function decryptCookie(text) {
    const raw = Buffer.from(text.trim(), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', cookieCipherKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

async function currentCookie() {
    if (!cookieKeyReady()) return '';
    const stored = (await getFile('cookie'))?.content;
    if (!stored) return '';
    try {
        return decryptCookie(stored);
    } catch (e) {
        console.error('쿠키 암호문을 풀지 못했습니다(COOKIE_KEY가 바뀌었나요?):', e.message);
        return '';
    }
}

// ----- 게시판 -----
// 같은 API가 .com과 .co.kr 두 주소에 있어, 쿠키로 읽다가 하나가 안 되면 다른 쪽을 쓴다
async function fetchBoard(cookie) {
    const get = async host => {
        const headers = cookie
            ? { Cookie: cookie, Referer: `https://www.sooplive.co.kr/station/${config.soopId}/board`, 'User-Agent': 'Mozilla/5.0' }
            : {};
        const res = await fetch(boardApiUrl(config.soopId, host), { headers, signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`SOOP 게시판 HTTP ${res.status}`);
        const board = await res.json();
        if (!Array.isArray(board?.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');
        return recentOwnPosts(board, config.soopId, 20);
    };
    try {
        return await get('api-channel.sooplive.com');
    } catch (e) {
        if (!cookie) throw e;
        return get('api-channel.sooplive.co.kr');
    }
}

// 공개 목록(public)과 쿠키로 본 목록(mine)을 각각 30초 기억한다.
// SOOP이 잠깐 안 되면 직전에 받은 목록을 6시간까지 대신 쓴다(커뮤니티에 깨진 이미지가 뜨지 않게).
const CACHE_MS = 30000;
const FALLBACK_MS = 6 * 3600 * 1000;
const boards = { public: {}, mine: {} };
let lastCookieError = '';

async function loadBoard(kind) {
    if (kind === 'public') return fetchBoard('');
    const cookie = await currentCookie();
    if (!cookie) return board('public');
    try {
        const posts = await fetchBoard(cookie);
        lastCookieError = '';
        return posts;
    } catch (e) {
        // 잘못되거나 만료된 쿠키면 SOOP이 500을 준다. 그때는 공개 글로 대신한다.
        lastCookieError = e.message;
        console.error('쿠키로 게시판 읽기 실패:', e.message);
        return board('public');
    }
}

function board(kind) {
    const slot = boards[kind];
    if (slot.request && Date.now() - slot.at < CACHE_MS) return slot.request;
    const request = loadBoard(kind).then(
        posts => ((slot.good = { at: Date.now(), posts }), posts),
        e => {
            if (slot.good && Date.now() - slot.good.at < FALLBACK_MS) {
                console.error(`SOOP 게시판 실패, 직전 목록을 씁니다: ${e.message}`);
                return slot.good.posts;
            }
            throw e;
        }
    );
    Object.assign(slot, { at: Date.now(), request });
    request.catch(() => { if (slot.request === request) slot.request = null; });
    return request;
}

// 새 쿠키를 저장한 뒤 바로 반영되게 기억을 지운다
export const forgetBoards = () => { boards.public.request = boards.mine.request = null; };

export const recentPosts = () => board('mine').then(posts => posts.slice(0, config.noticeCount));

const extraPosts = (mine, pub) => {
    const pubIds = new Set(pub.map(p => p.titleNo));
    return mine.filter(p => !pubIds.has(p.titleNo));
};

// 편집 화면이 새 쿠키를 저장하기 전에 SOOP이 받아 주는지 본다. 공개 목록에 없는 글 수를 돌려준다.
export async function checkCookie(cookie) {
    const [mine, pub] = await Promise.all([fetchBoard(cookie), board('public')]);
    return extraPosts(mine, pub).length;
}

// /status: 쿠키로 받은 목록에 공개 목록에 없는 글이 있으면 즐겨찾기 글까지 받고 있는 것
export async function cookieStatus() {
    const [cookie, mine, pub] = await Promise.all([currentCookie(), board('mine'), board('public')]);
    return { hasCookie: !!cookie, error: lastCookieError, extra: extraPosts(mine, pub), posts: mine.slice(0, config.noticeCount) };
}

// ----- 일정 -----
export const scheduleFile = async () => (await getFile('schedule')) || { content: '', version: null };
