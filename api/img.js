// 뱃지 그림. 주소는 /<대상>/<뱃지>.png (vercel.json이 ?t=대상&b=뱃지로 보낸다)
//   소주양: /soju/schedule.png
//   캄몬스타즈(스타유니브): /staruniv/today.png(오늘의 일정), /staruniv/calendar.png(이번 달)
// 그리는 데 CPU가 들어서(Vercel 무료 한도: 월 4시간) 내용이 바뀔 때만 그린다.
//   /soju/schedule.png         → 지금 내용의 해시를 붙인 /soju/schedule.<해시>.png로 보낸다(CPU 거의 안 씀)
//   /soju/schedule.<해시>.png  → 한 번 그리고 CDN이 계속 쓴다(내용이 바뀌면 해시가 바뀌므로 오래 둬도 된다)
import crypto from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import { config } from '../src/config.mjs';
import { query } from '../src/http.mjs';
import { eventsOn, kstToday, monthWeeks, parseSchedule, weekSchedule } from '../src/lib.mjs';
import { scheduleFile } from '../src/live.mjs';
import { starLogo, starSchedule } from '../src/staruniv.mjs';

// 그림 도구(satori·sharp·resvg)는 실제로 그릴 때만 불러온다(돌려보내기만 하는 요청이 가볍게 뜨게)
let renderer;
const loadRenderer = () => (renderer ||= import('../src/render.mjs'));

const BUILD = process.env.VERCEL_GIT_COMMIT_SHA || 'dev'; // 코드가 바뀌면 그림도 새로
const prewarmed = new Map();

const soju = { name: config.name, soopId: config.soopId, theme: config.theme };
// 캄몬스타즈 로고(못 읽으면 로고 자리만 비운다)
const star = async () => ({ name: config.staruniv.name, logo: await starLogo().catch(() => null), square: true });

// 뱃지마다: 그림에 들어갈 값(args)과 그릴 함수, 고정 주소를 CDN이 기억할 초(fresh)
// 소주양 일정은 편집 화면에서 저장하면 바로 바뀌므로 20초, 나머지는 1분
const BADGES = {
    soju: {
        async schedule() {
            const now = Date.now();
            const days = weekSchedule(parseSchedule((await scheduleFile()).content, now), now);
            return { args: { ...soju, footer: config.schedule?.footer, days, today: kstToday(now) }, draw: 'renderSchedule', fresh: 20 };
        },
    },
    staruniv: {
        async today() {
            const now = Date.now();
            const date = kstToday(now);
            const [{ events, offAir }, who] = await Promise.all([starSchedule(), star()]);
            return { args: { ...who, date, events: eventsOn(events, date), offAir: offAir[date] || [] }, draw: 'renderToday', fresh: 60 };
        },
        async calendar() {
            const now = Date.now();
            const [{ events, holidays }, who] = await Promise.all([starSchedule(), star()]);
            const weeks = monthWeeks(now);
            const [first, last] = [weeks[0][0].date, weeks.at(-1)[6].date];
            return {
                // 이번 달 칸에 걸치는 일정과 공휴일만 넣는다(다른 달 일정이 바뀌어도 다시 그리지 않게)
                args: { ...who, weeks, today: kstToday(now),
                    events: events.filter(ev => ev.date <= last && (ev.end || ev.date) >= first),
                    holidays: [...holidays].filter(d => d >= first && d <= last).sort() },
                draw: 'renderCalendar', fresh: 60,
            };
        },
    },
};

async function badge(q) {
    const t = q.get('t');
    const b = q.get('b');
    const make = Object.hasOwn(BADGES, t) && Object.hasOwn(BADGES[t], b) && BADGES[t][b];
    if (!make) throw Object.assign(new Error('없는 뱃지입니다'), { status: 404 });
    const { args, draw, fresh } = await make();
    return { base: `${t}/${b}`, args, fresh, render: async () => (await loadRenderer())[draw](args) };
}

export default async function handler(req, res) {
    const q = query(req);
    try {
        const { base, args, render, fresh } = await badge(q);
        const key = crypto.createHash('sha256').update(BUILD + base + JSON.stringify(args)).digest('hex').slice(0, 12);
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
        res.statusCode = e.status || 502;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end(e.status === 404 ? e.message : '뱃지를 그리지 못했습니다');
    }
}
