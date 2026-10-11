// 데이터 가공과 뱃지 HTML. 네트워크·파일은 다루지 않는다(테스트하기 쉽게).

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const escapeHTML = s =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// SOOP 날짜('2026-10-08 20:15:43')는 한국 시간이다
export const soopDateMs = s => Date.parse(String(s || '').replace(' ', 'T') + '+09:00') || 0;

export const postUrl = (soopId, titleNo) =>
    `https://www.sooplive.co.kr/station/${encodeURIComponent(soopId)}/post/${encodeURIComponent(titleNo)}`;

export const boardUrl = soopId => `https://www.sooplive.co.kr/station/${encodeURIComponent(soopId)}/board`;

// 같은 글이 contents(일반 글)와 noticeData(고정 공지) 양쪽에 올 수 있다. 본인 글만 최신순으로.
export function recentOwnPosts(board, soopId, limit) {
    const owner = String(soopId).toLowerCase();
    const all = [...(board?.contents || []), ...(board?.noticeData || [])];
    const seen = new Set();
    return all
        .filter(p => p && String(p.userId || '').toLowerCase() === owner)
        .filter(p => !seen.has(p.titleNo) && seen.add(p.titleNo))
        .sort((a, b) => soopDateMs(b.regDate) - soopDateMs(a.regDate))
        .slice(0, limit);
}

// 한국 시간 기준 이번 주 월~일 'YYYY-MM-DD'
export function weekDates(nowMs) {
    const kst = new Date(nowMs + KST_OFFSET_MS);
    const monday = Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - ((kst.getUTCDay() + 6) % 7) * DAY_MS;
    return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

export const kstToday = nowMs => new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const timeKey = t => (TIME_RE.test(t || '') ? t.padStart(5, '0') : '99:99');

// '10.13'처럼 연도 없는 날짜는 오늘과 가장 가까운 해로 본다(12월에 1월 일정을 적어도 맞게)
function resolveDate(token, nowMs) {
    let m = /^(\d{4})[-.](\d{1,2})[-.](\d{1,2})$/.exec(token);
    const pad = n => String(n).padStart(2, '0');
    const valid = (y, mo, d) => {
        const iso = `${y}-${pad(mo)}-${pad(d)}`;
        const ms = Date.parse(iso + 'T00:00:00Z');
        return ms && new Date(ms).toISOString().slice(0, 10) === iso ? iso : null;
    };
    if (m) return valid(+m[1], +m[2], +m[3]);
    m = /^(\d{1,2})[./](\d{1,2})$/.exec(token);
    if (!m) return null;
    const year = Number(kstToday(nowMs).slice(0, 4));
    const today = Date.parse(kstToday(nowMs));
    return [year - 1, year, year + 1]
        .map(y => valid(y, +m[1], +m[2]))
        .filter(Boolean)
        .sort((a, b) => Math.abs(Date.parse(a) - today) - Math.abs(Date.parse(b) - today))[0] || null;
}

// schedule.txt: 한 줄에 '날짜 [시간] 내용'. 내용이 '휴방'이면 휴방일. #로 시작하는 줄과 빈 줄은 건너뛴다.
export function parseSchedule(text, nowMs) {
    const events = [];
    const offAir = new Set();
    const errors = [];
    String(text || '')
        .split(/\r?\n/)
        .forEach((raw, i) => {
            const line = raw.trim();
            if (!line || line.startsWith('#')) return;
            const [dateToken, ...rest] = line.split(/\s+/);
            const date = resolveDate(dateToken, nowMs);
            if (!date) return errors.push(`${i + 1}번째 줄 날짜를 읽지 못했습니다: ${line}`);
            let time = '';
            if (TIME_RE.test(rest[0]) || rest[0] === '시간미정') time = rest.shift();
            const what = rest.join(' ');
            if (!what) return errors.push(`${i + 1}번째 줄에 내용이 없습니다: ${line}`);
            if (what === '휴방') offAir.add(date);
            else events.push({ date, time, text: what, order: i });
        });
    return { events, offAir, errors };
}

export function weekSchedule({ events, offAir }, nowMs) {
    return weekDates(nowMs).map(date => ({
        date,
        offAir: offAir.has(date),
        events: events
            .filter(ev => ev.date === date)
            .sort((a, b) => timeKey(a.time).localeCompare(timeKey(b.time)) || a.order - b.order),
    }));
}

const mmdd = date => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
const weekdayOf = date => WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];

