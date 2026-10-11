// Vercel 함수가 쓰는 데이터: SOOP 게시판(30초 기억)과 배포에 같이 들어간 schedule.txt
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recentOwnPosts } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf-8'));

let boardCache = { at: 0, request: null };
export function recentPosts() {
    if (boardCache.request && Date.now() - boardCache.at < 30000) return boardCache.request;
    const request = (async () => {
        const url = `https://api-channel.sooplive.com/v1.1/channel/${encodeURIComponent(config.soopId)}/board?perPage=20&page=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (!res.ok) throw new Error(`SOOP 게시판 HTTP ${res.status}`);
        const board = await res.json();
        if (!Array.isArray(board?.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');
        return recentOwnPosts(board, config.soopId, config.noticeCount);
    })();
    boardCache = { at: Date.now(), request };
    request.catch(() => { if (boardCache.request === request) boardCache = { at: 0, request: null }; });
    return request;
}

// 편집 화면에서 저장하면 커밋 → Vercel이 다시 배포하므로 파일만 읽으면 된다
export const scheduleText = () => fs.readFile(path.join(root, 'schedule.txt'), 'utf-8');

export const query = req => new URL(req.url, 'http://localhost').searchParams;
