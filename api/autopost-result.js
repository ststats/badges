import { verifyActionsIdentity } from '../src/actions-identity.mjs';
import { validDeliveryLease } from '../src/autopost-delivery.mjs';
import { readJson, sendJson } from '../src/http.mjs';
import { rpc } from '../src/store.mjs';

export default async function handler(req, res) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'POST only' });
    try {
        await verifyActionsIdentity(/^Bearer (\S+)$/.exec(String(req.headers.authorization || ''))?.[1]);
    } catch {
        return sendJson(res, 401, { error: 'GitHub Actions identity required' });
    }
    let body;
    try {
        body = await readJson(req, 1024);
        if (!validDeliveryLease(body.lease) || !['complete', 'retry', 'blocked'].includes(body.status))
            throw new Error();
    } catch {
        return sendJson(res, 400, { error: 'Invalid delivery result' });
    }
    try {
        const accepted = await rpc('badge_autopost_result', {
            p_secret: process.env.BADGE_WRITE_SECRET,
            p_lease: body.lease,
            p_status: body.status,
        });
        return sendJson(res, accepted ? 200 : 409, { accepted });
    } catch {
        return sendJson(res, 502, { error: 'Delivery result could not be saved' });
    }
}
