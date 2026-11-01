import crypto from 'node:crypto';
import { validDeliveryLease } from './autopost-delivery.mjs';
import { postTime, latestPost } from './autopost.mjs';
import { validSoopId, validTitleNo } from './lib.mjs';

export function validDetectorSecret(given, expected) {
    if (typeof expected !== 'string' || expected.length < 16 || typeof given !== 'string') return false;
    const hash = x => crypto.createHash('sha256').update(x).digest();
    return crypto.timingSafeEqual(hash(given), hash(expected));
}

export async function detectAndDispatch({ soopId, posts, rpc, secret, dispatch }) {
    if (!posts.length) return { dispatched: false, reason: 'empty' };
    const latest = latestPost(posts);
    if (!Number.isSafeInteger(Number(latest.titleNo)) || !Number.isFinite(postTime(latest)))
        throw new Error('Invalid latest post');
    const claim = await rpc('badge_autopost_claim', {
        p_secret: secret,
        p_soop_id: soopId,
        p_title_no: Number(latest.titleNo),
        p_reg_date: latest.regDate,
    });
    if (!claim?.lease) return { dispatched: false, reason: claim?.reason || 'unchanged' };
    try {
        await dispatch({ lease: claim.lease, titleNo: String(latest.titleNo), target: soopId });
        // 요청 접수는 등록 완료가 아니다. 완료 확인은 워커가 이력 저장 후 보낸다.
        return { dispatched: true };
    } catch {
        // 응답 불명 뒤 같은 워크플로가 다시 실행되어도 게시자 쪽의 번호 기록/pending이 중복 글을 막는다.
        await rpc('badge_autopost_result', { p_secret: secret, p_lease: claim.lease, p_status: 'retry' }).catch(
            () => {}
        );
        throw new Error('Workflow dispatch failed');
    }
}

// 켠 멤버의 게시판을 한꺼번에 읽고(느린 SOOP이 감지 시간 60초를 넘기지 않게), 새 글이 있는 첫 멤버만 실행을 요청한다.
// 같은 워크플로는 대기 실행을 하나만 두고 더 새 요청이 오면 앞 대기를 취소하므로, 다른 멤버의 실행이 끝나기 전에는
// DB가 'busy'로 돌려보낸다. 나머지 멤버는 다음 감지(2분 뒤)에 본다.
export async function detectTargets({ targets, collect, ...rest }) {
    const collected = await Promise.allSettled(targets.map(({ soopId }) => collect(soopId)));
    const results = {};
    for (const [i, { soopId }] of targets.entries()) {
        try {
            // 한 멤버의 SOOP·감지 실패가 다른 멤버의 감지를 막지 않는다.
            if (collected[i].status !== 'fulfilled') throw collected[i].reason;
            const result = await detectAndDispatch({ ...rest, soopId, posts: collected[i].value });
            results[soopId] = result.dispatched ? 'dispatched' : result.reason;
            if (result.dispatched) break;
        } catch {
            results[soopId] = 'failed';
        }
    }
    return results;
}

export async function dispatchPosting(token, fetcher = fetch, { diagnoseOnly = false, lease, titleNo, target } = {}) {
    if (!token) throw new Error('Missing GitHub dispatch credential');
    if (!validSoopId(target)) throw new Error('Invalid delivery input');
    if (!diagnoseOnly && (!validDeliveryLease(lease) || !validTitleNo(titleNo)))
        throw new Error('Invalid delivery input');
    const response = await fetcher(
        'https://api.github.com/repos/ststats/badges/actions/workflows/autopost.yml/dispatches',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({
                ref: 'main',
                inputs: diagnoseOnly
                    ? { diagnose_only: true, target }
                    : { delivery_lease: lease, delivery_title: titleNo, target },
            }),
            signal: AbortSignal.timeout(10000),
        }
    );
    if (response.status !== 204) throw new Error('Workflow dispatch rejected');
}
