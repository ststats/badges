// Vercel 함수 공용: 주소 값 읽기, JSON 본문 읽기·보내기
export const query = req => new URL(req.url, 'http://localhost').searchParams;

export async function readJson(req, limit = 65536) {
    if (req.body && typeof req.body === 'object') return req.body; // Vercel이 미리 읽어 둔 경우
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > limit) throw Object.assign(new Error('요청이 너무 깁니다'), { status: 413 });
    }
    return JSON.parse(raw || '{}');
}

export function sendJson(res, status, body) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
}
