// 서버(Vercel 함수)에서 뱃지를 PNG로 그린다. satori(요소 → SVG) + resvg(SVG → PNG).
// 모양은 src/lib.mjs의 HTML 뱃지(크롬으로 찍던 것)와 같게 맞춘다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import satori from 'satori';
import sharp from 'sharp';
import { Resvg } from '@resvg/resvg-js';
import { formatPostDate, postText, weekdayOf } from './lib.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

// 외부 그림은 미리 받아 data URI로 넣는다. 못 받으면 null(그 자리를 빼고 그린다).
// SOOP 프로필은 jpg 주소인데 움직이는 GIF라서, sharp로 첫 장면을 작은 PNG로 바꾼다(큰 사진도 줄여 빨라진다).
const imageCache = new Map();
async function fetchImage(url, size, timeoutMs = 6000) {
    if (!url) return null;
    const key = `${size}|${url}`;
    if (imageCache.has(key)) return imageCache.get(key);
    const p = (async () => {
        try {
            const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
            if (!res.ok) return null;
            const buf = Buffer.from(await res.arrayBuffer());
            if (url.endsWith('.svg')) return `data:image/svg+xml;base64,${buf.toString('base64')}`;
            const out = await sharp(buf, { animated: false }).rotate().resize(size, size, { fit: 'cover' }).png().toBuffer();
            return `data:image/png;base64,${out.toString('base64')}`;
        } catch {
            return null;
        }
    })();
    imageCache.set(key, p);
    // 실패는 다음 요청에서 다시 시도하고, 캐시가 무한히 커지지 않게 한다
    p.then(v => { if (!v) imageCache.delete(key); });
    if (imageCache.size > 200) imageCache.delete(imageCache.keys().next().value);
    return p;
}

// 이모지는 Twemoji 그림으로 그린다(Pretendard에 없음)
const emojiCache = new Map();
function toCodePoints(segment) {
    const cps = [...segment].map(c => c.codePointAt(0).toString(16));
    return (segment.includes('‍') ? cps : cps.filter(c => c !== 'fe0f')).join('-');
}
async function loadAdditionalAsset(code, segment) {
    if (code !== 'emoji') return [];
    const key = toCodePoints(segment);
    if (!emojiCache.has(key))
        emojiCache.set(key, fetchImage(`https://cdn.jsdelivr.net/gh/jdecked/twemoji@15.1.0/assets/svg/${key}.svg`, 0, 4000));
    return (await emojiCache.get(key)) || '';
}

export const avatarUrl = (soopId, post) =>
    post?.profileImage || `https://profile.img.sooplive.com/LOGO/${soopId.slice(0, 2)}/${soopId}/${soopId}.jpg`;

const CARD_W = 600;
const card = (...children) =>
    h(
        'div',
        { padding: '10px 14px 18px', fontFamily: 'Pretendard', color: C.ink, letterSpacing: '-0.012em' },
        h(
            'div',
            {
                width: CARD_W, flexDirection: 'column', background: '#fff', borderRadius: 22, overflow: 'hidden',
                boxShadow: '0 0 0 1px rgba(24,24,27,0.06), 0 2px 4px rgba(24,24,27,0.04), 0 8px 24px rgba(24,24,27,0.08)',
            },
            ...children
        )
    );

// 머리: 프로필 사진을 흐리게 깔고 어둡게 덮는다. 글자 쪽은 position:relative여야 흐림이 번지지 않는다.
// 머리 배경: 프로필을 넓게 잘라 sharp로 미리 흐리고 채도를 올린다(satori의 blur는 테두리 밖으로 번진다)
const bannerCache = new Map();
function blurredBanner(url) {
    if (!url) return Promise.resolve(null);
    if (!bannerCache.has(url))
        bannerCache.set(url, (async () => {
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
                if (!res.ok) return null;
                const out = await sharp(Buffer.from(await res.arrayBuffer()), { animated: false })
                    .resize(CARD_W / 2, 80, { fit: 'cover', position: 'centre' })
                    .blur(12)
                    .modulate({ saturation: 1.45, brightness: 1.03 })
                    .resize(CARD_W, 160)
                    .jpeg({ quality: 82 })
                    .toBuffer();
                return `data:image/jpeg;base64,${out.toString('base64')}`;
            } catch {
                return null;
            }
        })().then(v => { if (!v) bannerCache.delete(url); return v; }));
    return bannerCache.get(url);
}

const hero = (banner, content) =>
    h(
        'div',
        { position: 'relative', overflow: 'hidden', color: '#fff' },
        banner && img(banner, CARD_W, 160, { position: 'absolute', left: 0, top: '50%', marginTop: -80, objectFit: 'cover' }),
        h('div', { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundImage: banner ? 'linear-gradient(180deg, rgba(20,20,24,0.06), rgba(20,20,24,0.42))' : 'linear-gradient(135deg, #3f3f46, #18181b)' }),
        h('div', { position: 'relative', flex: 1 }, content)
    );

