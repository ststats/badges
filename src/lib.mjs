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

const BASE_CSS = `
:root { --ink: #221d26; --sub: #6e6676; --faint: #aaa2b3; --line: #f1e8ee; --accent: #e64980; --accent-2: #ff8fb1; --soft: #fff1f6; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: Pretendard, 'Noto Sans KR', sans-serif; color: var(--ink); -webkit-font-smoothing: antialiased; letter-spacing: -0.01em; }
#badge { display: inline-block; width: 600px; background: #fff; border: 1px solid var(--line); border-radius: 20px; overflow: hidden; position: relative; }
.avatar { border-radius: 50%; object-fit: cover; background: var(--soft); flex: none; }
.wrap { word-break: keep-all; overflow-wrap: anywhere; }
`;

const page = (title, css, body) =>
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHTML(title)}</title>${FONT_CSS}<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;

const avatarUrl = (soopId, post) =>
    post?.profileImage || `https://profile.img.sooplive.com/LOGO/${soopId.slice(0, 2)}/${soopId}/${soopId}.jpg`;

const NOTICE_CSS = `
#badge::before { content: ''; position: absolute; inset: 0 0 auto; height: 4px; background: linear-gradient(90deg, var(--accent-2), var(--accent)); }
.body { padding: 20px 22px 18px; }
.top { display: flex; align-items: center; gap: 10px; }
.top .avatar { width: 38px; height: 38px; box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px var(--accent-2); }
.who { flex: 1; min-width: 0; }
.name { font-size: 14px; font-weight: 800; }
.date { font-size: 12px; color: var(--faint); margin-top: 1px; }
.chip { font-size: 11.5px; font-weight: 800; color: var(--accent); background: var(--soft); border-radius: 999px; padding: 5px 10px; }
.title { font-size: 19px; font-weight: 800; line-height: 1.35; margin-top: 14px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.text { font-size: 14.5px; line-height: 1.6; color: #4b4452; margin-top: 8px; white-space: pre-wrap;
  display: -webkit-box; -webkit-line-clamp: var(--lines, 3); -webkit-box-orient: vertical; overflow: hidden; }
.photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-top: 14px; }
.ph { position: relative; aspect-ratio: 1; border-radius: 12px; overflow: hidden; background: var(--soft); }
.ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.more { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(34, 29, 38, .45); color: #fff; font-size: 20px; font-weight: 800; }
.go { display: inline-flex; align-items: center; gap: 4px; margin-top: 14px; font-size: 13px; font-weight: 800; color: var(--accent); }
.compact .body { display: flex; gap: 16px; }
.compact .main { flex: 1; min-width: 0; }
.compact .title { font-size: 16.5px; margin-top: 12px; }
.compact .text { font-size: 14px; margin-top: 5px; }
.compact .go { margin-top: 10px; }
.thumb { position: relative; width: 96px; height: 96px; border-radius: 14px; overflow: hidden; flex: none; align-self: center; background: var(--soft); }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .more { font-size: 15px; inset: auto 6px 6px auto; padding: 2px 7px; border-radius: 999px; background: rgba(34, 29, 38, .6); }
.empty { font-size: 15px; color: var(--faint); margin-top: 16px; }
`;

const photoUrls = post => (post?.photos || []).map(p => p?.url).filter(Boolean);

// lines가 3보다 크면 사진을 본문 아래에 크게(최신 글), 아니면 오른쪽 작은 사진 한 장
export function noticeBadgeHtml({ name, soopId, post, lines = 3 }) {
    const featured = Number(lines) > 3;
    const top = `<div class="top"><img class="avatar" src="${escapeHTML(avatarUrl(soopId, post))}" alt="" onerror="this.style.visibility='hidden'">
      <div class="who"><div class="name">${escapeHTML(name)}</div>
      ${post ? `<div class="date">${escapeHTML(formatPostDate(post.regDate))}</div>` : ''}</div>
      ${featured ? '<span class="chip">최신 글</span>' : ''}</div>`;
    if (!post)
        return page(`${name} 글`, NOTICE_CSS, `<div id="badge"><div class="body">${top}<div class="empty">아직 글이 없습니다</div></div></div>`);
    // 짧은 뱃지는 빈 줄이 몇 줄 안 되는 자리를 먹지 않게 뺀다
    const text = featured ? postText(post) : postText(post).replace(/\n{2,}/g, '\n');
    const photos = photoUrls(post);
    const img = url => `<img src="${escapeHTML(url)}" alt="" onerror="this.parentNode.remove()">`;
    const moreTag = n => (n > 0 ? `<span class="more">+${n}</span>` : '');
    const main = `${top}
      <div class="title wrap">${escapeHTML(post.titleName || '(제목 없음)')}</div>
      ${text ? `<div class="text wrap" style="--lines:${Number(lines) || 3}">${escapeHTML(text)}</div>` : ''}`;
    const go = '<div class="go">원글 보기 <span>›</span></div>';
    const body = featured
        ? `<div class="body">${main}
            ${photos.length ? `<div class="photos">${photos.slice(0, 4).map((u, i) => `<div class="ph">${img(u)}${i === 3 ? moreTag(photos.length - 4) : ''}</div>`).join('')}</div>` : ''}
            ${go}</div>`
        : `<div class="body"><div class="main">${main}${go}</div>
            ${photos.length ? `<div class="thumb">${img(photos[0])}${moreTag(photos.length - 1)}</div>` : ''}</div>`;
    return page(`${name} 글`, NOTICE_CSS, `<div id="badge"${featured ? '' : ' class="compact"'}>${body}</div>`);
}

