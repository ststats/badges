// 서버(Vercel 함수)가 저장소 파일을 읽고 커밋한다. 토큰은 환경 변수 GITHUB_TOKEN(ststats/badges Contents 쓰기).
const repo = () =>
    process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
        ? `${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
        : 'ststats/badges';

async function gh(path, init = {}) {
    const token = process.env.GITHUB_TOKEN;
    // 공개 저장소라 읽기는 토큰 없이도 된다(시간당 60번 제한). 쓰기는 토큰이 있어야 한다.
    if (!token && init.method === 'PUT') throw Object.assign(new Error('Vercel 환경 변수 GITHUB_TOKEN이 없습니다'), { status: 500 });
    const res = await fetch(`https://api.github.com/repos/${repo()}/contents/${path}`, {
        ...init,
        headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(10000),
    });
    return res;
}

// { content, sha } 또는 없으면 null
export async function readFile(path) {
    const res = await gh(`${path}?ref=main&t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status}`), { status: 502 });
    const data = await res.json();
    return { content: Buffer.from(data.content, 'base64').toString('utf-8'), sha: data.sha };
}

// sha가 다르면(그사이 바뀜) 409를 던진다
export async function writeFile(path, content, sha, message) {
    const res = await gh(path, {
        method: 'PUT',
        body: JSON.stringify({ message, content: Buffer.from(content, 'utf-8').toString('base64'), sha, branch: 'main' }),
    });
    if (res.status === 409 || res.status === 422)
        throw Object.assign(new Error('그사이 다른 곳에서 바뀌었습니다. 다시 불러온 뒤 고쳐 주세요'), { status: 409 });
    if (res.status === 401 || res.status === 403 || res.status === 404)
        throw Object.assign(new Error(`GITHUB_TOKEN으로 저장소에 쓸 수 없습니다(GitHub ${res.status}). 토큰 권한을 확인해 주세요`), { status: 500 });
    if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status}`), { status: 502 });
    return (await res.json()).content.sha;
}
