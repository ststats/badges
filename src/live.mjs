// Vercel 함수가 쓰는 데이터: SOOP 게시판(30초 기억)과 배포에 같이 들어간 schedule.txt
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recentOwnPosts } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf-8'));

// 게시판 첫 쪽. 비밀 판(priv)은 Vercel 환경 변수 SOOP_COOKIE(본인 로그인 쿠키)를 붙여
// 즐겨찾기 전용 글까지 받는다. 같은 API가 .com과 .co.kr 두 주소에 있어 하나가 안 되면 다른 쪽을 쓴다.
async function fetchBoard(cookie) {
    try {
        return await fetchBoardFrom('api-channel.sooplive.com', cookie);
    } catch (e) {
        if (!cookie) throw e;
        return fetchBoardFrom('api-channel.sooplive.co.kr', cookie);
    }
}

async function fetchBoardFrom(host, cookie) {
    const url = `https://${host}/v1.1/channel/${encodeURIComponent(config.soopId)}/board?perPage=20&page=1`;
    const headers = cookie
        ? { Cookie: cookie, Referer: `https://www.sooplive.co.kr/station/${config.soopId}/board`, 'User-Agent': 'Mozilla/5.0' }
        : {};
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`SOOP 게시판 HTTP ${res.status}`);
    const board = await res.json();
    if (!Array.isArray(board?.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');
    return recentOwnPosts(board, config.soopId, 20);
}

let lastPrivateError = '';
const caches = { public: { at: 0, request: null }, private: { at: 0, request: null } };
function cachedBoard(priv) {
    const slot = caches[priv ? 'private' : 'public'];
    if (slot.request && Date.now() - slot.at < 30000) return slot.request;
    const request = priv
        ? // 쿠키가 없거나 만료돼 실패하면 공개 글로 대신한다
          (process.env.SOOP_COOKIE ? fetchBoard(process.env.SOOP_COOKIE) : Promise.reject(new Error('SOOP_COOKIE 없음'))).then(
              posts => ((lastPrivateError = ''), posts),
              e => {
                  // 잘못되거나 만료된 쿠키면 SOOP이 500을 준다
                  lastPrivateError = e.message;
                  console.error('비밀 판 게시판:', e.message);
                  return cachedBoard(false);
              }
          )
        : fetchBoard('');
    slot.at = Date.now();
    slot.request = request;
    request.catch(() => { if (slot.request === request) slot.request = null; });
    return request;
}

export const recentPosts = (priv = false) => cachedBoard(priv).then(posts => posts.slice(0, config.noticeCount));

// 비밀 판 상태(상태 화면용): 공개 목록에 없는 글이 보이면 즐겨찾기 글까지 받고 있는 것
export async function privateStatus() {
    const [mine, pub] = await Promise.all([cachedBoard(true), cachedBoard(false)]);
    const pubIds = new Set(pub.map(p => p.titleNo));
    return { hasCookie: !!process.env.SOOP_COOKIE, error: lastPrivateError, extra: mine.filter(p => !pubIds.has(p.titleNo)) };
}

// 주소의 p(비밀키)를 확인한다. 없으면 공개 판, 맞으면 비밀 판, 틀리면 null(404).
export function access(q) {
    const p = q.get('p');
    if (p === null) return { priv: false, prefix: '/' };
    const key = process.env.PRIVATE_KEY || '';
    if (key.length < 16) return null;
    const a = Buffer.from(p), b = Buffer.from(key);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return { priv: true, prefix: `/p/${key}/` };
}

export function notFound(res) {
    res.statusCode = 404;
    res.setHeader('Cache-Control', 'no-store');
    res.end('Not found');
}

// 편집 화면에서 저장하면 커밋 → Vercel이 다시 배포하므로 파일만 읽으면 된다
export const scheduleText = () => fs.readFile(path.join(root, 'schedule.txt'), 'utf-8');

export const query = req => new URL(req.url, 'http://localhost').searchParams;