const SCHEDULE_CSS = `
.head { display: flex; align-items: center; gap: 12px; padding: 18px 22px; color: #fff;
  background: linear-gradient(120deg, var(--accent-2) 0%, var(--accent) 100%); }
.head .avatar { width: 42px; height: 42px; box-shadow: 0 0 0 2.5px rgba(255, 255, 255, .85); }
.head .ttl { flex: 1; min-width: 0; }
.head .eyebrow { font-size: 11px; font-weight: 800; letter-spacing: .14em; opacity: .8; }
.head h1 { font-size: 20px; font-weight: 800; margin-top: 2px; }
.head .range { font-size: 13px; font-weight: 800; background: rgba(255, 255, 255, .22); border-radius: 999px; padding: 6px 12px; }
.list { padding: 6px 0; }
.row { display: flex; gap: 14px; padding: 11px 22px; border-top: 1px solid var(--line); position: relative; }
.row:first-child { border-top: 0; }
.day { width: 46px; flex: none; text-align: center; padding-top: 1px; }
.wd { font-size: 17px; font-weight: 800; }
.dt { font-size: 12px; color: var(--faint); margin-top: 1px; font-variant-numeric: tabular-nums; }
.sun .wd { color: #f03e3e; } .sat .wd { color: #4263eb; }
.evs { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 7px; }
.ev { display: flex; align-items: baseline; gap: 10px; }
.tm { flex: none; min-width: 58px; text-align: center; font-size: 12.5px; font-weight: 800; color: var(--accent);
  background: var(--soft); border-radius: 8px; padding: 4px 8px; font-variant-numeric: tabular-nums; }
.tm.tbd { color: var(--sub); background: #f4f2f6; }
.what { font-size: 15.5px; font-weight: 700; line-height: 1.4; }
.none { font-size: 14px; color: #cfc8d6; }
.off .wd, .off .dt { opacity: .45; }
.offtag { align-self: flex-start; font-size: 13px; font-weight: 800; color: var(--sub); background: #f1eff4; border-radius: 8px; padding: 4px 12px; }
.today { background: var(--soft); }
.today::before { content: ''; position: absolute; left: 0; top: 8px; bottom: 8px; width: 4px; border-radius: 0 4px 4px 0; background: var(--accent); }
.today .dt { color: var(--accent); font-weight: 800; }
.today .tm { background: #fff; }
.today .tm.tbd { background: #fff; }
.foot { text-align: center; font-size: 12px; color: var(--faint); padding: 10px 0 14px; border-top: 1px solid var(--line); }
`;

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
            const content = `${offAir ? '<span class="offtag">휴방</span>' : ''}${evs}${!offAir && !events.length ? '<span class="none">일정 없음</span>' : ''}`;
            return `<div class="${cls}"><div class="day"><div class="wd">${wd}</div><div class="dt">${mmdd(date)}</div></div><div class="evs">${content}</div></div>`;
        })
        .join('');
    return page(
        `${name} 주간 일정`,
        SCHEDULE_CSS,
        `<div id="badge"><div class="head"><img class="avatar" src="${escapeHTML(avatarUrl(soopId))}" alt="" onerror="this.remove()">
          <div class="ttl"><div class="eyebrow">WEEKLY SCHEDULE</div><h1>${escapeHTML(name)} 주간 일정</h1></div>
          <span class="range">${mmdd(days[0].date)} – ${mmdd(days[6].date)}</span></div>
          <div class="list">${rows}</div>
          ${footer ? `<div class="foot">${escapeHTML(footer)}</div>` : ''}</div>`
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
