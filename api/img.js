// /notice-1.png ~ /notice-3.png, /schedule.png (vercel.json이 여기로 보낸다)
// 그리는 데 CPU가 들어서(Vercel 무료 한도: 월 4시간) 내용이 바뀔 때만 그린다.
//   /notice-1.png            → 지금 내용의 해시를 붙인 /notice-1.<해시>.png로 보낸다(CDN 1분, CPU 거의 안 씀)
//   /notice-1.<해시>.png     → 한 번 그리고 CDN이 계속 쓴다(내용이 바뀌면 해시가 바뀌므로 오래 둬도 된다)
import crypto from 'node:crypto';
import { kstToday, parseSchedule, weekSchedule } from '../src/lib.mjs';
import { config, query, recentPosts, scheduleText } from '../src/live.mjs';
import { renderNotice, renderSchedule } from '../src/render.mjs';

// 배포(코드)가 바뀌면 그림도 새로
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || 'dev';

// 그림에 나오는 칸만 남긴다(조회수·좋아요 수가 바뀔 때마다 다시 그리지 않게)
const slimPost = p =>
    p && {
        titleNo: p.titleNo,
        titleName: p.titleName,
        regDate: p.regDate,
        profileImage: p.profileImage,
        content: { content: p.content?.content, textContent: p.content?.textContent },
        photos: (p.photos || []).map(x => ({ url: x?.url })),
    };

async function badge(q) {
    if (q.get('kind') === 'schedule') {
        const now = Date.now();
        const args = {
            name: config.name, soopId: config.soopId, footer: config.schedule?.footer,
            days: weekSchedule(parseSchedule(await scheduleText(), now), now), today: kstToday(now),
        };
        return { base: 'schedule', args, render: () => renderSchedule(args) };
    }
    const i = Math.min(Math.max(Number(q.get('i')) || 1, 1), config.noticeCount) - 1;
    const args = { name: config.name, soopId: config.soopId, post: slimPost((await recentPosts())[i]), lines: config.noticeLines?.[i] };
    return { base: `notice-${i + 1}`, args, render: () => renderNotice(args) };
}

export default async function handler(req, res) {
    const q = query(req);
    try {
        const { base, args, render } = await badge(q);
        const key = crypto.createHash('sha256').update(BUILD + JSON.stringify(args)).digest('hex').slice(0, 12);
        const v = q.get('v');
        if (v !== key) {
            // 고정 주소이거나 지난 해시: 지금 그림으로 보낸다
            res.statusCode = 302;
            res.setHeader('Location', `/${base}.${key}.png`);
            res.setHeader('Cache-Control', v ? 'public, max-age=0, s-maxage=10' : 'public, max-age=60, s-maxage=60');
            return res.end();
        }
        const png = await render();
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(png);
    } catch (e) {
        console.error(e);
        res.statusCode = 502;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('뱃지를 그리지 못했습니다');
    }
}
