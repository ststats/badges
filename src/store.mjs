// 저장소: 스타유니브 Supabase의 badge_files 표(supabase/badges.sql)에 암호화된 SOOP 쿠키 하나만 둔다.
// 읽기(badge_get_secret)·쓰기(badge_put) 모두 BADGE_WRITE_SECRET을 DB가 확인한다. 일정은 api_schedule에서 읽는다(src/staruniv.mjs).
import { config } from './config.mjs';

const MEMO_MS = 10000; // 같은 함수 인스턴스 안에서는 10초 기억(뱃지 요청마다 DB를 부르지 않게)
let memo = null;
let lastGood = null;

export async function rpc(fn, args) {
    const { url, key } = config.supabase;
    const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: AbortSignal.timeout(8000),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(body?.message || `Supabase ${res.status}`), { code: body?.code, status: res.status });
    return body;
}

// 저장된 쿠키 암호문, 없으면 null. Supabase가 잠깐 안 되면 직전에 읽은 값을 쓴다.
export async function getCookieCipher() {
    if (memo && Date.now() - memo.at < MEMO_MS) return memo.value;
    let value;
    try {
        value = (await rpc('badge_get_secret', { p_secret: process.env.BADGE_WRITE_SECRET || '' }))?.[0]?.content ?? null;
        lastGood = value;
    } catch (e) {
        console.error('badge_get_secret 실패:', e.message);
        value = lastGood;
    }
    memo = { at: Date.now(), value };
    return value;
}

export async function putCookieCipher(content) {
    const secret = process.env.BADGE_WRITE_SECRET;
    if (!secret) throw Object.assign(new Error('Vercel 환경 변수 BADGE_WRITE_SECRET이 없습니다'), { status: 500 });
    try {
        await rpc('badge_put', { p_name: 'cookie', p_content: content, p_secret: secret });
        memo = { at: Date.now(), value: content };
        lastGood = content;
    } catch (e) {
        if (e.code === '42501') throw Object.assign(new Error('BADGE_WRITE_SECRET이 Supabase Vault의 badge_write_secret과 다릅니다'), { status: 500 });
        if (e.code === 'PGRST202' || e.status === 404) throw Object.assign(new Error('Supabase에 badge_put 함수가 없습니다. supabase/badges.sql을 실행해 주세요'), { status: 500 });
        throw Object.assign(new Error(`Supabase 저장 실패: ${e.message}`), { status: 502 });
    }
}
