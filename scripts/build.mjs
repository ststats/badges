// SOOP 게시판과 schedule.txt로 뱃지 PNG와 원글 이동 페이지를 dist/에 만든다.
// 하나라도 못 받으면 실패로 끝나 배포하지 않는다(이전에 배포된 뱃지가 그대로 남는다).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import {
    boardUrl, escapeHTML, kstStamp, kstToday, noticeBadgeHtml, parseSchedule, postUrl, recentOwnPosts, redirectHtml,
    scheduleBadgeHtml, weekSchedule,
} from '../src/lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist');
const config = JSON.parse(await fs.readFile(path.join(root, 'config.json'), 'utf-8'));
const baseUrl = (process.env.BASE_URL || 'https://ststats.github.io/sojuyang-badges').replace(/\/$/, '');
const now = Date.now();

async function getJson(url, headers = {}) {
    for (let attempt = 1; ; attempt++) {
        try {
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch (e) {
            if (attempt >= 3) throw new Error(`${url}: ${e.message}`);
            await new Promise(r => setTimeout(r, 2000 * attempt));
        }
    }
}

const { soopId, name, noticeCount } = config;
const board = await getJson(`https://api-channel.sooplive.com/v1.1/channel/${encodeURIComponent(soopId)}/board?perPage=20&page=1`);
if (!Array.isArray(board?.contents)) throw new Error('SOOP 게시판 응답 형식이 바뀌었습니다');

// 못 읽은 줄은 빼고 만든다. Actions 실행 화면에 노란 경고로 남는다.
const schedule = parseSchedule(await fs.readFile(path.join(root, 'schedule.txt'), 'utf-8'), now);
schedule.errors.forEach(e => console.log(`::warning file=schedule.txt::${e}`));

const posts = recentOwnPosts(board, soopId, noticeCount);
const days = weekSchedule(schedule, now);

const badges = [
    ...Array.from({ length: noticeCount }, (_, i) => ({
        file: `notice-${i + 1}.png`,
        html: noticeBadgeHtml({ name, soopId, post: posts[i] }),
        linkPath: `n/${i + 1}/`,
        target: posts[i] ? postUrl(soopId, posts[i].titleNo) : boardUrl(soopId),
        label: `최근 글 ${i + 1}`,
    })),
    {
        file: 'schedule.png',
        html: scheduleBadgeHtml({ name, days, today: kstToday(now), footer: config.schedule.footer }),
        linkPath: 's/',
        target: config.schedule.link,
        label: '주간 일정',
    },
];

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch({
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : { channel: 'chrome' }),
    args: ['--no-sandbox', '--hide-scrollbars'],
});
try {
    const context = await browser.newContext({ viewport: { width: 900, height: 600 }, deviceScaleFactor: 1, locale: 'ko-KR' });
    const page = await context.newPage();
    for (const badge of badges) {
        await page.setContent(badge.html, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction(() => document.fonts.status === 'loaded' && [...document.images].every(img => img.complete));
        await page.evaluate(() => document.fonts.ready);
        await page.locator('#badge').screenshot({ path: path.join(out, badge.file), omitBackground: true });
        await fs.mkdir(path.join(out, badge.linkPath), { recursive: true });
        await fs.writeFile(path.join(out, badge.linkPath, 'index.html'), redirectHtml(badge.target));
        console.log(`${badge.file} → ${badge.target}`);
    }
} finally {
    await browser.close();
}

// 커뮤니티에 붙일 코드 모음
const embed = b => `<a href="${baseUrl}/${b.linkPath}"><img src="${baseUrl}/${b.file}" alt="${escapeHTML(`${name} ${b.label}`)}"></a>`;
await fs.writeFile(
    path.join(out, 'index.html'),
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHTML(name)} 뱃지</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#1c2230;background:#f5f6fa}
section{background:#fff;border-radius:12px;padding:16px;margin:14px 0}h2{font-size:16px;margin:0 0 10px}
img{max-width:100%}textarea{width:100%;height:64px;font:12px monospace;margin-top:8px}</style></head><body>
<h1>${escapeHTML(name)} 뱃지</h1><p>${escapeHTML(kstStamp(now))} 갱신. 아래 코드를 커뮤니티 글(HTML 편집)에 붙이면 이미지를 누를 때 원글로 갑니다.</p>
${badges
    .map(b => `<section><h2>${escapeHTML(b.label)}</h2>${embed(b)}<textarea readonly onclick="this.select()">${escapeHTML(embed(b))}</textarea></section>`)
    .join('\n')}
</body></html>
`
);
await fs.writeFile(path.join(out, '.nojekyll'), '');
console.log(`완료: 글 ${posts.length}개, 이번 주 일정 ${days.reduce((n, d) => n + d.events.length, 0)}개, 휴방 ${days.filter(d => d.offAir).length}일`);