const avatarImg = (avatar, size) =>
    avatar
        ? img(avatar, size, size, { borderRadius: size, border: '2px solid rgba(255,255,255,0.9)', objectFit: 'cover' })
        : h('div', { width: size, height: size, borderRadius: size, background: 'rgba(255,255,255,0.3)' });

const button = (label, dark) =>
    h(
        'div',
        { alignItems: 'center', gap: 6, fontSize: dark ? 13 : 12, fontWeight: 700, borderRadius: 999, padding: dark ? '8px 14px 8px 16px' : '6px 12px 6px 13px', background: dark ? C.ink : C.tint, color: dark ? '#fff' : C.ink },
        label,
        img(ARROW(dark ? '#fff' : C.ink), 12, 12)
    );

const textBlock = (text, style) => h('div', { display: 'block', wordBreak: 'keep-all', overflow: 'hidden', ...style }, text);

// satori는 keep-all과 줄바꿈을 같이 쓰면 줄바꿈을 버린다. 문단마다 따로 그리고 높이로 lines줄에서 자른다.
// 넘칠 것 같으면(대략 글자 수로 어림) 아랫줄을 흐리게 덮어 이어진다는 걸 보여 준다.
function paragraphs(text, { lines, fontSize, lineHeight, color, marginTop, width }) {
    const lh = Math.round(fontSize * lineHeight * 10) / 10;
    const perLine = Math.max(8, Math.floor(width / (fontSize * 0.98)));
    const paras = text.split('\n');
    const estimate = paras.reduce((n, p) => n + Math.max(1, Math.ceil([...p].length / perLine)), 0);
    return h('div', { flexDirection: 'column', position: 'relative', maxHeight: lh * lines, overflow: 'hidden', marginTop },
        paras.map(p => (p.trim() ? textBlock(p, { fontSize, lineHeight: `${lh}px`, color, flexShrink: 0 }) : h('div', { height: lh, flexShrink: 0 }))),
        estimate > lines && h('div', { position: 'absolute', left: 0, right: 0, top: lh * (lines - 1), height: lh, backgroundImage: 'linear-gradient(90deg, rgba(255,255,255,0) 40%, #fff 100%)' }));
}

