// /notice-1~3.png, /schedule.png (vercel.json이 여기로 보낸다)
// 그리는 데 CPU가 들어서(Vercel 무료 한도: 월 4시간) 내용이 바뀔 때만 그린다.
//   /notice-1.png         → 지금 내용의 해시를 붙인 /notice-1.<해시>.png로 보낸다(CPU 거의 안 씀)
//   /notice-1.<해시>.png  → 한 번 그리고 CDN이 계속 쓴다(내용이 바뀌면 해시가 바뀌므로 오래 둬도 된다)
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { config } from '../src/config.mjs';
import { noticeIndex, query } from '../src/http.mjs';
import { kstToday, parseSchedule, weekSchedule } from '../src/lib.mjs';
import { recentPosts, scheduleFile } from '../src/live.mjs';

// 그림 도구(satori·sharp·resvg)는 실제로 그릴 때만 불러온다(돌려보내기만 하는 요청이 가볍게 뜨게)
let renderer;
const loadRenderer = () => (renderer ||= import('../src/render.mjs'));

const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'; // 코드가 바뀌면 그림도 새로
const prewarmed = new Map();
const { name, soopId } = config;

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
        const days = weekSchedule(parseSchedule((await scheduleFile()).content, now), now);
        const args = { name, soopId, footer: config.schedule?.footer, days, today: kstToday(now) };
        // 일정은 저장하면 바로 바뀌므로 고정 주소를 20초만 기억한다(글은 SOOP 쪽이라 1분)
        return { base: 'schedule', args, render: async () => (await loadRenderer()).renderSchedule(args), fresh: 20 };
    }
    const i = noticeIndex(q);
    const args = { name, soopId, post: slimPost((await recentPosts())[i]), lines: config.noticeLines?.[i] };
    return { base: `notice-${i + 1}`, args, render: async () => (await loadRenderer()).renderNotice(args), fresh: 60 };
}

export default async function handler(req, res) {
    const q = query(req);
    try {
        const { base, args, render, fresh } = await badge(q);
        const key = crypto.createHash('sha256').update(BUILD + JSON.stringify(args)).digest('hex').slice(0, 12);
        const v = q.get('v');
        if (v !== key) {
            // 고정 주소이거나 지난 해시: 지금 그림으로 보낸다.
            // CDN은 기억이 지나도 일단 지난 답을 바로 주고 뒤에서 새로 묻는다(기다리는 사람이 없게).
            const target = `/${base}.${key}.png`;
            res.statusCode = 302;
            res.setHeader('Location', target);
            res.setHeader('Cache-Control', v ? 'public, max-age=0, s-maxage=10' : `public, max-age=0, s-maxage=${fresh}, stale-while-revalidate=600, stale-if-error=86400`);
            res.end();
            // 내용이 바뀌었으면 다음 사람이 보기 전에 새 그림을 미리 그려 CDN에 넣어 둔다
            const host = req.headers['x-forwarded-host'] || req.headers.host;
            if (!v && process.env.VERCEL && host && prewarmed.get(base) !== key) {
                prewarmed.set(base, key);
                waitUntil(fetch(`https://${host}${target}`).then(r => r.arrayBuffer(), () => null));
            }
            return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.end(await render());
    } catch (e) {
        console.error(e);
        res.statusCode = 502;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('뱃지를 그리지 못했습니다');
    }
}
