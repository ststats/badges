import { createHash, timingSafeEqual } from 'node:crypto';
import { boardApiUrl, recentOwnPosts } from './lib.mjs';
import { sendJson } from './http.mjs';

export function sharedNoticeHandler({ secret, currentCookie, fetcher = fetch }) {
    return async (req, res) => {
        if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET only' });
        const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))?.[1];
        const hash = text => createHash('sha256').update(text).digest();
        if (!secret || secret.length < 16 || !bearer || !timingSafeEqual(hash(bearer), hash(secret)))
            return sendJson(res, 401, { error: 'Server authentication required' });
        const params = new URL(req.url, 'https://localhost').searchParams;
        const id = (params.get('soop_id') || '').toLowerCase();
        const page = Number(params.get('page') || 1);
        if (!/^[a-z0-9_]{1,50}$/.test(id) || !Number.isSafeInteger(page) || page < 1 || page > 1000)
            return sendJson(res, 400, { error: 'Invalid notice page' });
        try {
            const cookie = await currentCookie();
            if (!cookie) return sendJson(res, 503, { error: 'Cookie unavailable' });
            for (const host of ['api-channel.sooplive.com', 'api-channel.sooplive.co.kr']) {
                try {
                    const url = new URL(boardApiUrl(id, host));
                    url.searchParams.set('page', String(page));
                    url.searchParams.set('perPage', '10');
                    const response = await fetcher(url, {
                        headers: { Cookie: cookie, Referer: `https://www.sooplive.co.kr/station/${id}/board`, 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
                        redirect: 'error', signal: AbortSignal.timeout(8000),
                    });
                    if (!response.ok) continue;
                    const board = await response.json();
                    if (!Array.isArray(board?.contents)) continue;
                    const posts = recentOwnPosts(board, id, Infinity).map(p => ({
                        titleNo: p.titleNo, titleName: p.titleName ?? null, regDate: p.regDate ?? null,
                        userId: p.userId ?? null, userNick: p.userNick ?? null,
                        content: p.content ? { textContent: p.content.textContent ?? '', content: p.content.content ?? '' } : null,
                        display: p.display ? { bbsName: p.display.bbsName ?? '' } : null,
                        count: p.count ? { likeCnt: p.count.likeCnt ?? 0, readCnt: p.count.readCnt ?? 0 } : null,
                        photos: Array.isArray(p.photos) ? p.photos.map(x => ({ url: x?.url ?? '' })).filter(x => x.url) : [],
                    }));
                    const total = Number(board.meta?.totalPages);
                    return sendJson(res, 200, { posts, totalPages: Number.isSafeInteger(total) && total > 0 ? total : 1 });
                } catch { /* never include cookie or upstream errors */ }
            }
        } catch { /* generic failure only */ }
        return sendJson(res, 502, { error: 'Notice source unavailable' });
    };
}
