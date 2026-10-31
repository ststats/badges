// SOOP 로그인 쿠키(즐겨찾기 전용 글용): 저장된 암호문 풀기와 쿠키가 먹는지 확인(암호는 soop-board.mjs)
import { keepFresh } from './cache.mjs';
import { decryptCookie, readBoard } from './soop-board.mjs';
import { currentMembers } from './staruniv.mjs';
import { getCookieCipher } from './store.mjs';

// ----- 쿠키: 상태 화면에서 저장한 암호문(badge_files의 cookie)을 COOKIE_KEY로 푼다 -----
export const cookieKeyReady = () => (process.env.COOKIE_KEY || '').length >= 16;

export async function currentCookie() {
    if (!cookieKeyReady()) return '';
    const stored = await getCookieCipher();
    if (!stored) return '';
    try {
        return await decryptCookie(stored, process.env.COOKIE_KEY);
    } catch (e) {
        console.error('쿠키 암호문을 풀지 못했습니다(COOKIE_KEY가 바뀌었나요?):', e.message);
        return '';
    }
}

// ----- 쿠키 확인 -----
// 지금 멤버 게시판 하나를 이 쿠키로 읽어 본다. 잘못되거나 만료된 쿠키면 SOOP이 오류를 준다.
// 쿠키 없이 읽어도 안 되면 SOOP 쪽 문제라 쿠키 탓으로 보지 않는다(unavailable).
export async function checkCookie(cookie) {
    const [member] = await currentMembers();
    if (!member) throw new Error('확인에 쓸 멤버가 없습니다');
    try {
        await readBoard(member.soopId, { cookie });
    } catch (e) {
        const soopDown = await readBoard(member.soopId).then(
            () => false,
            () => true
        );
        throw Object.assign(e, { unavailable: soopDown });
    }
}

// /status: state none(쿠키 없음) | error(SOOP이 거절) | unknown(SOOP이 안 됨) | ok. 30초 기억한다.
export const cookieStatus = keepFresh(
    async () => {
        const cookie = await currentCookie();
        if (!cookie) return { state: 'none' };
        try {
            await checkCookie(cookie);
            return { state: 'ok' };
        } catch (e) {
            return { state: e.unavailable ? 'unknown' : 'error', error: e.message };
        }
    },
    { label: '쿠키 확인' }
);
