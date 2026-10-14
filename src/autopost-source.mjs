import { AUDIENCE } from './actions-identity.mjs';

async function authorizedRequest(endpoint, body, env, fetcher) {
    if (!env.ACTIONS_ID_TOKEN_REQUEST_URL || !env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)
        throw new Error('GitHub OIDC is required');
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
    const response = await fetcher(`https://staruniv-badges.vercel.app/api/${endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(65000),
    });
    if (!response.ok) throw new Error(`Vercel autopost request failed (${response.status})`);
    return response.json();
}

export async function vercelPosts(env = process.env, fetcher = fetch) {
    const data = await authorizedRequest('autopost-source', {}, env, fetcher);
    if (!Array.isArray(data.posts)) throw new Error('Invalid SOOP source response');
    return data.posts;
}

export async function reportDelivery(lease, status, env = process.env, fetcher = fetch) {
    const data = await authorizedRequest('autopost-result', { lease, status }, env, fetcher);
    if (data.accepted !== true) throw new Error('Delivery result was not accepted');
}
