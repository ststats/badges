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

// 스타유니브(staruniv) 토큰: 남색 면, 파랑 강조, 오른쪽 위만 깎인 모서리
const BASE_CSS = `
:root { --navy: #14264a; --navy-on: #e6ecf7; --navy-muted: #b3c2de; --navy-accent: #5a95ff;
  --primary: #1f6dfb; --primary-tint: #eaf1ff; --text: #0b1220; --body: #1f2937; --sub: #5d687a; --faint: #8a93a3;
  --line: #dde4ee; --subtle: #f1f5fb; --holiday: #e03131;
  --pattern: repeating-linear-gradient(135deg, rgba(255, 255, 255, .045) 0 1px, transparent 1px 8px);
  --notch: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: Pretendard, 'Noto Sans KR', sans-serif; color: var(--text); -webkit-font-smoothing: antialiased; }
/* 깎인 모서리에도 테두리가 보이게 테두리 색 면 위에 흰 면을 1px 안쪽으로 겹친다 */
#badge { display: inline-block; width: 600px; padding: 1px; background: var(--line); clip-path: var(--notch); }
.card { background: #fff; clip-path: polygon(0 0, calc(100% - 15.6px) 0, 100% 15.6px, 100% 100%, 0 100%); overflow: hidden; }
.avatar { border-radius: 50%; object-fit: cover; background: #e9eff8; flex: none; }
.eyebrow { font-size: 10.5px; font-weight: 800; letter-spacing: .16em; }
.wrap { word-break: keep-all; overflow-wrap: anywhere; }
`;

const page = (title, css, body) =>
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHTML(title)}</title>${FONT_CSS}<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;

const avatarUrl = (soopId, post) =>
    post?.profileImage || `https://profile.img.sooplive.com/LOGO/${soopId.slice(0, 2)}/${soopId}/${soopId}.jpg`;

const NOTICE_CSS = `
.body { padding: 20px 24px 18px; border-left: 4px solid var(--primary); }
.top { display: flex; align-items: center; gap: 10px; }
.top .avatar { width: 40px; height: 40px; }
.who { flex: 1; min-width: 0; }
.name { font-size: 14.5px; font-weight: 800; }
.date { font-size: 12px; color: var(--faint); margin-top: 2px; }
.chip { font-size: 10.5px; font-weight: 800; letter-spacing: .12em; color: #fff; background: var(--navy); padding: 5px 9px; margin-right: 8px; }
.title { font-size: 18.5px; font-weight: 800; line-height: 1.38; margin-top: 14px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.text { font-size: 14.5px; line-height: 1.62; color: var(--body); margin-top: 8px; white-space: pre-wrap;
  display: -webkit-box; -webkit-line-clamp: var(--lines, 3); -webkit-box-orient: vertical; overflow: hidden; }
.photos { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 14px; }
.ph { position: relative; aspect-ratio: 1; overflow: hidden; background: #e9eff8; }
.ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
.more { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(20, 38, 74, .6); color: #fff; font-size: 20px; font-weight: 800; }
.go { display: inline-flex; align-items: center; gap: 5px; margin-top: 14px; font-size: 12.5px; font-weight: 800; color: var(--primary); }
.go svg { width: 11px; height: 11px; }
.compact .body { display: flex; gap: 16px; }
.compact .main { flex: 1; min-width: 0; }
.compact .title { font-size: 16.5px; margin-top: 12px; }
.compact .text { font-size: 14px; margin-top: 5px; }
.compact .go { margin-top: 10px; }
.thumb { position: relative; width: 96px; height: 96px; overflow: hidden; flex: none; align-self: center; background: #e9eff8; }
.thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.thumb .more { font-size: 13px; inset: auto 0 0 auto; padding: 3px 7px; background: rgba(20, 38, 74, .8); }
.empty { font-size: 15px; color: var(--faint); margin-top: 16px; }
`;

// 사이트 '전체 보기'의 바깥 링크 표시
const EXTERNAL_ICON =
    '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 2H2v8h8V7"/><path d="M7 2h3v3M10 2 5.5 6.5"/></svg>';

const photoUrls = post => (post?.photos || []).map(p => p?.url).filter(Boolean);

// lines가 3보다 크면 사진을 본문 아래에 크게(최신 글), 아니면 오른쪽 작은 사진 한 장
export function noticeBadgeHtml({ name, soopId, post, lines = 3 }) {
    const featured = Number(lines) > 3;
    const top = `<div class="top"><img class="avatar" src="${escapeHTML(avatarUrl(soopId, post))}" alt="" onerror="this.style.visibility='hidden'">
      <div class="who"><div class="name">${escapeHTML(name)}</div>
      ${post ? `<div class="date">${escapeHTML(formatPostDate(post.regDate))}</div>` : ''}</div>
      ${featured ? '<span class="chip">NEW</span>' : ''}</div>`;
    if (!post)
        return page(`${name} 글`, NOTICE_CSS, `<div id="badge"><div class="card"><div class="body">${top}<div class="empty">아직 글이 없습니다</div></div></div></div>`);
    // 짧은 뱃지는 빈 줄이 몇 줄 안 되는 자리를 먹지 않게 뺀다
    const text = featured ? postText(post) : postText(post).replace(/\n{2,}/g, '\n');
    const photos = photoUrls(post);
    const img = url => `<img src="${escapeHTML(url)}" alt="" onerror="this.parentNode.remove()">`;
    const moreTag = n => (n > 0 ? `<span class="more">+${n}</span>` : '');
    const main = `${top}
      <div class="title wrap">${escapeHTML(post.titleName || '(제목 없음)')}</div>
      ${text ? `<div class="text wrap" style="--lines:${Number(lines) || 3}">${escapeHTML(text)}</div>` : ''}`;
    const go = `<div class="go">원글 보기 ${EXTERNAL_ICON}</div>`;
    const body = featured
        ? `<div class="body">${main}
            ${photos.length ? `<div class="photos">${photos.slice(0, 4).map((u, i) => `<div class="ph">${img(u)}${i === 3 ? moreTag(photos.length - 4) : ''}</div>`).join('')}</div>` : ''}
            ${go}</div>`
        : `<div class="body"><div class="main">${main}${go}</div>
            ${photos.length ? `<div class="thumb">${img(photos[0])}${moreTag(photos.length - 1)}</div>` : ''}</div>`;
    return page(`${name} 글`, NOTICE_CSS, `<div id="badge"${featured ? '' : ' class="compact"'}><div class="card">${body}</div></div>`);
}

