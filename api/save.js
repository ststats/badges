// 편집 화면의 읽기·저장. 저장은 비밀번호(EDIT_PASSWORD)를 확인하고 서버의 GITHUB_TOKEN으로 커밋한다.
//   GET  /api/save                                → { content, sha } (schedule.txt, 최신)
//   POST /api/save {password, file:'schedule', content, sha}
//   POST /api/save {password, file:'cookie', cookie}   → SOOP에서 먹는지 보고 암호화해 cookie.enc로
//   POST /api/save {password, file:'check'}            → 비밀번호만 확인
import crypto from 'node:crypto';
import { readFile, writeFile } from '../src/github.mjs';
import { parseSchedule } from '../src/lib.mjs';
import { checkCookie, cookieKeyReady, encryptCookie } from '../src/live.mjs';

const send = (res, status, body) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(JSON.stringify(body));
};

async function readJson(req) {
    if (req.body && typeof req.body === 'object') return req.body;
    let raw = '';
    for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 65536) throw new Error('너무 깁니다');
    }
    return JSON.parse(raw || '{}');
}

function passwordOk(given) {
    const want = process.env.EDIT_PASSWORD || '';
    if (want.length < 4) return null; // 설정 안 됨
    const a = crypto.createHash('sha256').update(String(given || '')).digest();
    const b = crypto.createHash('sha256').update(want).digest();
    return crypto.timingSafeEqual(a, b);
}

export default async function handler(req, res) {
    try {
        if (req.method === 'GET') return send(res, 200, (await readFile('schedule.txt')) || { content: '', sha: null });
        if (req.method !== 'POST') return send(res, 405, { error: 'GET·POST만 됩니다' });

        const body = await readJson(req);
        const ok = passwordOk(body.password);
        if (ok === null) return send(res, 500, { error: 'Vercel 환경 변수 EDIT_PASSWORD(4자 이상)가 없습니다' });
        if (!ok) {
            await new Promise(r => setTimeout(r, 1200)); // 마구 넣어 보기를 늦춘다
            return send(res, 401, { error: '비밀번호가 틀렸어요' });
        }
        if (body.file === 'check') return send(res, 200, { ok: true });

        if (body.file === 'schedule') {
            const content = String(body.content || '');
            if (content.length > 60000) return send(res, 400, { error: '일정이 너무 깁니다' });
            const { errors } = parseSchedule(content, Date.now());
            if (errors.length) return send(res, 400, { error: `읽지 못하는 줄이 있어요: ${errors.slice(0, 3).join(' / ')}` });
            const sha = await writeFile('schedule.txt', content, body.sha || undefined, '일정 수정(편집 화면)');
            return send(res, 200, { sha });
        }

        if (body.file === 'cookie') {
            if (!cookieKeyReady()) return send(res, 500, { error: 'Vercel 환경 변수 COOKIE_KEY(16자 이상)가 없습니다' });
            // 크롬에서 복사할 때 딸려 오는 'cookie:' 머리말과 줄바꿈은 뗀다
            const cookie = String(body.cookie || '').replace(/^\s*cookie\s*:\s*/i, '').replace(/[\r\n]+/g, '').trim();
            if (cookie.length < 20 || !cookie.includes('=')) return send(res, 400, { error: '쿠키 값이 아닌 것 같아요. Request Headers의 cookie 값 전체를 붙여 넣어 주세요.' });
            let extraCount;
            try {
                extraCount = await checkCookie(cookie);
            } catch (e) {
                return send(res, 400, { error: `SOOP이 이 쿠키를 받지 않았어요(${e.message}). 로그인한 상태에서 다시 복사해 주세요.` });
            }
            const prev = await readFile('cookie.enc');
            await writeFile('cookie.enc', encryptCookie(cookie), prev?.sha, 'SOOP 쿠키 바꿈(편집 화면, 암호문)');
            return send(res, 200, { extraCount });
        }
        send(res, 400, { error: '알 수 없는 요청입니다' });
    } catch (e) {
        console.error(e);
        send(res, e.status || 500, { error: e.message || '저장하지 못했습니다' });
    }
}
