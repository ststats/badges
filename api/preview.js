// POST /api/preview {content, now}: 편집 화면 미리보기. 저장 전 일정으로 실제 뱃지와 같은 그림(SVG)을 그린다.
import { kstToday, parseSchedule, weekSchedule } from '../src/lib.mjs';
import { config } from '../src/live.mjs';
import { renderSchedule } from '../src/render.mjs';

async function readJson(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 65536) throw new Error('too long');
    }
    return JSON.parse(raw || '{}');
}

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') throw new Error('POST만 됩니다');
        const body = await readJson(req);
        const real = Date.now();
        // 다음 주·지난 주 미리보기용. 1년 밖은 받지 않는다.
        const now = Math.min(Math.max(Number(body.now) || real, real - 366 * 864e5), real + 366 * 864e5);
        const days = weekSchedule(parseSchedule(String(body.content || ''), now), now);
        const svg = await renderSchedule({
            name: config.name, soopId: config.soopId, footer: config.schedule?.footer, days, today: kstToday(real), format: 'svg',
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(svg);
    } catch (e) {
        res.statusCode = 400;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(String(e.message || e));
    }
}
