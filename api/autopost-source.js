import { verifyActionsIdentity } from '../src/actions-identity.mjs';
import { collectPosts } from '../src/autopost.mjs';
import { readJson, sendJson } from '../src/http.mjs';
import { currentCookie } from '../src/live.mjs';
import { getTargets } from '../src/store.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    try {
        const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))?.[1];
        await verifyActionsIdentity(bearer);
    } catch {
        return sendJson(res, 401, { error: 'GitHub Actions identity required' });
    }
    let soopId;
    try {
        ({ soopId } = await readJson(req, 1024));
    } catch {
        return sendJson(res, 400, { error: 'Invalid target' });
    }
    try {
        // 켜 둔 멤버만 받는다. 게시판·이름·시작 시각도 상태 화면 설정에서만 정한다.
        const target = (await getTargets()).find(t => t.enabled && t.soopId === soopId);
        if (!target) return sendJson(res, 404, { error: 'Target is not enabled' });
        // 쿠키/복호화 키는 Vercel 안에만 남는다. 최신 하나만 등록하므로 첫 페이지로 충분하다.
        const posts = await collectPosts({ soopId, cookie: await currentCookie() });
        const since = Date.parse(target.enabledAt);
        return sendJson(res, 200, {
            posts,
            target: { soopId, name: target.name, board: target.board, since },
        });
    } catch {
        return sendJson(res, 502, { error: 'SOOP source unavailable' });
    }
}
