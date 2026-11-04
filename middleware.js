import { rewrite } from '@vercel/functions/middleware';
import { latestRaceSha, raceCacheSeconds } from './src/rider-race.mjs';

// /rider/latest.webp · /rider/latest.json: 그 순간 rider-race 브랜치 커밋의 파일로 보낸다.
// 경기 WebP(약 21MB)는 GitHub 주소로 넘겨(302) 브라우저가 GitHub에서 바로 받게 한다. Vercel을 거쳐 전하면
// 보는 사람마다 그만큼 Vercel 전송량(무료 월 100GB)을 쓴다. 붙이는 주소는 그대로 이 사이트 주소다.
// latest.json은 작아서 지금처럼 Vercel이 받아 그대로 전한다(배지 페이지가 같은 사이트에서 읽는다).
export const config = { matcher: ['/rider/latest.webp', '/rider/latest.json'] };

const RAW = 'https://raw.githubusercontent.com/ststats/badges';
let cached = { until: 0, sha: '' };

const send = (file, url, sMaxAge) => {
    const headers = { 'Cache-Control': `public, max-age=0, s-maxage=${sMaxAge}` };
    return file === 'latest.webp'
        ? new Response(null, { status: 302, headers: { ...headers, Location: url } })
        : rewrite(url, { headers });
};

export default async function middleware(request) {
    const file = new URL(request.url).pathname.split('/').pop();
    const keep = raceCacheSeconds();
    try {
        if (Date.now() >= cached.until)
            cached = { until: Date.now() + keep * 1000, sha: await latestRaceSha(process.env.GITHUB_DISPATCH_TOKEN) };
    } catch {
        // 커밋을 못 읽으면 브랜치 주소로 보낸다(GitHub 쪽 5분 캐시라 늦을 수 있지만 그림은 나온다)
        return send(file, `${RAW}/rider-race/${file}`, 10);
    }
    return send(file, `${RAW}/${cached.sha}/${file}`, keep);
}
