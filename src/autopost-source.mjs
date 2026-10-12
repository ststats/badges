import { AUDIENCE } from './actions-identity.mjs';

export async function vercelPosts(since, env = process.env, fetcher = fetch) {
    if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) throw new Error('GitHub OIDC is required');
    const url = new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
    if (url.protocol !== 'https:') throw new Error('Invalid GitHub identity endpoint');
    url.searchParams.set('audience', AUDIENCE);
    const identity = await fetcher(url, {
        headers: { Authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` },
        signal: AbortSignal.timeout(15000),
    });
    if (!identity.ok) throw new Error('GitHub identity request failed');
    const { value: token } = await identity.json();
    if (typeof token !== 'string' || !token) throw new Error('Missing GitHub identity');
    const response = await fetcher('https://staruniv-badges.vercel.app/api/autopost-source', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ since: since || null }), signal: AbortSignal.timeout(65000),
    });
    if (!response.ok) throw new Error(`Vercel SOOP source failed (${response.status})`);
    const data = await response.json();
    if (!Array.isArray(data.posts)) throw new Error('Invalid SOOP source response');
    return data.posts;
}
