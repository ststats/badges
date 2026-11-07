import { currentMembers } from '../src/staruniv.mjs';
import { sendJson } from '../src/http.mjs';

export default async function handler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET만 됩니다' });
    try {
        sendJson(res, 200, await currentMembers());
    } catch {
        sendJson(res, 502, { error: '멤버 목록을 불러오지 못했습니다' });
    }
}
