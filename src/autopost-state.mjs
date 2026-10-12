// 전용 orphan 브랜치에는 글 번호와 등록 상태만 저장한다. 본문/사진/쿠키는 저장하지 않는다.
export async function githubState({ repository, token }) {
    if (!/^[\w.-]+\/[\w.-]+$/.test(repository || '') || !token) throw new Error('GitHub 저장소/토큰 설정이 필요합니다');
    const branch = 'autopost-state';
    const path = 'state.json';
    let sha;
    const api = async (endpoint, method = 'GET', body) => {
        const res = await fetch(`https://api.github.com/repos/${repository}/${endpoint}`, {
            method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
            body: body && JSON.stringify(body), signal: AbortSignal.timeout(20000),
        });
        if (res.status === 404 && method === 'GET') return null;
        if (!res.ok) throw new Error(`GitHub 상태 저장 실패 (${res.status})`);
        return res.json();
    };
    const ref = await api(`git/ref/heads/${branch}`);
    if (!ref) {
        const tree = await api('git/trees', 'POST', { tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: '자동 등록 상태 전용. 본문과 인증 정보는 저장하지 않습니다.\n' }] });
        const commit = await api('git/commits', 'POST', { message: 'Initialize automatic posting state', tree: tree.sha, parents: [] });
        await api('git/refs', 'POST', { ref: `refs/heads/${branch}`, sha: commit.sha });
    }
    const file = await api(`contents/${path}?ref=${branch}`);
    sha = file?.sha;
    const state = file ? JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) : null;
    if (state && (state.version !== 1 || !Number.isFinite(state.since) || !state.done || typeof state.done !== 'object' || Array.isArray(state.done))) {
        throw new Error('자동 등록 상태 파일이 올바르지 않습니다');
    }
    return {
        state,
        async save(value) {
            const saved = await api(`contents/${path}`, 'PUT', {
                message: 'Update automatic posting state', branch,
                content: Buffer.from(JSON.stringify(value, null, 2) + '\n').toString('base64'),
                ...(sha ? { sha } : {}),
            });
            sha = saved.content.sha;
        },
    };
}