const SCHEDULE_CSS = `
.head { display: flex; align-items: flex-end; gap: 14px; padding: 22px 24px 20px; color: #fff; background: var(--pattern), var(--navy); }
.head .avatar { width: 46px; height: 46px; box-shadow: 0 0 0 2px rgba(255, 255, 255, .9); }
.head .ttl { flex: 1; min-width: 0; }
.head .eyebrow { color: var(--navy-muted); }
.head h1 { font-size: 23px; font-weight: 800; margin-top: 4px; letter-spacing: -.02em; }
.head .range { text-align: right; }
.head .range .eyebrow { display: block; }
.head .range b { display: block; font-size: 17px; font-weight: 800; margin-top: 4px; font-variant-numeric: tabular-nums; }
.row { display: flex; gap: 16px; padding: 12px 24px; border-top: 1px solid var(--line); }
.row:first-child { border-top: 0; }
.day { width: 44px; flex: none; text-align: center; }
.wd { font-size: 10px; font-weight: 800; letter-spacing: .12em; color: var(--sub); }
.dn { display: inline-block; min-width: 30px; font-size: 17px; font-weight: 800; margin-top: 3px; padding: 2px 4px; font-variant-numeric: tabular-nums; }
.sun .wd, .sun .dn { color: var(--holiday); }
.sat .wd, .sat .dn { color: var(--primary); }
.today { background: var(--subtle); }
.today .dn { background: var(--navy); color: #fff; }
.evs { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 6px; }
.ev { display: flex; align-items: baseline; gap: 10px; background: var(--primary-tint); border-left: 3px solid var(--primary); padding: 7px 12px; }
.tm { flex: none; font-size: 13px; font-weight: 800; color: var(--primary); font-variant-numeric: tabular-nums; }
.tm.tbd { color: var(--sub); }
.what { font-size: 15px; font-weight: 700; line-height: 1.4; color: var(--text); }
.none { font-size: 13.5px; color: #aab3c1; }
.off .ev { opacity: .5; }
.offtag { display: flex; align-items: center; gap: 10px; background: var(--subtle); border-left: 3px solid #aab3c1; padding: 7px 12px; font-size: 14px; font-weight: 800; color: var(--sub); }
.today .offtag { background: #fff; }
.foot { font-size: 12px; color: var(--sub); padding: 11px 24px; background: var(--subtle); border-top: 1px solid var(--line); display: flex; align-items: center; justify-content: flex-end; gap: 5px; font-weight: 700; }
.foot svg { width: 10px; height: 10px; }
`;

const WEEKDAYS_EN = { 일: 'SUN', 월: 'MON', 화: 'TUE', 수: 'WED', 목: 'THU', 금: 'FRI', 토: 'SAT' };

export function scheduleBadgeHtml({ name, soopId, days, today, footer }) {
    const rows = days
        .map(({ date, offAir, events }) => {
            const wd = weekdayOf(date);
            const cls = ['row', date === today && 'today', offAir && 'off', wd === '일' && 'sun', wd === '토' && 'sat'].filter(Boolean).join(' ');
            const evs = events
                .map(ev => {
                    const tm = ev.time ? `<span class="tm${TIME_RE.test(ev.time) ? '' : ' tbd'}">${escapeHTML(ev.time)}</span>` : '';
                    return `<div class="ev">${tm}<span class="what wrap">${escapeHTML(ev.text)}</span></div>`;
                })
                .join('');
            const content = `${offAir ? '<div class="offtag">휴방</div>' : ''}${evs}${!offAir && !events.length ? '<span class="none">일정 없음</span>' : ''}`;
            return `<div class="${cls}"><div class="day"><div class="wd">${WEEKDAYS_EN[wd]}</div><div class="dn">${Number(date.slice(8, 10))}</div></div><div class="evs">${content}</div></div>`;
        })
        .join('');
    return page(
        `${name} 주간 일정`,
        SCHEDULE_CSS,
        `<div id="badge"><div class="card"><div class="head"><img class="avatar" src="${escapeHTML(avatarUrl(soopId))}" alt="" onerror="this.remove()">
          <div class="ttl"><div class="eyebrow">WEEKLY SCHEDULE</div><h1>${escapeHTML(name)} 주간 일정</h1></div>
          <div class="range"><span class="eyebrow">${days[0].date.slice(0, 4)}</span><b>${mmdd(days[0].date)} – ${mmdd(days[6].date)}</b></div></div>
          <div class="list">${rows}</div>
          ${footer ? `<div class="foot">${escapeHTML(footer)} ${EXTERNAL_ICON}</div>` : ''}</div></div>`
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
