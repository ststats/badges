import { validDetectorSecret, detectTargets, dispatchPosting } from '../src/autopost-detect.mjs';
import { collectPosts } from '../src/autopost.mjs';
import { validSoopId } from '../src/lib.mjs';
import { currentCookie } from '../src/live.mjs';
import { getTargets, rpc } from '../src/store.mjs';
import { bearerToken, sendJson } from '../src/http.mjs';
import { currentMembers } from '../src/staruniv.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    const secret = process.env.BADGE_WRITE_SECRET;
    if (!validDetectorSecret(bearerToken(req), secret)) return sendJson(res, 401, { error: 'Unauthorized' });
    if (process.env.AUTOPOST_DETECT_ENABLED !== 'true')
        return sendJson(res, 200, { dispatched: false, reason: 'disabled' });
    if (!process.env.GITHUB_DISPATCH_TOKEN) return sendJson(res, 503, { error: 'Dispatch credential missing' });
    try {
        // 켜 둔 지금 멤버만(퇴단한 멤버는 켜져 있어도 올리지 않는다)
        const current = new Set((await currentMembers()).map(m => m.soopId.toLowerCase()));
        const targets = (await getTargets()).filter(t => t.enabled && validSoopId(t.soopId) && current.has(t.soopId));
        // 공유 비밀로 인증한 운영 진단만 허용한다. 감지 상태를 변경하거나 글을 쓰지 않는다.
        if (req.query?.check === 'dispatch') {
            const target = targets.find(t => t.soopId === req.query.target) || targets[0];
            if (!target) return sendJson(res, 409, { error: 'No enabled target' });
            await dispatchPosting(process.env.GITHUB_DISPATCH_TOKEN, fetch, {
                diagnoseOnly: true,
                target: target.soopId,
            });
            return sendJson(res, 200, { diagnosticDispatched: true });
        }
        if (!targets.length) return sendJson(res, 200, { dispatched: false, reason: 'no_target' });
        const cookie = await currentCookie();
        const results = await detectTargets({
            targets,
            collect: soopId => collectPosts({ soopId, cookie }),
            secret,
            rpc,
            dispatch: delivery => dispatchPosting(process.env.GITHUB_DISPATCH_TOKEN, fetch, delivery),
        });
        return sendJson(res, 200, { results });
    } catch {
        return sendJson(res, 502, { error: 'Detector failed; check migration, targets and dispatch credential' });
    }
}
