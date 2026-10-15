// 상태 화면의 저장. 비밀번호(EDIT_PASSWORD)를 확인하고 Supabase에 넣는다(바로 반영).
//   POST /api/save {password, file:'check'}                         → 비밀번호만 확인
//   POST /api/save {password, file:'cookie', cookie}                → SOOP에서 먹는지 보고 암호화해 저장
//   POST /api/save {password, file:'targets', targets:[{soopId, enabled, board}]} → 멤버별 자동 등록 설정
import crypto from 'node:crypto';
import { boardName } from '../src/autopost.mjs';
import { readJson, sendJson } from '../src/http.mjs';
import { checkCookie, cookieKeyReady, cookieStatus, encryptCookie } from '../src/live.mjs';
import { currentMembers } from '../src/staruniv.mjs';
import { putCookieCipher, putTargets } from '../src/store.mjs';

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
    try {
        await checkCookie(cookie);
    } catch (e) {
        throw httpError(400, `SOOP이 이 쿠키를 받지 않았어요(${e.message}). 로그인한 상태에서 다시 복사해 주세요.`);
    }
    await putCookieCipher(encryptCookie(cookie));
    cookieStatus.forget();
    return { ok: true };
}

// 지금 멤버만 받는다. 이름은 스타유니브 멤버 목록에서, 게시판은 주소나 이름(pan_…)에서 뽑는다.
// 게시판을 비운 멤버는 저장하지 않는다(켜 둘 수 없다).
async function saveTargets({ targets }) {
    if (!Array.isArray(targets) || targets.length > 100) throw httpError(400, '알 수 없는 요청입니다');
    const members = new Map((await currentMembers()).map(m => [m.soopId.toLowerCase(), m]));
    const rows = [];
    for (const t of targets) {
        const member = members.get(String(t?.soopId || '').toLowerCase());
        if (!member) throw httpError(400, '지금 멤버가 아닌 SOOP ID가 있어요. 새로고침해 주세요.');
        const raw = String(t.board || '').trim();
        const board = raw ? boardName(raw) : null;
        if (raw && !board) throw httpError(400, `${member.name}: 와고 게시판 주소를 확인해 주세요(예: pan_이름).`);
        if (t.enabled === true && !board) throw httpError(400, `${member.name}: 켜려면 와고 게시판을 넣어 주세요.`);
        if (board)
            rows.push({ soopId: member.soopId.toLowerCase(), name: member.name, board, enabled: t.enabled === true });
    }
    return { targets: await putTargets(rows) };
}

const ACTIONS = { check: async () => ({ ok: true }), cookie: saveCookie, targets: saveTargets };

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
