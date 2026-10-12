// 뱃지 그림: satori(요소 → SVG) + resvg(SVG → PNG). 편집 화면 미리보기는 SVG 그대로 쓴다.
import fs from 'node:fs/promises';
import path from 'node:path';
import satori from 'satori';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { root } from './config.mjs';
import { eventsOn, formatPostDate, mmdd, postText, weekdayOf } from './lib.mjs';

let fontsPromise = null;
const loadFonts = () =>
    (fontsPromise ||= Promise.all(
        [['Regular', 400], ['SemiBold', 600], ['Bold', 700], ['ExtraBold', 800]].map(async ([file, weight]) => ({
            name: 'Pretendard',
            data: await fs.readFile(path.join(root, 'fonts', `Pretendard-${file}.woff`)),
            weight,
            style: 'normal',
        }))
    ));

const C = { ink: '#18181b', body: '#3f3f46', sub: '#71717a', faint: '#a1a1aa', tint: '#f4f4f5', none: '#c4c4c9', red: '#e5484d', blue: '#3e63dd' };

// satori는 자식이 둘 이상인 div에 display:flex가 있어야 한다
const h = (type, style = {}, ...children) => {
    const kids = children.flat().filter(c => c !== null && c !== undefined && c !== false && c !== '');
    return { type, props: { style: type === 'div' && !style.display ? { display: 'flex', ...style } : style, children: kids.length === 1 ? kids[0] : kids } };
};
const img = (src, w, hh, style = {}) => ({ type: 'img', props: { src, width: w, height: hh, style: { width: w, height: hh, ...style } } });

const svgUri = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const ARROW = color =>
    svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 12" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h7M6.5 3l3 3-3 3"/></svg>`);
const MOON = svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="${C.sub}"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7Z"/></svg>`);

// 외부 그림은 받아서 data URI로 넣는다. 받은 원본은 주소별로 기억해 같은 그림을 두 번 받지 않는다.
// 못 받으면 null(그 자리를 빼고 그린다). 실패는 다음 요청에서 다시 시도한다.
function remember(cache, key, make) {
    if (!cache.has(key)) {
        const p = make().catch(() => null);
        cache.set(key, p);
        p.then(v => { if (!v) cache.delete(key); });
        if (cache.size > 200) cache.delete(cache.keys().next().value);
    }
    return cache.get(key);
}
const downloads = new Map();
const download = (url, timeoutMs = 6000) =>
    remember(downloads, url, async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
        return res.ok ? Buffer.from(await res.arrayBuffer()) : null;
    });
const dataUri = (type, buf) => `data:${type};base64,${buf.toString('base64')}`;

// 사진: 정사각형으로 잘라 줄인 PNG(움짤이면 첫 장면)
const thumbs = new Map();
const thumbOf = (key, buf, size) =>
    remember(thumbs, `${size}|${key}`, async () =>
        buf && dataUri('image/png', await sharp(buf, { animated: false }).rotate().resize(size, size, { fit: 'cover' }).png().toBuffer()));
const thumb = async (url, size) => thumbOf(url, await download(url), size);
// 로고: 자르지 않고 흰 바탕 가운데에 여백을 두고 넣는다(투명 배경 로고)
const logoOf = (key, buf, size) =>
    remember(thumbs, `logo|${size}|${key}`, async () => {
        const pad = Math.round(size * 0.05);
        const inner = await sharp(buf, { animated: false }).resize(size - pad * 2, size - pad * 2, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
        const png = await sharp(inner).extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 255, g: 255, b: 255, alpha: 0 } }).flatten({ background: '#ffffff' }).png().toBuffer();
        return dataUri('image/png', png);
    });

// ----- 프로필: 사진과 그 사진에서 뽑은 색 -----
// SOOP 프로필 원본(.jpg 주소)은 1MB가 넘는 움짤 GIF라, 같은 사진의 작은 판(/m/, 100px webp)을 먼저 받는다.
const profileUrls = soopId => {
    const base = `https://profile.img.sooplive.com/LOGO/${soopId.slice(0, 2)}/${soopId}`;
    return [`${base}/m/${soopId}.webp`, `${base}/${soopId}.jpg`];
};
const profileBuf = async soopId => {
    for (const url of profileUrls(soopId)) {
        const buf = await download(url);
        if (buf) return buf;
    }
    return null;
};

