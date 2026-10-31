// 캄몬라이더(스타유니브 도구) 1바퀴 경기를 활동 멤버 3명으로 돌려 움짤 WebP로 남긴다. rider-race.yml이 10분마다 부른다.
// 정각 8분 전에 띄워 미리 녹화하고, 올릴 시각(publish_at: 다음 10분 정각)을 latest.json에 적는다.
// 경기마다 다음 경기 후보 3명을 미리 뽑아 결승 뒤 화면과 latest.json(next)에 알리고, 다음 회차는 그 3명으로 달린다.
// 화면 갱신(requestAnimationFrame)을 직접 한 칸씩 넘겨 러너가 느려도 경기 속도가 일정하다.
// 결과는 정각 공개 전까지 아무도 모르게 실행 기록(로그)에 남기지 않는다. 시드는 공개 뒤 재현용으로 latest.json에 적는다.
// usage: node scripts/rider-race.mjs <출력 폴더> [지난 latest.json]  → latest.webp, latest.json
import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const PAGE = 'https://staruniv.vercel.app/calmmon-rider.html';
const RACERS = 3;
const STEP_FPS = 30; // 경기 화면 갱신(1×속도)
const OUT_FPS = 15;
const OUT_WIDTH = 720;
const QUALITY = 85; // 커뮤니티에 붙이는 용도라 화질 우선
// 화면을 2배 밀도로 찍어 줄인다(1배로 찍으면 글자·선이 흐리다)
const SCALE = 2;
const SLOT_MS = 10 * 60 * 1000;
const TAIL_SEC = 4; // 결승 뒤 시상 화면과 다음 경기 안내를 보여 주는 시간
const MAX_SEC = 180;

const out = path.resolve(process.argv[2] || 'out');
const prev = await fs
    .readFile(process.argv[3] || '', 'utf8')
    .then(JSON.parse)
    .catch(() => ({}));
// 올릴 시각: 지금부터 1분 뒤 이후의 첫 10분 정각(정각 8분 전에 뜨면 그 정각)
const publishAt = new Date(Math.ceil((Date.now() + 60000) / SLOT_MS) * SLOT_MS);
const nextAt = new Date(publishAt.getTime() + SLOT_MS);
const kst = d =>
    d.toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false });
// 지난 회차가 이 시각으로 예고한 후보가 있으면 그대로 달린다(빠진 회차가 있으면 새로 뽑는다)
const promised = prev?.next?.at === publishAt.toISOString() ? prev.next.lineup : null;
// 경기 시드(스타유니브 캄몬라이더 start(seed)). 녹화할 때 새로 뽑아 미리 정해 두지 않는다
const seed = randomInt(0, 2 ** 32);

const frames = await fs.mkdtemp(path.join(os.tmpdir(), 'rider-'));
await fs.mkdir(out, { recursive: true });

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: SCALE });
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
    const { lineup, next } = await page.evaluate(
        ({ count, promised, seed }) => {
            if (BASE_DRIVERS < count * 2) throw new Error(`활동 멤버가 ${BASE_DRIVERS}명뿐입니다`);
            const members = [...Array(BASE_DRIVERS).keys()];
            const shuffle = list => {
                const ids = [...list];
                for (let i = ids.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [ids[i], ids[j]] = [ids[j], ids[i]];
                }
                return ids;
            };
            // 예고한 후보가 모두 아직 활동 멤버면 그대로, 아니면 새로 뽑는다
            const kept = (promised || []).map(name => names.indexOf(name));
            const ids =
                kept.length === count && kept.every(i => i >= 0 && i < BASE_DRIVERS)
                    ? kept
                    : shuffle(members).slice(0, count);
            // 다음 후보는 이번 출전자와 겹치지 않게 뽑는다
            const nextIds = shuffle(members.filter(i => !ids.includes(i))).slice(0, count);
            chosen = new Set(ids);
            document.getElementById('laps').value = '1';
            syncSelection();
            if (!start(seed)) throw new Error('경기를 시작하지 못했습니다');
            document.getElementById('cinema').click(); // 화면 확대(중계 카메라 4배)
            return { lineup: ids.map(i => names[i]), next: nextIds.map(i => names[i]) };
        },
        { count: RACERS, promised, seed }
    );
    // 시상 창이 뜨면 경기 화면 가운데로 옮기고, 버튼 줄(다시 경기·나가기 등) 자리에 다음 경기 안내를 넣는다
    // (녹화하는 이 창에서만 바꾼다)
    const announce = text =>
        page.evaluate(text => {
            const dialog = document.getElementById('ceremony');
            const actions = dialog?.open && dialog.querySelector('.ceremony-actions');
            if (!actions) return false;
            document.getElementById('ceremonyClose').hidden = true;
            // 시상 창은 브라우저 화면 가운데에 뜨는데 녹화는 경기 화면만 찍으므로 경기 화면 가운데로 옮긴다
            const area = document.querySelector('.track-wrap').getBoundingClientRect();
            Object.assign(dialog.style, {
                position: 'fixed',
                margin: '0',
                left: `${area.left + area.width / 2}px`,
                top: `${area.top + area.height / 2}px`,
                transform: 'translate(-50%, -50%)',
            });
            const box = document.createElement('div');
            box.textContent = text;
            Object.assign(box.style, {
                width: '100%',
                padding: '12px 16px',
                borderRadius: '12px',
                background: '#102040',
                color: '#fff',
                font: '800 18px Pretendard, sans-serif',
                textAlign: 'center',
            });
            actions.replaceChildren(box);
            return true;
        }, text);
    const wrap = page.locator('.track-wrap');
    const every = STEP_FPS / OUT_FPS;
    let shot = 0,
        tail = 0,
        announced = false;
    for (let i = 0; i < STEP_FPS * MAX_SEC; i++) {
        const state = await page.evaluate(ms => (window.__step(ms), state), 1000 / STEP_FPS);
        if (state === 'finished') {
            tail++;
            if (!announced) announced = await announce(`다음 경기 ${kst(nextAt)} · ${next.join(' · ')}`);
        }
        if (i % every === 0)
            await wrap.screenshot({ path: path.join(frames, `f${String(shot++).padStart(5, '0')}.png`) });
        if (tail > STEP_FPS * TAIL_SEC) break;
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
    const info = {
        publish_at: publishAt.toISOString(),
        laps: 1,
        seed,
        lineup,
        results,
        next: { at: nextAt.toISOString(), lineup: next },
        frames: shot,
        bytes: size,
    };
    await fs.writeFile(path.join(out, 'latest.json'), JSON.stringify(info, null, 2) + '\n');
    // 순위·우승자는 찍지 않는다(정각 전 실행 기록으로 결과가 새지 않게)
    console.log(`${kst(publishAt)} 경기 녹화 완료 · ${shot}장 · ${(size / 1e6).toFixed(2)}MB`);
} finally {
    await browser.close();
    await fs.rm(frames, { recursive: true, force: true });
}
