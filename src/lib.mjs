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
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
body { font-family: Pretendard, 'Noto Sans KR', sans-serif; color: #1c2230; -webkit-font-smoothing: antialiased; }
#badge { display: inline-block; background: #fff; border: 1px solid #e3e7ef; border-radius: 16px; overflow: hidden; }
.avatar { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; background: #eef1f6; flex: none; }
.name { font-size: 14px; font-weight: 700; color: #3b5bdb; }
.muted { color: #8a93a6; }
`;

const page = (title, css, body) =>
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHTML(title)}</title>${FONT_CSS}<style>${BASE_CSS}${css}</style></head><body>${body}</body></html>`;

const NOTICE_CSS = `
#badge { width: 600px; display: flex; gap: 14px; padding: 16px 18px; align-items: flex-start; }
.main { flex: 1; min-width: 0; }
.top { display: flex; gap: 10px; align-items: center; }
.top-text { min-width: 0; }
.meta { font-size: 12px; margin-top: 2px; }
.title { font-size: 17px; font-weight: 700; margin-top: 10px; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: keep-all; overflow-wrap: anywhere; }
.snippet { font-size: 14px; line-height: 1.5; color: #4a5263; margin-top: 6px; white-space: pre-wrap;
  display: -webkit-box; -webkit-line-clamp: var(--lines, 3); -webkit-box-orient: vertical; overflow: hidden; word-break: keep-all; overflow-wrap: anywhere; }
.thumb { width: 104px; height: 104px; border-radius: 10px; object-fit: cover; flex: none; background: #eef1f6; }
.go { font-size: 12px; font-weight: 600; color: #3b5bdb; margin-top: 10px; }
.empty { font-size: 15px; padding: 18px 0 6px; }
`;

// lines: 본문을 몇 줄까지 보여 줄지(최신 글은 길게)
export function noticeBadgeHtml({ name, soopId, post, lines = 3 }) {
    const avatar = post?.profileImage || `https://profile.img.sooplive.com/LOGO/${soopId.slice(0, 2)}/${soopId}/${soopId}.jpg`;
    const top = `<div class="top"><img class="avatar" src="${escapeHTML(avatar)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="top-text"><div class="name">${escapeHTML(name)}</div>
      <div class="meta muted">${post ? `${escapeHTML(formatPostDate(post.regDate))} · 방송국 글` : '방송국 글'}</div></div></div>`;
    if (!post) return page(`${name} 공지`, NOTICE_CSS, `<div id="badge"><div class="main">${top}<div class="empty muted">아직 글이 없습니다</div></div></div>`);
    const text = postText(post);
    const thumb = post.photos?.[0]?.url;
    return page(
        `${name} 공지`,
        NOTICE_CSS,
        `<div id="badge"><div class="main">${top}
          <div class="title">${escapeHTML(post.titleName || '(제목 없음)')}</div>
          ${text ? `<div class="snippet" style="--lines:${Number(lines) || 3}">${escapeHTML(text)}</div>` : ''}
          <div class="go">원글 보기 ›</div></div>
          ${thumb ? `<img class="thumb" src="${escapeHTML(thumb)}" alt="" onerror="this.remove()">` : ''}</div>`
    );
}

const SCHEDULE_CSS = `
#badge { width: 760px; padding: 16px 18px 18px; }
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.head h1 { font-size: 18px; font-weight: 800; }
.head .range { font-size: 13px; margin-left: auto; }
.grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
.day { border: 1px solid #e8ecf3; border-radius: 10px; padding: 8px 7px; min-height: 120px; background: #fafbfd; }
.day.today { border-color: #3b5bdb; background: #f1f4ff; }
.day.off { background: #f6f6f8; }
.dh { display: flex; align-items: baseline; gap: 4px; margin-bottom: 6px; }
.dh .wd { font-size: 13px; font-weight: 800; }
.dh .dt { font-size: 12px; }
.sun .wd { color: #e03131; } .sat .wd { color: #1971c2; }
.today .dh .dt { color: #3b5bdb; font-weight: 700; }
.ev { border-radius: 6px; padding: 5px 6px; margin-top: 5px; background: #fff; border-left: 3px solid #3b5bdb; }
.ev .t { font-size: 11px; font-weight: 700; color: #6b7487; }
.ev .d { font-size: 12.5px; font-weight: 700; line-height: 1.3; word-break: keep-all; overflow-wrap: anywhere; margin-top: 1px; }
.offtag { display: inline-block; font-size: 11.5px; font-weight: 700; color: #868e96; background: #e9ecef; border-radius: 5px; padding: 3px 7px; margin-top: 4px; }
.none { font-size: 12px; color: #c0c6d2; margin-top: 4px; }
.foot { font-size: 11.5px; margin-top: 10px; text-align: right; }
`;

export function scheduleBadgeHtml({ name, days, today, footer }) {
    const cells = days
        .map(({ date, offAir, events }) => {
            const wd = weekdayOf(date);
            const cls = ['day', date === today && 'today', offAir && 'off', wd === '일' && 'sun', wd === '토' && 'sat'].filter(Boolean).join(' ');
            const evs = events
                .map(
                    ev => `<div class="ev">${ev.time ? `<div class="t">${escapeHTML(ev.time)}</div>` : ''}
                      <div class="d">${escapeHTML(ev.text)}</div></div>`
                )
                .join('');
            return `<div class="${cls}"><div class="dh"><span class="wd">${wd}</span><span class="dt muted">${mmdd(date)}</span></div>
              ${offAir ? '<span class="offtag">휴방</span>' : ''}${evs}${!offAir && !events.length ? '<div class="none">-</div>' : ''}</div>`;
        })
        .join('');
    return page(
        `${name} 주간 일정`,
        SCHEDULE_CSS,
        `<div id="badge"><div class="head"><h1>${escapeHTML(name)} 주간 일정</h1>
          <span class="range muted">${mmdd(days[0].date)} ~ ${mmdd(days[6].date)}</span></div>
          <div class="grid">${cells}</div>
          <div class="foot muted">${escapeHTML(footer)}</div></div>`
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