const hex = (r, g, b) => '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
function hsl2hex(h, s, l) {
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return hex(f(0) * 255, f(8) * 255, f(4) * 255);
}
function rgb2hsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, s, l];
}

// 사진의 선명한 색을 색상(12칸)별로 모아 가장 많은 색과, 그와 60도 이상 떨어진 다음 색을 고른다.
// 머리 배경은 그 두 색의 밝은 파스텔 그라데이션.
const NEUTRAL = { from: '#eceef3', to: '#f5f5f7' };
async function paletteOf(buf) {
    if (!buf) return NEUTRAL;
    const data = await sharp(buf, { animated: false }).resize(24, 24, { fit: 'cover' }).removeAlpha().raw().toBuffer();
    const bins = Array.from({ length: 12 }, () => ({ w: 0, h: 0, s: 0 }));
    for (let i = 0; i < data.length; i += 3) {
        const [h, s, l] = rgb2hsl(data[i], data[i + 1], data[i + 2]);
        if (s < 0.2 || l < 0.15 || l > 0.92) continue;
        const w = s * (1 - Math.abs(l - 0.55));
        const bin = bins[Math.floor(h / 30) % 12];
        bin.w += w; bin.h += h * w; bin.s += s * w;
    }
    const ranked = bins.map((b, i) => ({ i, w: b.w, h: b.w ? b.h / b.w : 0, s: b.w ? b.s / b.w : 0 })).filter(b => b.w > 0).sort((x, y) => y.w - x.w);
    if (!ranked.length) return NEUTRAL;
    const [a] = ranked;
    const far = x => Math.min(Math.abs(x.i - a.i), 12 - Math.abs(x.i - a.i)) >= 2;
    const b = ranked.find(x => far(x) && x.w >= a.w * 0.15) || { h: (a.h + 40) % 360, s: a.s };
    const sat = v => Math.max(0.45, Math.min(0.85, v));
    return { from: hsl2hex(a.h, sat(a.s), 0.87), to: hsl2hex(b.h, sat(b.s), 0.91) };
}

// 뱃지 주인: SOOP 프로필(soopId) 또는 로고 주소(logo). theme {from, to}가 있으면 사진 색 대신 그 색.
const profiles = new Map();
const profile = ({ soopId, logo, theme }) =>
    remember(profiles, logo || soopId || '', async () => {
        const buf = logo ? await download(logo) : await profileBuf(soopId);
        const avatar = !buf ? null : logo ? logoOf(logo, buf, 120) : thumbOf(`profile|${soopId}`, buf, 120);
        const [avatarUri, colors] = await Promise.all([avatar, theme || paletteOf(buf)]);
        return { avatar: avatarUri, colors };
        return { avatar, colors };
    }).then(v => v || { avatar: null, colors: theme || NEUTRAL });

