import { verifyActionsIdentity } from '../src/actions-identity.mjs';
import { collectPosts } from '../src/autopost.mjs';
import { config } from '../src/config.mjs';
import { sendJson } from '../src/http.mjs';
import { currentCookie } from '../src/live.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    try {
        const bearer = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))?.[1];
        await verifyActionsIdentity(bearer);
    } catch { return sendJson(res, 401, { error: 'GitHub Actions identity required' }); }
    try {
        // 쿠키/복호화 키는 Vercel 안에만 남는다. 오류 시 공개 목록으로 대체하지 않는다.
        const cookie = await currentCookie();
        // 최신 하나만 등록하므로 첫 페이지로 충분하다. 장기간 중단 뒤 과거 페이지를 순회하지 않는다.
        const posts = await collectPosts({ soopId: config.soopId, cookie });
        return sendJson(res, 200, { posts });
    } catch {
        return sendJson(res, 502, { error: 'SOOP source unavailable; check saved cookie and favorite access' });
    }
}
