// 일정·쿠키 저장소: 스타유니브 Supabase의 badge_files 표(supabase/badges.sql).
// 읽기는 공개 키로 badge_get, 쓰기는 BADGE_WRITE_SECRET을 붙여 badge_put. 저장하면 바로 반영된다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf-8'));

async function rpc(fn, args) {
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

// 같은 함수 인스턴스 안에서는 10초 기억한다(뱃지 요청마다 DB를 부르지 않게). 저장하면 바로 지운다.
const memo = new Map();
const MEMO_MS = 10000;

// { content, version } 또는 표에 없으면 null. Supabase가 안 되거나 표를 아직 안 만들었으면 undefined.
export async function getFile(name) {
    const hit = memo.get(name);
    if (hit && Date.now() - hit.at < MEMO_MS) return hit.value;
    let value;
    try {
        const rows = await rpc('badge_get', { p_name: name });
        value = rows?.[0] ? { content: rows[0].content, version: rows[0].updated_at } : null;
    } catch (e) {
        console.error(`badge_get(${name}) 실패:`, e.message);
        value = undefined;
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
        memo.set(name, { at: Date.now(), value: { content, version } });
        return version;
    } catch (e) {
        if (e.code === '40001') throw Object.assign(new Error('그사이 다른 곳에서 바뀌었습니다. 다시 불러온 뒤 고쳐 주세요'), { status: 409 });
        if (e.code === '42501') throw Object.assign(new Error('BADGE_WRITE_SECRET이 Supabase Vault의 badge_write_secret과 다릅니다'), { status: 500 });
        if (e.code === 'PGRST202' || e.status === 404)
            throw Object.assign(new Error('Supabase에 badge_put 함수가 없습니다. supabase/badges.sql을 실행해 주세요'), { status: 500 });
        throw Object.assign(new Error(`Supabase 저장 실패: ${e.message}`), { status: 502 });
    }
}
