import { validSoopId, validTitleNo } from './lib.mjs';

// 전용 orphan 브랜치에 멤버마다 targets/<SOOP ID>.json으로 글 번호와 등록 상태만 저장한다. 본문/사진/쿠키는 저장하지 않는다.
// 멤버를 처음 켠 뒤 첫 등록 때 since(켠 시각)로 새 파일을 만든다(그 뒤로는 처음 켠 시각을 그대로 쓴다).
// 파일이 없는데 since도 모르면(설정을 못 읽은 실행) 아직 기록이 없다는 뜻으로 state를 null로 준다.
export async function githubState({ repository, token, soopId, since }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token) throw new Error('GitHub 저장소/토큰 설정이 필요합니다');
    if (!validSoopId(soopId)) throw new Error('자동 등록 대상 확인 실패');
    const branch = 'autopost-state';
    const path = `targets/${soopId}.json`;
    let sha;
    const api = async (endpoint, method = 'GET', body) => {
        const res = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, {
            method,
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
            },
            body: body && JSON.stringify(body),
            signal: AbortSignal.timeout(20000),
        });
        if (res.status === 404 && method === 'GET') return null;
        if (!res.ok) throw new Error(`GitHub 상태 저장 실패 (${res.status})`);
        return res.json();
    };
    const ref = await api(`git/ref/heads/${branch}`);
    if (!ref) throw new Error('자동 등록 이력 브랜치가 없습니다. 이력 복원이 필요합니다');
    const file = await api(`contents/${path}?ref=${branch}`);
    if (!file && !(Number.isFinite(since) && since > 0)) return { state: null };
    sha = file?.sha;
    const state = file
        ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
        : { version: 1, since, done: {} };
    if (
        !state ||
        state.version !== 1 ||
        !Number.isFinite(state.since) ||
        state.since <= 0 ||
        !state.done ||
        typeof state.done !== 'object' ||
        Array.isArray(state.done) ||
        Object.entries(state.done).some(
            ([id, value]) =>
                !validTitleNo(id) ||
                !((Number.isSafeInteger(value) && value > 0) || ['baseline', 'skipped'].includes(value))
        ) ||
        (state.lastPostedAt !== undefined && (!Number.isFinite(state.lastPostedAt) || state.lastPostedAt <= 0)) ||
        (state.pending && (!validTitleNo(state.pending.id) || !Number.isFinite(Date.parse(state.pending.at))))
    ) {
        throw new Error('자동 등록 상태 파일이 올바르지 않습니다');
    }
    return {
        state,
        async save(value) {
            const saved = await api(`contents/${path}`, 'PUT', {
                message: `Update automatic posting state (${soopId})`,
                branch,
                content: Buffer.from(JSON.stringify(value, null, 2) + '\n').toString('base64'),
                sha,
            });
            sha = saved.content.sha;
        },
    };
}
