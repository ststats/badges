// SOOP 로그인 쿠키(즐겨찾기 전용 글용): 암호화 저장·풀기와 쿠키가 먹는지 확인
import crypto from 'node:crypto';
import { boardApiUrl } from './lib.mjs';
import { keepFresh } from './cache.mjs';
import { currentMembers } from './staruniv.mjs';
import { getCookieCipher } from './store.mjs';

// ----- 쿠키: 상태 화면에서 저장한 암호문(badge_files의 cookie)을 COOKIE_KEY로 푼다 -----
const cookieCipherKey = () =>
    crypto
        .createHash('sha256')
        .update(process.env.COOKIE_KEY || '')
        .digest();
export const cookieKeyReady = () => (process.env.COOKIE_KEY || '').length >= 16;

export function encryptCookie(cookie) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', cookieCipherKey(), iv);
    const body = Buffer.concat([cipher.update(cookie, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64') + '\n';
}

export function decryptCookie(text) {
    const raw = Buffer.from(text.trim(), 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', cookieCipherKey(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

export async function currentCookie() {
    if (!cookieKeyReady()) return '';
    const stored = await getCookieCipher();
    if (!stored) return '';
    try {
        return decryptCookie(stored);
    } catch (e) {
        console.error('쿠키 암호문을 풀지 못했습니다(COOKIE_KEY가 바뀌었나요?):', e.message);
        return '';
    }
}

// ----- 쿠키 확인 -----
// 지금 멤버 게시판 하나를 이 쿠키로 읽어 본다. 잘못되거나 만료된 쿠키면 SOOP이 오류를 준다.
// 같은 API가 .com과 .co.kr 두 주소에 있어 하나가 안 되면 다른 쪽을 본다.
export async function checkCookie(cookie) {
    const [member] = await currentMembers();
    if (!member) throw new Error('확인에 쓸 멤버가 없습니다');
    let lastError;
    for (const host of ['api-channel.sooplive.com', 'api-channel.sooplive.co.kr']) {
        try {
            const res = await fetch(boardApiUrl(member.soopId, host), {
                headers: {
                    Cookie: cookie,
                    Referer: `https://www.sooplive.co.kr/station/${member.soopId}/board`,
                    'User-Agent': 'Mozilla/5.0',
                },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) throw new Error(`SOOP 게시판 HTTP ${res.status}`);
            if (!Array.isArray((await res.json())?.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');
            return;
        } catch (e) {
            lastError = e;
        }
    }
    throw lastError;
}

// /status: state none(쿠키 없음) | error(SOOP이 거절) | ok. 30초 기억한다.
export const cookieStatus = keepFresh(
    async () => {
        const cookie = await currentCookie();
        if (!cookie) return { state: 'none' };
        try {
            await checkCookie(cookie);
            return { state: 'ok' };
        } catch (e) {
            return { state: 'error', error: e.message };
        }
    },
    { label: '쿠키 확인' }
);