export function formatPostDate(regDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(regDate || '');
    return m ? `${Number(m[2])}.${Number(m[3])} (${weekdayOf(`${m[1]}-${m[2]}-${m[3]}`)}) ${m[4]}:${m[5]}` : '';
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };
const decodeEntities = s =>
    s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
        if (e[0] === '#') {
            const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
        }
        return ENTITIES[e.toLowerCase()] ?? m;
    });

// textContent는 200자 남짓에서 '...'로 잘리고 문단 줄바꿈도 없다. 본문 HTML(content.content)에서 글자만 뽑는다.
export function postText(post) {
    const html = post?.content?.content;
    const text = html
        ? decodeEntities(
              String(html)
                  .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
                  .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, '\n')
                  .replace(/<[^>]*>/g, '')
          )
        : String(post?.content?.textContent || '').replace(/<br\s*\/?>/gi, '\n');
    return text
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// Pretendard는 러너에 한글 글꼴이 없어도 같은 모양으로 찍히게 웹 글꼴로 싣는다
const FONT_CSS =
    '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">';

// 흰 카드 + 은은한 그림자. 머리는 프로필 사진을 흐리게 깔아 색을 따로 정하지 않는다.
const BASE_CSS = `
:root { --ink: #18181b; --body: #3f3f46; --sub: #71717a; --faint: #a1a1aa; --line: #ececef; --tint: #f6f6f7; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: Pretendard, 'Noto Sans KR', sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased; letter-spacing: -0.012em; }
/* 그림자가 잘리지 않게 투명 여백을 두고 찍는다 */
#badge { display: inline-block; padding: 10px 14px 18px; }
.card { width: 600px; background: #fff; border-radius: 22px; overflow: hidden; position: relative;
  box-shadow: 0 0 0 1px rgba(24, 24, 27, .06), 0 2px 4px rgba(24, 24, 27, .04), 0 8px 24px rgba(24, 24, 27, .08); }
.hero { position: relative; overflow: hidden; color: #fff; isolation: isolate; }
.hero .bg { position: absolute; inset: -40px; background-size: cover; background-position: center 30%;
  filter: blur(22px) saturate(1.9) brightness(1.04); transform: scale(1.15); z-index: -2; }
.hero::after { content: ''; position: absolute; inset: 0; z-index: -1;
  background: linear-gradient(180deg, rgba(20, 20, 24, .06) 0%, rgba(20, 20, 24, .4) 100%); }
.avatar { border-radius: 50%; object-fit: cover; flex: none; background: #e4e4e7; }
.hero .avatar { box-shadow: 0 0 0 2px rgba(255, 255, 255, .9), 0 4px 12px rgba(0, 0, 0, .2); }
.wrap { word-break: keep-all; overflow-wrap: anywhere; }
.btn { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: #fff; background: var(--ink);
  border-radius: 999px; padding: 8px 14px 8px 16px; }
.btn svg { width: 12px; height: 12px; }
`;

const page = (title, css, body) =>
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHTML(title)}</title>${FONT_CSS}<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;

const avatarUrl = (soopId, post) =>
    post?.profileImage || `https://profile.img.sooplive.com/LOGO/${soopId.slice(0, 2)}/${soopId}/${soopId}.jpg`;

const ARROW_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h7M6.5 3l3 3-3 3"/></svg>';

const hero = (soopId, post, inner) =>
    `<div class="hero"><div class="bg" style="background-image:url('${escapeHTML(avatarUrl(soopId, post))}')"></div>${inner}</div>`;

