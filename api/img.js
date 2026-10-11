// /notice-1.png ~ /notice-3.png, /schedule.png (vercel.json이 여기로 보낸다). 볼 때마다 그리고 CDN이 1분 기억한다.
import { kstToday, parseSchedule, weekSchedule } from '../src/lib.mjs';
import { config, query, recentPosts, scheduleText } from '../src/live.mjs';
import { renderNotice, renderSchedule } from '../src/render.mjs';

export default async function handler(req, res) {
    const q = query(req);
    try {
        let png;
        if (q.get('kind') === 'schedule') {
            const now = Date.now();
            const days = weekSchedule(parseSchedule(await scheduleText(), now), now);
            png = await renderSchedule({ name: config.name, soopId: config.soopId, days, today: kstToday(now), footer: config.schedule?.footer });
        } else {
            const i = Math.min(Math.max(Number(q.get('i')) || 1, 1), config.noticeCount) - 1;
            const posts = await recentPosts();
            png = await renderNotice({ name: config.name, soopId: config.soopId, post: posts[i], lines: config.noticeLines?.[i] });
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        // 브라우저·CDN 모두 1분. 그 뒤 10분까지는 지난 그림을 주면서 뒤에서 새로 그린다.
        res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=600');
        res.end(png);
    } catch (e) {
        console.error(e);
        res.statusCode = 502;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('뱃지를 그리지 못했습니다');
    }
}
