// POST /api/preview {content, now}: 편집 화면 미리보기. 저장 전 일정으로 실제 뱃지와 같은 그림을 SVG로 그린다
// (PNG로 바꾸는 단계를 건너뛰어 빠르다).
import { config } from '../src/config.mjs';
import { readJson } from '../src/http.mjs';
import { kstToday, parseSchedule, weekSchedule } from '../src/lib.mjs';
import { renderSchedule } from '../src/render.mjs';

const YEAR_MS = 366 * 864e5;

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') throw new Error('POST만 됩니다');
        const body = await readJson(req);
        const real = Date.now();
        const now = Math.min(Math.max(Number(body.now) || real, real - YEAR_MS), real + YEAR_MS); // 다음 주·지난 주 보기
        const days = weekSchedule(parseSchedule(String(body.content || ''), now), now);
        const svg = await renderSchedule({ name: config.name, soopId: config.soopId, footer: config.schedule?.footer, days, today: kstToday(real), format: 'svg' });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(svg);
    } catch (e) {
        res.statusCode = e.status || 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(String(e.message || e));
    }
}
