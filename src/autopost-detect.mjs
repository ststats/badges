import crypto from 'node:crypto';
import { postTime } from './autopost.mjs';

export function validDetectorSecret(given, expected) {
    if (typeof expected !== 'string' || expected.length < 16 || typeof given !== 'string') return false;
    const hash = x => crypto.createHash('sha256').update(x).digest();
    return crypto.timingSafeEqual(hash(given), hash(expected));
}

export async function detectAndDispatch({ posts, rpc, secret, dispatch }) {
    if (!posts.length) return { dispatched: false, reason: 'empty' };
    const latest = [...posts].sort((a, b) => postTime(b) - postTime(a) || Number(b.titleNo) - Number(a.titleNo))[0];
    if (!Number.isSafeInteger(Number(latest.titleNo)) || !Number.isFinite(postTime(latest))) throw new Error('Invalid latest post');
    const claim = await rpc('badge_autopost_claim', { p_secret: secret, p_title_no: Number(latest.titleNo), p_reg_date: latest.regDate });
    if (!claim?.lease) return { dispatched: false, reason: claim?.reason || 'unchanged' };
    try {
        await dispatch();
        await rpc('badge_autopost_finish', { p_secret: secret, p_lease: claim.lease, p_success: true });
        return { dispatched: true };
    } catch {
        // 응답 불명 뒤 같은 워크플로가 다시 실행되어도 게시자 쪽의 번호 기록/pending이 중복 글을 막는다.
        await rpc('badge_autopost_finish', { p_secret: secret, p_lease: claim.lease, p_success: false }).catch(() => {});
        throw new Error('Workflow dispatch failed');
    }
}

export async function dispatchPosting(token, fetcher = fetch, { diagnoseOnly = false } = {}) {
    if (!token) throw new Error('Missing GitHub dispatch credential');
    const response = await fetcher('https://api.github.com/repos/ststats/badges/actions/workflows/autopost.yml/dispatches', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: JSON.stringify({ ref: 'main', ...(diagnoseOnly ? { inputs: { diagnose_only: true, publish_latest: false, recover_pending: '' } } : {}) }), signal: AbortSignal.timeout(10000),
    });
    if (response.status !== 204) throw new Error('Workflow dispatch rejected');
}