export async function renderNotice({ name, soopId, post, lines = 3 }) {
    const featured = Number(lines) > 3;
    const photosAll = (post?.photos || []).map(p => p?.url).filter(Boolean);
    const [avatar, banner, ...photos] = await Promise.all([
        fetchImage(avatarUrl(soopId, post), 160),
        blurredBanner(avatarUrl(soopId, post)),
        ...photosAll.slice(0, featured ? 4 : 1).map(u => fetchImage(u, 264)),
    ]);
    const shown = photos.filter(Boolean);
    const extra = photosAll.length - shown.length;

    const head = hero(
        banner,
        h(
            'div',
            { flex: 1, alignItems: 'center', gap: 12, padding: featured ? '16px 22px' : '12px 20px' },
            avatarImg(avatar, featured ? 42 : 34),
            h('div', { flex: 1, flexDirection: 'column' },
                h('div', { fontSize: featured ? 15 : 14, fontWeight: 800 }, name),
                post && h('div', { fontSize: featured ? 12.5 : 12, opacity: 0.85, marginTop: 2 }, formatPostDate(post.regDate))),
            featured && h('div', { fontSize: 11.5, fontWeight: 800, letterSpacing: '0.04em', color: C.ink, background: 'rgba(255,255,255,0.92)', borderRadius: 999, padding: '5px 11px' }, 'NEW')
        )
    );
    if (!post) return png(card(head, h('div', { padding: '20px 24px 22px', fontSize: 15, color: C.faint }, '아직 글이 없습니다')));

    const raw = postText(post);
    const text = featured ? raw : raw.replace(/\n{2,}/g, '\n');
    const title = textBlock(post.titleName || '(제목 없음)', { fontSize: featured ? 20 : 17, fontWeight: 800, lineHeight: 1.35, letterSpacing: '-0.02em', lineClamp: 2 });
    const body = text && paragraphs(text, { lines: Number(lines) || 3, fontSize: featured ? 15 : 14, lineHeight: featured ? 1.68 : 1.6, color: C.body, marginTop: featured ? 10 : 6,
        width: featured ? CARD_W - 48 : CARD_W - 40 - (photosAll.length ? 116 : 0) });
    const more = n => n > 0 && h('div', { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', background: 'rgba(24,24,27,0.5)', color: '#fff', fontSize: 20, fontWeight: 800 }, `+${n}`);

    if (featured) {
        const size = (CARD_W - 48 - 8 * 3) / 4;
        return png(card(head, h('div', { flexDirection: 'column', padding: '20px 24px 22px' },
            title, body,
            shown.length > 0 && h('div', { gap: 8, marginTop: 16 },
                shown.map((src, i) => h('div', { position: 'relative', width: size, height: size, borderRadius: 14, overflow: 'hidden', background: C.tint },
                    img(src, size, size, { objectFit: 'cover' }), i === shown.length - 1 && more(extra)))),
            h('div', { justifyContent: 'flex-end', marginTop: 18 }, button('원글 보기', true)))));
    }
    return png(card(head, h('div', { alignItems: 'center', gap: 16, padding: '16px 20px 18px' },
        h('div', { flex: 1, flexDirection: 'column' }, title, body, h('div', { marginTop: 12 }, button('원글 보기', false))),
        shown[0] && h('div', { position: 'relative', width: 100, height: 100, borderRadius: 16, overflow: 'hidden', background: C.tint },
            img(shown[0], 100, 100, { objectFit: 'cover' }),
            extra > 0 && h('div', { position: 'absolute', right: 6, bottom: 6, fontSize: 12.5, fontWeight: 800, color: '#fff', background: 'rgba(24,24,27,0.65)', borderRadius: 999, padding: '3px 8px' }, `+${extra}`)))));
}

const mmdd = date => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;

export async function renderSchedule({ name, soopId, days, today, footer }) {
    const [avatar, banner] = await Promise.all([fetchImage(avatarUrl(soopId), 160), blurredBanner(avatarUrl(soopId))]);
    const head = hero(
        banner,
        h('div', { flex: 1, alignItems: 'center', gap: 14, padding: '24px 26px 22px' },
            avatarImg(avatar, 52),
            h('div', { flex: 1, flexDirection: 'column' },
                h('div', { fontSize: 12.5, fontWeight: 600, opacity: 0.85 }, '이번 주 방송 일정'),
                h('div', { fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', marginTop: 3 }, name)),
            h('div', { fontSize: 13, fontWeight: 700, background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 999, padding: '7px 13px' },
                `${mmdd(days[0].date)} – ${mmdd(days[6].date)}`))
    );
    const rows = days.map(({ date, offAir, events }) => {
        const wd = weekdayOf(date);
        const isToday = date === today;
        const wdColor = isToday ? 'rgba(255,255,255,0.7)' : wd === '일' ? C.red : wd === '토' ? C.blue : C.sub;
        const dayBox = h('div', { width: 52, height: 52, flexShrink: 0, borderRadius: 15, background: isToday ? C.ink : C.tint, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: offAir && !isToday ? 0.55 : 1 },
            h('div', { fontSize: 12, fontWeight: 700, color: wdColor }, wd),
            h('div', { fontSize: 18, fontWeight: 800, lineHeight: 1.1, color: isToday ? '#fff' : C.ink }, String(Number(date.slice(8, 10)))));
        const items = [
            offAir && h('div', { alignSelf: 'flex-start', alignItems: 'center', gap: 6, fontSize: 13.5, fontWeight: 700, color: C.sub, background: isToday ? '#fff' : C.tint, borderRadius: 999, padding: '5px 12px 5px 10px' }, img(MOON, 13, 13), '휴방'),
            ...events.map(ev => h('div', { alignItems: 'baseline', gap: 12 },
                ev.time && h('div', { width: 46, flexShrink: 0, fontSize: /^\d/.test(ev.time) ? 14 : 12.5, fontWeight: 700, color: /^\d/.test(ev.time) ? C.sub : C.faint }, ev.time === '시간미정' ? '미정' : ev.time),
                h('div', { flex: 1, fontSize: 16, fontWeight: 700, lineHeight: 1.4, wordBreak: 'keep-all' }, ev.text))),
            !offAir && !events.length && h('div', { fontSize: 14, color: C.none }, '일정 없음'),
        ].filter(Boolean);
        return h('div', { alignItems: 'center', gap: 16, padding: '10px 12px', borderRadius: 16, marginTop: 2, background: isToday ? C.tint : 'transparent' },
            dayBox, h('div', { flex: 1, flexDirection: 'column', gap: 6 }, items));
    });
    return png(card(head,
        h('div', { flexDirection: 'column', padding: '8px 14px' }, rows),
        footer && h('div', { justifyContent: 'center', padding: '6px 0 20px' }, button(footer, true))));
}

async function png(tree) {
    const svg = await satori(tree, { width: CARD_W + 28, fonts: await loadFonts(), loadAdditionalAsset });
    return new Resvg(svg, { fitTo: { mode: 'original' }, font: { loadSystemFonts: false } }).render().asPng();
}