const NOTICE_CSS = `
.hero .in { display: flex; align-items: center; gap: 12px; padding: 16px 22px; }
.hero .avatar { width: 42px; height: 42px; }
.who { flex: 1; min-width: 0; }
.name { font-size: 15px; font-weight: 800; text-shadow: 0 1px 2px rgba(0, 0, 0, .15); }
.date { font-size: 12.5px; opacity: .85; margin-top: 2px; }
.tag { font-size: 11.5px; font-weight: 800; letter-spacing: .04em; color: var(--ink); background: rgba(255, 255, 255, .92); border-radius: 999px; padding: 5px 11px; }
.content { padding: 20px 24px 22px; }
.title { font-size: 20px; font-weight: 800; line-height: 1.35; letter-spacing: -0.02em;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.text { font-size: 15px; line-height: 1.68; color: var(--body); margin-top: 10px; white-space: pre-wrap;
  display: -webkit-box; -webkit-line-clamp: var(--lines, 3); -webkit-box-orient: vertical; overflow: hidden; }
.photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 16px; }
.ph { position: relative; aspect-ratio: 1; border-radius: 14px; overflow: hidden; background: var(--tint); }
.ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.more { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(24, 24, 27, .5); color: #fff; font-size: 20px; font-weight: 800; }
.foot { display: flex; justify-content: flex-end; margin-top: 18px; }
.compact .hero .in { padding: 12px 20px; }
.compact .hero .avatar { width: 34px; height: 34px; }
.compact .name { font-size: 14px; }
.compact .date { font-size: 12px; }
.compact .content { display: flex; gap: 16px; align-items: center; padding: 16px 20px 18px; }
.compact .main { flex: 1; min-width: 0; }
.compact .title { font-size: 17px; }
.compact .text { font-size: 14px; margin-top: 6px; line-height: 1.6; }
.compact .foot { justify-content: flex-start; margin-top: 12px; }
.compact .btn { font-size: 12px; padding: 6px 12px 6px 13px; background: var(--tint); color: var(--ink); }
.thumb { position: relative; width: 100px; height: 100px; border-radius: 16px; overflow: hidden; flex: none; background: var(--tint); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .more { font-size: 12.5px; inset: auto 6px 6px auto; padding: 3px 8px; border-radius: 999px; background: rgba(24, 24, 27, .65); }
.empty { font-size: 15px; color: var(--faint); }
`;

const photoUrls = post => (post?.photos || []).map(p => p?.url).filter(Boolean);

// lines가 3보다 크면 사진을 본문 아래에 크게(최신 글), 아니면 오른쪽 작은 사진 한 장
export function noticeBadgeHtml({ name, soopId, post, lines = 3 }) {
    const featured = Number(lines) > 3;
    const head = hero(
        soopId,
        post,
        `<div class="in"><img class="avatar" src="${escapeHTML(avatarUrl(soopId, post))}" alt="" onerror="this.style.visibility='hidden'">
          <div class="who"><div class="name">${escapeHTML(name)}</div>
          ${post ? `<div class="date">${escapeHTML(formatPostDate(post.regDate))}</div>` : ''}</div>
          ${featured ? '<span class="tag">NEW</span>' : ''}</div>`
    );
    const wrapCard = (cls, inner) => page(`${name} 글`, NOTICE_CSS, `<div id="badge"${cls ? ` class="${cls}"` : ''}><div class="card">${head}${inner}</div></div>`);
    if (!post) return wrapCard(featured ? '' : 'compact', '<div class="content"><div class="empty">아직 글이 없습니다</div></div>');
    // 짧은 뱃지는 빈 줄이 몇 줄 안 되는 자리를 먹지 않게 뺀다
    const text = featured ? postText(post) : postText(post).replace(/\n{2,}/g, '\n');
    const photos = photoUrls(post);
    const img = url => `<img src="${escapeHTML(url)}" alt="" onerror="this.parentNode.remove()">`;
    const moreTag = n => (n > 0 ? `<span class="more">+${n}</span>` : '');
    const main = `<div class="title wrap">${escapeHTML(post.titleName || '(제목 없음)')}</div>
      ${text ? `<div class="text wrap" style="--lines:${Number(lines) || 3}">${escapeHTML(text)}</div>` : ''}`;
    const go = `<div class="foot"><span class="btn">원글 보기 ${ARROW_ICON}</span></div>`;
    return featured
        ? wrapCard('', `<div class="content">${main}
            ${photos.length ? `<div class="photos">${photos.slice(0, 4).map((u, i) => `<div class="ph">${img(u)}${i === 3 ? moreTag(photos.length - 4) : ''}</div>`).join('')}</div>` : ''}
            ${go}</div>`)
        : wrapCard('compact', `<div class="content"><div class="main">${main}${go}</div>
            ${photos.length ? `<div class="thumb">${img(photos[0])}${moreTag(photos.length - 1)}</div>` : ''}</div>`);
}

