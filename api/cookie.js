// POST /api/cookie {cookie}: 새 SOOP 쿠키가 먹는지 보고, 되면 COOKIE_KEY로 암호화해 돌려준다.
// 편집 화면이 그 암호문을 GitHub에 cookie.enc로 커밋한다(커밋은 브라우저의 GitHub 토큰으로만 된다).
import { checkCookie, cookieKeyReady, encryptCookie } from '../src/live.mjs';

async function readJson(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 32768) throw new Error('너무 깁니다');
    }
    return JSON.parse(raw || '{}');
}

const send = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
};

export default async function handler(req, res) {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST만 됩니다' });
    if (!cookieKeyReady()) return send(res, 500, { error: 'Vercel 환경 변수 COOKIE_KEY(16자 이상)가 없습니다. 넣고 Redeploy 해 주세요.' });
    let cookie;
    try {
        // 크롬에서 복사할 때 딸려 오는 'cookie:' 머리말과 줄바꿈은 뗀다
        cookie = String((await readJson(req)).cookie || '').replace(/^\s*cookie\s*:\s*/i, '').replace(/[\r\n]+/g, '').trim();
    } catch {
        return send(res, 400, { error: '요청을 읽지 못했습니다' });
    }
    if (cookie.length < 20 || !cookie.includes('=')) return send(res, 400, { error: '쿠키 값이 아닌 것 같아요. Request Headers의 cookie 값 전체를 붙여 넣어 주세요.' });
    let extraCount;
    try {
        extraCount = await checkCookie(cookie);
    } catch (e) {
        return send(res, 400, { error: `SOOP이 이 쿠키를 받지 않았어요(${e.message}). 로그인한 상태에서 다시 복사해 주세요.` });
    }
    send(res, 200, { extraCount, enc: encryptCookie(cookie) });
}
