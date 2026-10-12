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
        const posts = await collectPosts({ soopId: config.soopId, cookie: await currentCookie() });
        const result = await detectAndDispatch({ posts, secret, rpc, dispatch: () => dispatchPosting(process.env.GITHUB_DISPATCH_TOKEN) });
        return sendJson(res, 200, result);
    } catch {
        return sendJson(res, 502, { error: 'Detector failed; check saved SOOP cookie, migration and dispatch credential' });
    }
}
