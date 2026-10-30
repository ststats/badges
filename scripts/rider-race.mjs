// 캄몬라이더(스타유니브 도구) 1바퀴 경기를 활동 멤버 중 랜덤 3명으로 돌려 gif로 남긴다. rider-race.yml이 10분마다 부른다.
// 화면 갱신(requestAnimationFrame)을 직접 한 칸씩 넘겨 러너가 느려도 경기 속도가 일정하다.
// usage: node scripts/rider-race.mjs <출력 폴더>  → latest.gif, latest.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PAGE = 'https://staruniv.vercel.app/calmmon-rider.html';
const RACERS = 3;
const STEP_FPS = 30; // 경기 화면 갱신(1×속도)
const GIF_FPS = 10;
const GIF_WIDTH = 480;
const TAIL_SEC = 3; // 결승 뒤 시상 화면을 보여 주는 시간
const MAX_SEC = 180;

const out = path.resolve(process.argv[2] || 'out');
const frames = await fs.mkdtemp(path.join(os.tmpdir(), 'rider-'));
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1 });
    await page.addInitScript(() => {
        let queue = [];
        window.requestAnimationFrame = cb => queue.push(cb);
        window.cancelAnimationFrame = () => {};
        window.__now = 0;
        window.__step = ms => {
            window.__now += ms;
            const run = queue;
            queue = [];
            run.forEach(cb => cb(window.__now));
        };
    });
    await page.goto(PAGE);
    // 명단·얼굴을 받는 동안에도 화면 갱신을 넘겨 준다(준비 과정이 프레임을 기다린다)
    const loaded = Date.now();
    while (!(await page.evaluate(() => (window.__step(16), typeof ready !== 'undefined' && ready)))) {
        if (Date.now() - loaded > 60000) throw new Error('캄몬라이더를 불러오지 못했습니다');
        await page.waitForTimeout(100);
    }
    const lineup = await page.evaluate(count => {
        if (BASE_DRIVERS < count) throw new Error(`활동 멤버가 ${BASE_DRIVERS}명뿐입니다`);
        const ids = [...Array(BASE_DRIVERS).keys()];
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        chosen = new Set(ids.slice(0, count));
        document.getElementById('laps').value = '1';
        syncSelection();
        if (!start()) throw new Error('경기를 시작하지 못했습니다');
        document.getElementById('cinema').click(); // 화면 확대(중계 카메라 4배)
        return ids.slice(0, count).map(i => names[i]);
    }, RACERS);
    const wrap = page.locator('.track-wrap');
    const every = STEP_FPS / GIF_FPS;
    let shot = 0,
        tail = 0;
    for (let i = 0; i < STEP_FPS * MAX_SEC; i++) {
        const state = await page.evaluate(ms => (window.__step(ms), state), 1000 / STEP_FPS);
        if (i % every === 0)
            await wrap.screenshot({ path: path.join(frames, `f${String(shot++).padStart(5, '0')}.png`) });
        if (state === 'finished' && ++tail > STEP_FPS * TAIL_SEC) break;
        if (i === STEP_FPS * MAX_SEC - 1) throw new Error('경기가 끝나지 않았습니다');
    }
    const results = await page.evaluate(() =>
        [...racers]
            .sort((a, b) => a.place - b.place)
            .map(r => ({ place: r.place, name: r.name, time: r.finish == null ? null : +r.finish.toFixed(2) }))
    );
    // 장면마다 바뀐 칸만 쓰고(diff_mode) 128색 팔레트로 줄인다
    execFileSync(process.env.FFMPEG || 'ffmpeg', [
        '-v',
        'error',
        '-y',
        '-framerate',
        String(GIF_FPS),
        '-i',
        path.join(frames, 'f%05d.png'),
        '-vf',
        `scale=${GIF_WIDTH}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=none:diff_mode=rectangle`,
        '-loop',
        '0',
        path.join(out, 'latest.gif'),
    ]);
    const size = (await fs.stat(path.join(out, 'latest.gif'))).size;
    const info = { created_at: new Date().toISOString(), laps: 1, lineup, results, frames: shot, bytes: size };
    await fs.writeFile(path.join(out, 'latest.json'), JSON.stringify(info, null, 2) + '\n');
    console.log(`경기 ${lineup.join(', ')} → 1위 ${results[0]?.name} · ${shot}장 · ${(size / 1e6).toFixed(2)}MB`);
} finally {
    await browser.close();
    await fs.rm(frames, { recursive: true, force: true });
}
