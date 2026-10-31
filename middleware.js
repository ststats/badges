import { rewrite } from '@vercel/functions/middleware';
import { latestRaceSha, raceCacheSeconds } from './src/rider-race.mjs';

// /rider/latest.webp · /rider/latest.json: 그 순간 rider-race 브랜치 커밋의 파일을 Vercel이 받아 그대로 전한다.
// 주소가 끝까지 이 사이트로 남고(GitHub로 넘기지 않음), 함수 응답 크기 제한(4.5MB)도 받지 않는다(경기 WebP 약 7MB).
export const config = { matcher: ['/rider/latest.webp', '/rider/latest.json'] };

const RAW = 'https://raw.githubusercontent.com/ststats/badges';
let cached = { until: 0, sha: '' };

export default async function middleware(request) {
    const file = new URL(request.url).pathname.split('/').pop();
    const keep = raceCacheSeconds();
    try {
        if (Date.now() >= cached.until)
            cached = { until: Date.now() + keep * 1000, sha: await latestRaceSha(process.env.GITHUB_DISPATCH_TOKEN) };
    } catch {
        // 커밋을 못 읽으면 브랜치 주소로 전한다(GitHub 쪽 5분 캐시라 늦을 수 있지만 그림은 나온다)
        return rewrite(`${RAW}/rider-race/${file}`, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=10' } });
    }
    return rewrite(`${RAW}/${cached.sha}/${file}`, {
        headers: { 'Cache-Control': `public, max-age=0, s-maxage=${keep}` },
    });
}
