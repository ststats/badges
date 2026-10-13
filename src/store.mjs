// 일정·쿠키 저장소: 스타유니브 Supabase의 badge_files 표(supabase/badges.sql). 저장하면 바로 반영된다.
// 일정은 badge_get, 쿠키는 BADGE_WRITE_SECRET을 검증하는 badge_get_secret으로 읽는다.
// 쓰기는 같은 서버 비밀값을 검증하는 badge_put으로 한다.
// Supabase가 잠깐 안 되면 직전에 읽은 값을 쓴다.
import { config } from './config.mjs';

const MEMO_MS = 10000; // 같은 함수 인스턴스 안에서는 10초 기억(뱃지 요청마다 DB를 부르지 않게)
const memo = new Map();
const lastGood = new Map();

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

// { content, version } 또는 아무것도 없으면 null
export async function getFile(name) {
    const hit = memo.get(name);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
    let value;
    try {
        const row = (await (name === 'cookie'
            ? rpc('badge_get_secret', { p_secret: process.env.BADGE_WRITE_SECRET || '' })
            : rpc('badge_get', { p_name: name })))?.[0];
        value = row ? { content: row.content, version: row.updated_at } : null;
        lastGood.set(name, value);
    } catch (e) {
        console.error(`badge_get(${name}) 실패:`, e.message);
        value = lastGood.get(name) ?? null;
    }
    memo.set(name, { at: Date.now(), value });
    return value;
}

// 새 version을 돌려준다. expected가 있고 그사이 바뀌었으면 409.
export async function putFile(name, content, expected) {
    const secret = process.env.BADGE_WRITE_SECRET;
    if (!secret) throw Object.assign(new Error('Vercel 환경 변수 BADGE_WRITE_SECRET이 없습니다'), { status: 500 });
    try {
        const version = await rpc('badge_put', { p_name: name, p_content: content, p_secret: secret, p_expected: expected || null });
        const value = { content, version };
        memo.set(name, { at: Date.now(), value });
        lastGood.set(name, value);
        return version;
    } catch (e) {
        if (e.code === '40001') throw Object.assign(new Error('그사이 다른 곳에서 바뀌었습니다. 다시 불러온 뒤 고쳐 주세요'), { status: 409 });
        if (e.code === '42501') throw Object.assign(new Error('BADGE_WRITE_SECRET이 Supabase Vault의 badge_write_secret과 다릅니다'), { status: 500 });
        if (e.code === 'PGRST202' || e.status === 404) throw Object.assign(new Error('Supabase에 badge_put 함수가 없습니다. supabase/badges.sql을 실행해 주세요'), { status: 500 });
        throw Object.assign(new Error(`Supabase 저장 실패: ${e.message}`), { status: 502 });
    }
}
