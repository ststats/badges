// Vercel 함수가 쓰는 데이터: SOOP 게시판(30초 기억)과 배포에 같이 들어간 schedule.txt
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { boardApiUrl, recentOwnPosts } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf-8'));

// 게시판 첫 쪽. Vercel 환경 변수 SOOP_COOKIE(본인 로그인 쿠키)가 있으면 붙여서
// 즐겨찾기 전용 글까지 받는다(사용자 요청: 본인만 쓰는 주소라 공개판에 넣음). 같은 API가 .com과 .co.kr 두 주소에 있어 하나가 안 되면 다른 쪽을 쓴다.
async function fetchBoard(cookie) {
    try {
        return await fetchBoardFrom('api-channel.sooplive.com', cookie);
    } catch (e) {
        if (!cookie) throw e;
        return fetchBoardFrom('api-channel.sooplive.co.kr', cookie);
    }
}

async function fetchBoardFrom(host, cookie) {
    const url = boardApiUrl(config.soopId, host);
    const headers = cookie
        ? { Cookie: cookie, Referer: `https://www.sooplive.co.kr/station/${config.soopId}/board`, 'User-Agent': 'Mozilla/5.0' }
        : {};
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`SOOP 게시판 HTTP ${res.status}`);
    const board = await res.json();
    if (!Array.isArray(board?.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');
    return recentOwnPosts(board, config.soopId, 20);
}

// 쿠키는 편집 화면이 커밋한 cookie.enc(COOKIE_KEY로 암호화)를 먼저 쓰고, 없으면 환경 변수 SOOP_COOKIE.
// 저장소는 공개라 암호문만 두고, 열쇠(COOKIE_KEY)는 Vercel 환경 변수에만 있다.
const cookieCipherKey = () => crypto.createHash('sha256').update(process.env.COOKIE_KEY || '').digest();

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

let cookiePromise = null;
export const cookieKeyReady = () => (process.env.COOKIE_KEY || '').length >= 16;
function currentCookie() {
    return (cookiePromise ||= (async () => {
        if (cookieKeyReady()) {
            try {
                return { cookie: decryptCookie(await fs.readFile(path.join(root, 'cookie.enc'), 'utf-8')), source: 'edit' };
            } catch (e) {
                if (e.code !== 'ENOENT') console.error('cookie.enc를 풀지 못했습니다(COOKIE_KEY가 바뀌었나요?):', e.message);
            }
        }
        return { cookie: process.env.SOOP_COOKIE || '', source: process.env.SOOP_COOKIE ? 'env' : 'none' };
    })());
}

// 편집 화면이 새 쿠키를 저장하기 전에 SOOP이 받아 주는지 본다. 공개 목록에 없는 글 수를 돌려준다.
export async function checkCookie(cookie) {
    const [mine, pub] = await Promise.all([fetchBoard(cookie), fetchBoard('')]);
    const pubIds = new Set(pub.map(p => p.titleNo));
    return mine.filter(p => !pubIds.has(p.titleNo)).length;
}

let lastCookieError = '';
let boardCache = { at: 0, request: null };
async function cachedBoard() {
    if (boardCache.request && Date.now() - boardCache.at < 30000) return boardCache.request;
    const { cookie } = await currentCookie();
    if (boardCache.request && Date.now() - boardCache.at < 30000) return boardCache.request;
    const request = cookie
        ? fetchBoard(cookie).then(
              posts => ((lastCookieError = ''), posts),
              e => {
                  // 잘못되거나 만료된 쿠키면 SOOP이 500을 준다. 그때는 공개 글로 대신한다.
                  lastCookieError = e.message;
                  console.error('쿠키로 게시판 읽기 실패:', e.message);
                  return fetchBoard('');
              }
          )
        : fetchBoard('');
    boardCache = { at: Date.now(), request };
    request.catch(() => { if (boardCache.request === request) boardCache = { at: 0, request: null }; });
    return request;
}

export const recentPosts = () => cachedBoard().then(posts => posts.slice(0, config.noticeCount));

// /status 화면용: 쿠키로 받은 목록에 공개 목록에 없는 글이 있으면 즐겨찾기 글까지 받고 있는 것
export async function cookieStatus() {
    const [mine, pub] = await Promise.all([cachedBoard(), fetchBoard('')]);
    const pubIds = new Set(pub.map(p => p.titleNo));
    const { source } = await currentCookie();
    return { hasCookie: source !== 'none', source, error: lastCookieError, extra: mine.filter(p => !pubIds.has(p.titleNo)) };
}

// 편집 화면에서 저장하면 커밋 → Vercel이 다시 배포하므로 파일만 읽으면 된다
export const scheduleText = () => fs.readFile(path.join(root, 'schedule.txt'), 'utf-8');

export const query = req => new URL(req.url, 'http://localhost').searchParams;