// 이모지는 Twemoji 그림으로 그린다(Pretendard에 없음)
const emojis = new Map();
async function loadAdditionalAsset(code, segment) {
    if (code !== 'emoji') return [];
    const cps = [...segment].map(c => c.codePointAt(0).toString(16));
    const key = (segment.includes('\u200d') ? cps : cps.filter(c => c !== 'fe0f')).join('-');
    return remember(emojis, key, async () => {
        const buf = await download(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${key}.svg`, 4000);
        return buf && dataUri('image/svg+xml', buf);
    }).then(v => v || '');
}

const CARD_W = 600;
const cardOf = width => (...children) =>
    h(
        'div',
        { padding: '10px 14px 18px', fontFamily: 'Pretendard', color: C.ink, letterSpacing: '-0.012em' },
        h(
            'div',
            {
                width, flexDirection: 'column', background: '#fff', borderRadius: 22, overflow: 'hidden',
                boxShadow: '0 0 0 1px rgba(24,24,27,0.06), 0 2px 4px rgba(24,24,27,0.04), 0 8px 24px rgba(24,24,27,0.08)',
            },
            ...children
        )
    );
const card = cardOf(CARD_W);

// 머리: 프로필 색 파스텔 그라데이션 + 왼쪽 위 은은한 빛. 글자는 진하게.
const hero = (colors, content) =>
    h(
        'div',
        {
            color: C.ink,
            backgroundImage: `radial-gradient(circle at 12% 0%, rgba(255,255,255,0.75), rgba(255,255,255,0) 55%), linear-gradient(120deg, ${colors.from}, ${colors.to})`,
            borderBottom: '1px solid rgba(24,24,27,0.06)',
        },
        content
    );

// 사람 프로필은 동그랗게, 로고(square)는 둥근 네모로
const avatarImg = (avatar, size, square) => {
    const radius = square ? Math.round(size * 0.26) : size;
    return avatar
        ? img(avatar, size, size, { borderRadius: radius, border: '2.5px solid #fff', objectFit: 'cover', boxShadow: '0 2px 8px rgba(24,24,27,0.15)' })
        : h('div', { width: size, height: size, borderRadius: radius, background: 'rgba(255,255,255,0.7)' });
};

// 일정·달력 머리: 사진 + 작은 제목 + 이름 + 오른쪽 기간 알약
const scheduleHead = ({ avatar, colors }, { name, subtitle, range, square }) =>
    hero(
        colors,
        h('div', { flex: 1, alignItems: 'center', gap: 14, padding: '24px 26px 22px' },
            avatarImg(avatar, 52, square),
            h('div', { flex: 1, flexDirection: 'column' },
                h('div', { fontSize: 12.5, fontWeight: 600, color: C.sub }, subtitle),
                h('div', { fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 3 }, name)),
            h('div', { fontSize: 13, fontWeight: 700, color: C.body, background: 'rgba(255,255,255,0.7)', borderRadius: 999, padding: '7px 13px' }, range))
    );

// 스타유니브 일정 색(사이트 달력과 같은 이름). 글자는 진하게 섞어 읽기 좋게, 바탕은 아주 연하게.
const EVENT_COLORS = { red: '#ff2538', orange: '#ff8a00', yellow: '#ffd43b', green: '#16c75b', blue: '#1677ff', indigo: '#3346b5', purple: '#7c3aed', light_gray: '#a1a1aa' };
const rgbOf = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const [x, y] = [rgbOf(a), rgbOf(b)]; return hex(...x.map((v, i) => v + (y[i] - v) * t)); };
const eventColor = name => {
    const base = EVENT_COLORS[name];
    return base && { bar: base, text: mix(base, C.ink, 0.35), bg: mix(base, '#ffffff', 0.88) };
};

// 색은 머리 배경에만 쓰고, 버튼·NEW·오늘 칸은 회색 바탕에 진한 글자로 차분하게
// 카드 오른쪽 아래 버튼(원글 보기·방송국 가기). 모든 뱃지에서 같은 크기·자리.
const cornerButton = label =>
    h('div', { justifyContent: 'flex-end', padding: '0 22px 20px' },
        h('div', { alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, borderRadius: 999, padding: '8px 14px 8px 16px', background: C.tint, color: C.ink },
            label, img(ARROW(C.ink), 12, 12)));

const textBlock = (text, style) => h('div', { display: 'block', wordBreak: 'keep-all', overflow: 'hidden', ...style }, text);

// 글이 몇 줄이 될지 어림한다(한글은 글자 폭 1, 영문·숫자·기호는 0.55, 빈칸 0.3으로 쳐서).
const charWidth = c => (/\s/.test(c) ? 0.3 : /[\u0000-\u024f]/.test(c) ? 0.55 : 0.95);
const lineCount = (text, fontSize, width) =>
    text.split('\n').reduce((n, p) => n + Math.max(1, Math.ceil(([...p].reduce((w, c) => w + charWidth(c), 0) * fontSize) / width)), 0);

// satori는 keep-all과 줄바꿈을 같이 쓰면 줄바꿈을 버린다. 문단마다 따로 그리고 높이로 lines줄에서 자른다.
// 잘리면(cut) 마지막 줄을 아래로 갈수록 옅게 덮어 이어진다는 걸 보여 준다.
function paragraphs(text, { lines, cut, fontSize, lineHeight, color, marginTop }) {
    const lh = Math.round(fontSize * lineHeight * 10) / 10;
    return h('div', { flexDirection: 'column', position: 'relative', maxHeight: lh * lines, overflow: 'hidden', marginTop },
        text.split('\n').map(p => (p.trim() ? textBlock(p, { fontSize, lineHeight: `${lh}px`, color, flexShrink: 0 }) : h('div', { height: lh, flexShrink: 0 }))),
        cut && h('div', { position: 'absolute', left: 0, right: 0, top: lh * (lines - 1), height: lh, backgroundImage: 'linear-gradient(180deg, rgba(255,255,255,0.15), rgba(255,255,255,0.75))' }));
}

// lines가 3보다 크면 최신 글(본문을 길게, 사진을 아래에 크게), 아니면 사진 한 장을 오른쪽에 작게
export async function renderNotice({ name, soopId, theme, post, lines = 3, format = 'png' }) {
    const featured = Number(lines) > 3;
    const photosAll = (post?.photos || []).map(p => p?.url).filter(Boolean);
    const [{ avatar, colors }, ...photos] = await Promise.all([
        profile({ soopId, theme }),
        ...photosAll.slice(0, featured ? 4 : 1).map(u => thumb(u, 264)),
    ]);
    const shown = photos.filter(Boolean);
    const extra = photosAll.length - shown.length;

    const head = hero(
        colors,
        h(
            'div',
            { flex: 1, alignItems: 'center', gap: 12, padding: featured ? '16px 22px' : '12px 20px' },
            avatarImg(avatar, featured ? 42 : 34),
            h('div', { flex: 1, flexDirection: 'column' },
                h('div', { fontSize: featured ? 15 : 14, fontWeight: 800 }, name),
                post && h('div', { fontSize: featured ? 12.5 : 12, color: C.sub, marginTop: 2 }, formatPostDate(post.regDate))),
            featured && h('div', { fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', borderRadius: 999, padding: '5px 11px', background: 'rgba(255,255,255,0.85)', color: C.ink }, 'NEW')
        )
    );
    if (!post) return out(format, card(head, h('div', { padding: '20px 24px 22px', fontSize: 15, color: C.faint }, '아직 글이 없습니다')));

    const raw = postText(post);
    const text = featured ? raw : raw.replace(/\n{2,}/g, '\n');
    const title = textBlock(post.titleName || '(제목 없음)', { fontSize: featured ? 20 : 17, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.02em', lineClamp: 2 });
    const maxLines = Number(lines) || 3;
    const fontSize = featured ? 15 : 14;
    const cut = !!text && lineCount(text, fontSize, featured ? CARD_W - 48 : CARD_W - 40 - (photosAll.length ? 116 : 0)) > maxLines;
    const body = text && paragraphs(text, { lines: maxLines, cut, fontSize, lineHeight: featured ? 1.68 : 1.6, color: C.body, marginTop: featured ? 10 : 6 });
    const more = n => n > 0 && h('div', { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', background: 'rgba(24,24,27,0.5)', color: '#fff', fontSize: 20, fontWeight: 800 }, `+${n}`);

    if (featured) {
        const size = (CARD_W - 48 - 8 * 3) / 4;
        return out(format, card(head, h('div', { flexDirection: 'column', padding: '20px 24px 18px' },
            title, body,
            shown.length > 0 && h('div', { gap: 8, marginTop: 16 },
                shown.map((src, i) => h('div', { position: 'relative', width: size, height: size, borderRadius: 14, overflow: 'hidden', background: C.tint },
                    img(src, size, size, { objectFit: 'cover' }), i === shown.length - 1 && more(extra))))),
            cornerButton('원글 보기')));
    }
    return out(format, card(head, h('div', { alignItems: 'center', gap: 16, padding: '16px 20px 12px' },
        h('div', { flex: 1, flexDirection: 'column' }, title, body),
        shown[0] && h('div', { position: 'relative', width: 100, height: 100, borderRadius: 16, overflow: 'hidden', background: C.tint },
            img(shown[0], 100, 100, { objectFit: 'cover' }),
            extra > 0 && h('div', { position: 'absolute', right: 6, bottom: 6, fontSize: 12.5, fontWeight: 800, color: '#fff', background: 'rgba(24,24,27,0.65)', borderRadius: 999, padding: '3px 8px' }, `+${extra}`))),
        cornerButton('원글 보기')));
}

// 일정 한 줄: [시간] [누가(일정 색 글자)] 내용. timeCol이면 시간이 없어도 칸을 비워 둔다.
// even이면 시간·누가도 내용과 같은 크기(오늘의 일정), 아니면 시간을 조금 작게(주간 일정).
const eventLine = (ev, timeCol, even) => {
    const digit = /^\d/.test(ev.time);
    return h('div', { alignItems: 'baseline', gap: 12 },
        timeCol && h('div', { width: even ? 52 : 46, flexShrink: 0, fontSize: even ? 16 : digit ? 14 : 12.5, fontWeight: 700, color: digit ? C.sub : C.faint }, ev.time === '시간미정' ? '미정' : ev.time || ' '),
        h('div', { flex: 1, alignItems: 'baseline', flexWrap: 'wrap', columnGap: 8 },
            ev.who && h('div', { fontSize: 16, fontWeight: 700, color: eventColor(ev.color)?.text || C.sub }, ev.who),
            h('div', { fontSize: 16, fontWeight: 700, lineHeight: 1.4, wordBreak: 'keep-all' }, ev.text)));
};

// 주간 일정. format: 'png'(뱃지) 또는 'svg'(편집 화면 미리보기: 그림으로 바꾸지 않아 훨씬 빠르다)
export async function renderSchedule({ name, soopId, theme, days, today, footer, format = 'png' }) {
    const who = await profile({ soopId, theme });
    const head = scheduleHead(who, { name, subtitle: '이번 주 방송 일정', range: `${mmdd(days[0].date)} – ${mmdd(days[6].date)}` });
    const rows = days.map(({ date, offAir, events }) => {
        const wd = weekdayOf(date);
        const isToday = date === today;
        const wdColor = isToday ? C.ink : wd === '일' ? C.red : wd === '토' ? C.blue : C.sub;
        const dayBox = h('div', { width: 52, height: 52, flexShrink: 0, borderRadius: 15, background: isToday ? '#fff' : C.tint, boxShadow: isToday ? '0 0 0 1.5px rgba(24,24,27,0.12), 0 2px 6px rgba(24,24,27,0.08)' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: offAir && !isToday ? 0.55 : 1 },
            h('div', { fontSize: 12, fontWeight: 700, color: wdColor }, wd),
            h('div', { fontSize: 18, fontWeight: 800, lineHeight: 1.1, color: C.ink }, String(Number(date.slice(8, 10)))));
        const items = [
            offAir && h('div', { alignSelf: 'flex-start', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: C.sub, background: isToday ? '#fff' : C.tint, borderRadius: 999, padding: '5px 12px 5px 10px' }, img(MOON, 13, 13), '휴방'),
            // 그날 시간이 있는 일정이 하나라도 있으면 시간 칸을 비워서라도 맞춘다
            ...events.map(ev => eventLine(ev, events.some(e => e.time))),
            !offAir && !events.length && h('div', { fontSize: 14, color: C.none }, '일정 없음'),
        ].filter(Boolean);
        return h('div', { alignItems: 'center', gap: 16, padding: '10px 12px', borderRadius: 16, marginTop: 2, background: isToday ? C.tint : 'transparent' },
            dayBox, h('div', { flex: 1, flexDirection: 'column', gap: 6 }, items));
    });
    return out(format, card(head,
        h('div', { flexDirection: 'column', padding: '8px 14px' }, rows),
        footer && cornerButton(footer)));
}

const CAL_W = 780; // 캄몬스타즈 오늘의 일정·달력 가로

// 오늘의 일정: 일정 목록 + 휴방 멤버(사진·이름, 없으면 '없음')
export async function renderToday({ name, soopId, logo, square, theme, date, events, offAir = [], format = 'png' }) {
    const [who, ...avatars] = await Promise.all([
        profile({ soopId, logo, theme }),
        ...offAir.map(m => profileBuf(m.soopId).then(buf => thumbOf(`profile|${m.soopId}`, buf, 48))),
    ]);
    const head = scheduleHead(who, { name, subtitle: '오늘의 일정', range: `${mmdd(date)} (${weekdayOf(date)})`, square });
    const list = events.length
        ? events.map(ev => eventLine(ev, events.some(e => e.time), true))
        : [h('div', { fontSize: 15, color: C.none }, '오늘 등록된 일정이 없습니다')];
    const offRow = h('div', { alignItems: 'center', gap: 12, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.tint}` },
        h('div', { alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 13.5, fontWeight: 700, color: C.sub, background: C.tint, borderRadius: 999, padding: '5px 12px 5px 10px' }, img(MOON, 13, 13), '휴방'),
        offAir.length
            ? h('div', { flex: 1, flexWrap: 'wrap', gap: 8 },
                offAir.map((m, i) => h('div', { alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 700, color: C.body },
                    avatars[i] ? img(avatars[i], 24, 24, { borderRadius: 24 }) : h('div', { width: 24, height: 24, borderRadius: 24, background: C.tint }), m.name)))
            : h('div', { fontSize: 14, color: C.none }, '없음'));
    // 달력과 나란히 쓰므로 가로 크기를 달력에 맞춘다
    return out(format, cardOf(CAL_W)(head, h('div', { flexDirection: 'column', gap: 10, padding: '20px 26px 22px' }, list, offRow)), CAL_W);
}

// 이번 달 달력(일요일부터). 칸마다 일정 칩: 색 막대 + 시간·누가 + 내용. 너무 많으면 +N.
const CAL_MAX = 6;
export async function renderCalendar({ name, soopId, logo, square, theme, weeks, events, holidays = [], today, format = 'png' }) {
    const who = await profile({ soopId, logo, theme });
    const month = weeks.flat().find(d => d.inMonth).date;
    const head = scheduleHead(who, { name, subtitle: '이번 달 일정', range: `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`, square });
    const off = new Set(holidays);
    const colW = (CAL_W - 28) / 7;
    const wdRow = h('div', { padding: '12px 14px 4px' },
        ['일', '월', '화', '수', '목', '금', '토'].map((wd, i) =>
            h('div', { width: colW, justifyContent: 'center', fontSize: 12, fontWeight: 700, color: i === 0 ? C.red : i === 6 ? C.blue : C.sub }, wd)));
    const chip = ev => {
        const color = eventColor(ev.color) || { bar: C.faint, text: C.sub, bg: C.tint };
        const label = [ev.time === '시간미정' ? '미정' : ev.time, ev.who].filter(Boolean).join(' ');
        // 색 막대는 칩 안에 따로 세운다(둥근 칩에 왼쪽 테두리를 주면 막대가 휘어 보인다)
        return h('div', { gap: 5, borderRadius: 7, background: color.bg, padding: '4px 6px 4px 4px', flexShrink: 0 },
            h('div', { width: 3, borderRadius: 3, background: color.bar, flexShrink: 0 }),
            h('div', { flex: 1, flexDirection: 'column', overflow: 'hidden' },
                label && textBlock(label, { fontSize: 10.5, fontWeight: 700, color: color.text, lineHeight: 1.3, whiteSpace: 'nowrap', textOverflow: 'ellipsis' }),
                ev.text && textBlock(ev.text, { fontSize: 11.5, fontWeight: 700, color: C.ink, lineHeight: 1.3, lineClamp: 2 })));
    };
    const cell = ({ date, inMonth }, i) => {
        const isToday = date === today;
        const dayEvents = inMonth ? eventsOn(events, date) : [];
        const numColor = !inMonth ? C.none : i === 0 || off.has(date) ? C.red : i === 6 ? C.blue : C.ink;
        return h('div', { width: colW, minHeight: 92, flexDirection: 'column', gap: 4, padding: '6px 4px 8px', borderRadius: 12, background: isToday ? C.tint : 'transparent' },
            h('div', { alignSelf: 'flex-start', justifyContent: 'center', minWidth: 26, height: 24, alignItems: 'center', borderRadius: 8, fontSize: 13, fontWeight: 800, color: numColor,
                background: isToday ? '#fff' : 'transparent', boxShadow: isToday ? '0 0 0 1.5px rgba(24,24,27,0.12), 0 2px 6px rgba(24,24,27,0.08)' : 'none' },
                String(Number(date.slice(8, 10)))),
            dayEvents.slice(0, CAL_MAX).map(chip),
            dayEvents.length > CAL_MAX && h('div', { fontSize: 11, fontWeight: 700, color: C.sub, paddingLeft: 4 }, `+${dayEvents.length - CAL_MAX}`));
    };
    const grid = h('div', { flexDirection: 'column', padding: '0 14px 14px' },
        weeks.map((week, wi) => h('div', { borderTop: wi ? `1px solid ${C.tint}` : 'none', padding: '2px 0' }, week.map(cell))));
    return out(format, cardOf(CAL_W)(head, wdRow, grid), CAL_W);
}

const toSvg = async (tree, width) => satori(tree, { width: width + 28, fonts: await loadFonts(), loadAdditionalAsset });
const out = (format, tree, width = CARD_W) => (format === 'svg' ? toSvg(tree, width) : png(tree, width));

async function png(tree, width) {
    const svg = await toSvg(tree, width);
    return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng();
}
