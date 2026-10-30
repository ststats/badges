// 캄몬라이더(스타유니브 도구) 1바퀴 경기를 활동 멤버 중 랜덤 3명으로 돌려 움짤 WebP로 남긴다. rider-race.yml이 10분마다 부른다.
// 정각 6분 전에 띄워 미리 녹화하고, 올릴 시각(publish_at: 다음 10분 정각)을 latest.json에 적는다.
// 화면 갱신(requestAnimationFrame)을 직접 한 칸씩 넘겨 러너가 느려도 경기 속도가 일정하다.
// usage: node scripts/rider-race.mjs <출력 폴더>  → latest.webp, latest.json
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PAGE = 'https://staruniv.vercel.app/calmmon-rider.html';
const RACERS = 3;
const STEP_FPS = 30; // 경기 화면 갱신(1×속도)
const OUT_FPS = 15;
const OUT_WIDTH = 720;
const QUALITY = 80; // 커뮤니티에 붙이는 용도라 화질 우선(약 6MB)
const SLOT_MS = 10 * 60 * 1000;
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
    const every = STEP_FPS / OUT_FPS;
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
    // 바뀐 부분만 담는 움짤 WebP(libwebp_anim). 무한 반복
    execFileSync(process.env.FFMPEG || 'ffmpeg', [
        '-v',
        'error',
        '-y',
        '-framerate',
        String(OUT_FPS),
        '-i',
        path.join(frames, 'f%05d.png'),
        '-vf',
        `scale=${OUT_WIDTH}:-1:flags=lanczos`,
        '-c:v',
        'libwebp_anim',
        '-quality',
        String(QUALITY),
        '-compression_level',
        '4', // 6은 인코딩이 8배 느린데(약 110초) 크기는 3%만 작다
        '-loop',
        '0',
        '-an',
        path.join(out, 'latest.webp'),
    ]);
    const size = (await fs.stat(path.join(out, 'latest.webp'))).size;
    // 5분 넘게 늦은 작업은 기다리지 않고 바로 올린다(지난 정각이 올릴 시각이 된다)
    const publishAt = new Date((Math.floor((Date.now() - SLOT_MS / 2) / SLOT_MS) + 1) * SLOT_MS);
    const info = {
        publish_at: publishAt.toISOString(),
        laps: 1,
        lineup,
        results,
        frames: shot,
        bytes: size,
    };
    await fs.writeFile(path.join(out, 'latest.json'), JSON.stringify(info, null, 2) + '\n');
    console.log(
        `경기 ${lineup.join(', ')} → 1위 ${results[0]?.name} · ${shot}장 · ${(size / 1e6).toFixed(2)}MB · ${publishAt.toISOString()} 공개`
    );
} finally {
    await browser.close();
    await fs.rm(frames, { recursive: true, force: true });
}
