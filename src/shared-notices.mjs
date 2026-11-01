import { createHash, timingSafeEqual } from 'node:crypto';
import { recentOwnPosts, validSoopId } from './lib.mjs';

import { publicPost, readBoard } from './soop-board.mjs';
import { bearerToken, sendJson } from './http.mjs';

export function sharedNoticeHandler({ secret, currentCookie, fetcher = fetch }) {
    return async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
        const bearer = bearerToken(req);
        const hash = text => createHash('sha256').update(text).digest();
        if (!secret || secret.length < 16 || !bearer || !timingSafeEqual(hash(bearer), hash(secret)))
            return sendJson(res, 401, { error: 'Server authentication required' });
        const params = new URL(req.url, 'https://localhost').searchParams;
        const id = (params.get('soop_id') || '').toLowerCase();
        const page = Number(params.get('page') || 1);
        if (!validSoopId(id) || !Number.isSafeInteger(page) || page < 1 || page > 1000)
            return sendJson(res, 400, { error: 'Invalid notice page' });
        try {
            const cookie = await currentCookie();
            if (!cookie) return sendJson(res, 503, { error: 'Cookie unavailable' });
            const board = await readBoard(id, { cookie, page, perPage: 10, fetcher });
            const posts = recentOwnPosts(board, id, Infinity).map(publicPost);
            const total = Number(board.meta?.totalPages);
            return sendJson(res, 200, { posts, totalPages: Number.isSafeInteger(total) && total > 0 ? total : 1 });
        } catch {
            /* generic failure only */
        }
        return sendJson(res, 502, { error: 'Notice source unavailable' });
    };
}
