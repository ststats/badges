import { validDetectorSecret, detectAndDispatch, dispatchPosting } from '../src/autopost-detect.mjs';
import { collectPosts } from '../src/autopost.mjs';
import { currentCookie } from '../src/live.mjs';
import { config } from '../src/config.mjs';
import { rpc } from '../src/store.mjs';
import { sendJson } from '../src/http.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    const secret = process.env.BADGE_WRITE_SECRET;
    const given = /^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))?.[1];
    if (!validDetectorSecret(given, secret)) return sendJson(res, 401, { error: 'Unauthorized' });
    if (process.env.AUTOPOST_DETECT_ENABLED !== 'true') return sendJson(res, 200, { dispatched: false, reason: 'disabled' });
    if (!process.env.GITHUB_DISPATCH_TOKEN) return sendJson(res, 503, { error: 'Dispatch credential missing' });
    try {
        // 공유 비밀로 인증한 운영 진단만 허용한다. 감지 상태를 변경하거나 글을 쓰지 않는다.
        if (req.query?.check === 'dispatch') {
            await dispatchPosting(process.env.GITHUB_DISPATCH_TOKEN, fetch, { diagnoseOnly: true });
            return sendJson(res, 200, { diagnosticDispatched: true });
        }
        const posts = await collectPosts({ soopId: config.soopId, cookie: await currentCookie() });
        const result = await detectAndDispatch({ posts, secret, rpc, dispatch: () => dispatchPosting(process.env.GITHUB_DISPATCH_TOKEN) });
        return sendJson(res, 200, result);
    } catch {
        return sendJson(res, 502, { error: 'Detector failed; check saved SOOP cookie, migration and dispatch credential' });
    }
}