const SCHEDULE_CSS = `
.hero .in { display: flex; align-items: center; gap: 14px; padding: 24px 26px 22px; }
.hero .avatar { width: 52px; height: 52px; }
.ttl { flex: 1; min-width: 0; }
.ttl small { display: block; font-size: 12.5px; font-weight: 600; opacity: .85; }
.ttl h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.03em; margin-top: 3px; text-shadow: 0 1px 3px rgba(0, 0, 0, .15); }
.range { font-size: 13px; font-weight: 700; background: rgba(255, 255, 255, .2); border: 1px solid rgba(255, 255, 255, .35);
  border-radius: 999px; padding: 7px 13px; font-variant-numeric: tabular-nums; backdrop-filter: blur(4px); }
.list { padding: 8px 14px; }
.row { display: flex; align-items: center; gap: 16px; padding: 10px 12px; border-radius: 16px; }
.row + .row { margin-top: 2px; }
.day { width: 52px; height: 52px; flex: none; border-radius: 15px; background: var(--tint);
  display: flex; flex-direction: column; align-items: center; justify-content: center; }
.wd { font-size: 12px; font-weight: 700; color: var(--sub); }
.dn { font-size: 18px; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
.sun .wd { color: #e5484d; } .sat .wd { color: #3e63dd; }
.today { background: var(--tint); }
.today .day { background: var(--ink); }
.today .wd { color: rgba(255, 255, 255, .7); }
.today .dn { color: #fff; }
.evs { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.ev { display: flex; align-items: baseline; gap: 12px; }
.tm { flex: none; width: 46px; font-size: 14px; font-weight: 700; color: var(--sub); font-variant-numeric: tabular-nums; }
.tm.tbd { font-size: 12.5px; color: var(--faint); }
.what { font-size: 16px; font-weight: 700; line-height: 1.4; }
.none { font-size: 14px; color: #c4c4c9; }
.offtag { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; font-size: 13.5px; font-weight: 700; color: var(--sub);
  background: var(--tint); border-radius: 999px; padding: 5px 12px 5px 10px; }
.offtag svg { width: 13px; height: 13px; }
.today .offtag { background: #fff; }
.off .day { opacity: .55; }
.foot { display: flex; justify-content: center; padding: 6px 0 20px; }
`;

const MOON_ICON =
    '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M13.5 10.2A6 6 0 0 1 5.8 2.5a6 6 0 1 0 7.7 7.7Z"/></svg>';

export function scheduleBadgeHtml({ name, soopId, days, today, footer }) {
    const rows = days
        .map(({ date, offAir, events }) => {
            const wd = weekdayOf(date);
            const cls = ['row', date === today && 'today', offAir && 'off', wd === '일' && 'sun', wd === '토' && 'sat'].filter(Boolean).join(' ');
            const evs = events
                .map(ev => {
                    const tm = ev.time ? `<span class="tm${TIME_RE.test(ev.time) ? '' : ' tbd'}">${escapeHTML(ev.time === '시간미정' ? '미정' : ev.time)}</span>` : '';
                    return `<div class="ev">${tm}<span class="what wrap">${escapeHTML(ev.text)}</span></div>`;
                })
                .join('');
            const content = `${offAir ? `<span class="offtag">${MOON_ICON}휴방</span>` : ''}${evs}${!offAir && !events.length ? '<span class="none">일정 없음</span>' : ''}`;
            return `<div class="${cls}"><div class="day"><div class="wd">${wd}</div><div class="dn">${Number(date.slice(8, 10))}</div></div><div class="evs">${content}</div></div>`;
        })
        .join('');
    return page(
        `${name} 주간 일정`,
        SCHEDULE_CSS,
        `<div id="badge"><div class="card">${hero(
            soopId,
            null,
            `<div class="in"><img class="avatar" src="${escapeHTML(avatarUrl(soopId))}" alt="" onerror="this.remove()">
              <div class="ttl"><small>이번 주 방송 일정</small><h1>${escapeHTML(name)}</h1></div>
              <span class="range">${mmdd(days[0].date)} – ${mmdd(days[6].date)}</span></div>`
        )}
          <div class="list">${rows}</div>
          ${footer ? `<div class="foot"><span class="btn">${escapeHTML(footer)} ${ARROW_ICON}</span></div>` : ''}</div></div>`
    );
}

// 커뮤니티 글의 링크는 고정이라, 이 페이지가 지금의 원글로 넘겨 준다
export const redirectHtml = url => `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${escapeHTML(url)}">
<title>이동 중…</title><script>location.replace(${JSON.stringify(url).replace(/</g, '\\u003c')})</script></head>
<body><a href="${escapeHTML(url)}">원글로 이동</a></body></html>
`;

export function kstStamp(nowMs) {
    const d = new Date(nowMs + KST_OFFSET_MS).toISOString();
    return `${Number(d.slice(5, 7))}.${Number(d.slice(8, 10))} ${d.slice(11, 16)}`;
}
