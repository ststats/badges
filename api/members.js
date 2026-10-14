import { starSchedule } from '../src/staruniv.mjs';
import { sendJson } from '../src/http.mjs';

export default async function handler(req, res) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'GET만 됩니다' });
    try {
        const { members } = await starSchedule();
        sendJson(
            res,
            200,
            members
                .filter(m => m['SOOP ID'] != null && String(m['SOOP ID']).trim() && !m['퇴단일'])
                .map(m => ({ name: m['이름'], soopId: String(m['SOOP ID']) }))
        );
    } catch {
        sendJson(res, 502, { error: '멤버 목록을 불러오지 못했습니다' });
    }
}
