import { createRemoteJWKSet, jwtVerify } from 'jose';

export const ISSUER = 'https://token.actions.githubusercontent.com';
export const AUDIENCE = 'badges-soju-autopost';
const keys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`), { timeoutDuration: 5000 });
const subjects = [
    'repo:ststats/badges:ref:refs/heads/main',
    'repo:ststats@322625611/badges@1413985650:ref:refs/heads/main',
];

// GitHub가 서명한 이 저장소 main의 자동 등록 워크플로만 허용한다.
export async function verifyActionsIdentity(token, jwks = keys) {
    if (typeof token !== 'string' || token.length > 20000) throw new Error('Invalid identity');
    const { payload } = await jwtVerify(token, jwks, {
        issuer: ISSUER,
        audience: AUDIENCE,
        algorithms: ['RS256'],
        maxTokenAge: '10m',
        clockTolerance: 5,
        requiredClaims: [
            'exp',
            'iat',
            'nbf',
            'sub',
            'repository_id',
            'repository_owner_id',
            'ref',
            'workflow_ref',
            'event_name',
        ],
    });
    if (
        !subjects.includes(payload.sub) ||
        payload.repository_id !== '1413985650' ||
        payload.repository_owner_id !== '322625611' ||
        payload.ref !== 'refs/heads/main' ||
        payload.workflow_ref !== 'ststats/badges/.github/workflows/autopost.yml@refs/heads/main' ||
        payload.event_name !== 'workflow_dispatch'
    )
        throw new Error('Untrusted workflow');
    return payload;
}
