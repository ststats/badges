import { query, sendJson } from '../src/http.mjs';
import { latestRaceSha, raceCacheSeconds } from '../src/rider-race.mjs';

// /rider/latest.webp · /rider/latest.json → 지금 rider-race 브랜치 커밋의 파일로 보낸다(정각에 바로 바뀐다).
// 파일이 커서(약 7MB) 함수가 직접 내보내지 않고 GitHub의 고정 주소로 넘긴다.
const FILES = new Set(['latest.webp', 'latest.json']);
let cached = { until: 0, sha: '' };

export default async function handler(req, res) {
    const file = query(req).get('f');
    if (!FILES.has(file)) return sendJson(res, 404, { error: 'Not found' });
    try {
        const keep = raceCacheSeconds();
        if (Date.now() >= cached.until)
            cached = {
                until: Date.now() + keep * 1000,
                sha: await latestRaceSha(process.env.GITHUB_DISPATCH_TOKEN),
            };
        res.statusCode = 302;
        res.setHeader('Location', `https://raw.githubusercontent.com/ststats/badges/${cached.sha}/${file}`);
        res.setHeader('Cache-Control', `public, max-age=0, s-maxage=${keep}`);
        res.end();
    } catch {
        return sendJson(res, 502, { error: 'Latest race unavailable' });
    }
}
