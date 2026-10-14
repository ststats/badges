// 상태 화면의 쿠키 바꾸기. 비밀번호(EDIT_PASSWORD)를 확인하고 Supabase(badge_files)에 암호문으로 넣는다(바로 반영).
//   POST /api/save {password, file:'check'}              → 비밀번호만 확인
//   POST /api/save {password, file:'cookie', cookie}     → SOOP에서 먹는지 보고 암호화해 저장
import crypto from 'node:crypto';
import { readJson, sendJson } from '../src/http.mjs';
import { checkCookie, cookieKeyReady, encryptCookie, forgetBoards } from '../src/live.mjs';
import { putCookieCipher } from '../src/store.mjs';

const httpError = (status, message) => Object.assign(new Error(message), { status });

function checkPassword(given) {
    const want = process.env.EDIT_PASSWORD || '';
    if (want.length < 4) throw httpError(500, 'Vercel 환경 변수 EDIT_PASSWORD(4자 이상)가 없습니다');
    const hash = s =>
        crypto
            .createHash('sha256')
            .update(String(s ?? ''))
            .digest();
    return crypto.timingSafeEqual(hash(given), hash(want));
}

async function saveCookie({ cookie }) {
    if (!cookieKeyReady()) throw httpError(500, 'Vercel 환경 변수 COOKIE_KEY(16자 이상)가 없습니다');
    // 크롬에서 복사할 때 딸려 오는 'cookie:' 머리말과 줄바꿈은 뗀다
    cookie = String(cookie || '')
        .replace(/^\s*cookie\s*:\s*/i, '')
        .replace(/[\r\n]+/g, '')
        .trim();
    if (cookie.length < 20 || !cookie.includes('='))
        throw httpError(400, '쿠키 값이 아닌 것 같아요. Request Headers의 cookie 값 전체를 붙여 넣어 주세요.');
    let extraCount;
    try {
        extraCount = await checkCookie(cookie);
    } catch (e) {
        throw httpError(400, `SOOP이 이 쿠키를 받지 않았어요(${e.message}). 로그인한 상태에서 다시 복사해 주세요.`);
    }
    await putCookieCipher(encryptCookie(cookie));
    forgetBoards();
    return { extraCount };
}

const ACTIONS = { check: async () => ({ ok: true }), cookie: saveCookie };

export default async function handler(req, res) {
    try {
        if (req.method !== 'POST') throw httpError(405, 'POST만 됩니다');
        const body = await readJson(req);
        const action = Object.hasOwn(ACTIONS, body.file) && ACTIONS[body.file];
        if (!action) throw httpError(400, '알 수 없는 요청입니다');
        if (!checkPassword(body.password)) {
            await new Promise(r => setTimeout(r, 1200)); // 마구 넣어 보기를 늦춘다
            throw httpError(401, '비밀번호가 틀렸어요');
        }
        sendJson(res, 200, await action(body));
    } catch (e) {
        if (!e.status) console.error(e);
        sendJson(res, e.status || 500, { error: e.message || '저장하지 못했습니다' });
    }
}
