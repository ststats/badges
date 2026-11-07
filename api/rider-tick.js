import { validDetectorSecret } from '../src/autopost-detect.mjs';
import { bearerToken, sendJson } from '../src/http.mjs';
import { dispatchRace, raceSlot } from '../src/rider-race.mjs';

// pg_cron(supabase/rider-tick.sql)이 2분마다 부른다. 10분에 한 번 캄몬라이더 경기 녹화를 띄운다.
export default async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    if (!validDetectorSecret(bearerToken(req), process.env.BADGE_WRITE_SECRET))
        return sendJson(res, 401, { error: 'Unauthorized' });
    if (!raceSlot()) return sendJson(res, 200, { dispatched: false, reason: 'not_slot' });
    try {
        await dispatchRace(process.env.GITHUB_DISPATCH_TOKEN);
        return sendJson(res, 200, { dispatched: true });
    } catch {
        return sendJson(res, 502, { error: 'Race dispatch failed; check dispatch credential' });
    }
}
