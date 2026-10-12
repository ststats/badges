// 데이터 가공(글 목록·일정). 네트워크·파일은 다루지 않는다. 서버(src/render.mjs 등)와 편집 화면이 같이 쓴다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const escapeHTML = s =>
    String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// SOOP 날짜('2026-10-08 20:15:43')는 한국 시간이다
const soopDateMs = s => Date.parse(String(s || '').replace(' ', 'T') + '+09:00') || 0;

export const postUrl = (soopId, titleNo) =>
    `https://www.sooplive.co.kr/station/${encodeURIComponent(soopId)}/post/${encodeURIComponent(titleNo)}`;

// 게시판 목록 API. 방송국 '전체 글' 화면이 부르는 것과 같은 값으로 부른다(로그인 쿠키를 붙이면 즐겨찾기 글도 온다).
export const boardApiUrl = (soopId, host = 'api-channel.sooplive.com') =>
    `https://${host}/v1.1/channel/${encodeURIComponent(soopId)}/board?perPage=20&startDate=&endDate=&` +
    'field=title,contents,user_nick,user_id,hashtags&keyword=&type=all&orderBy=reg_date&page=1&bbsNo=';

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

// 일정 글: 한 줄에 '날짜 [시간] 내용'. 내용이 '휴방'이면 휴방일. #로 시작하는 줄과 빈 줄은 건너뛴다.
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

// 날짜마다 그날 일정(시간순). 여러 날 일정(end)은 걸친 날마다 나온다.
export const eventsOn = (events, date) =>
    events
        .filter(ev => ev.date <= date && date <= (ev.end || ev.date))
        .sort((a, b) => timeKey(a.time).localeCompare(timeKey(b.time)) || a.order - b.order);

export function weekSchedule({ events, offAir }, nowMs) {
    return weekDates(nowMs).map(date => ({ date, offAir: offAir.has(date), events: eventsOn(events, date) }));
}

// 한국 시간 기준 이번 달 달력: 일요일부터 시작하는 주 단위 [[{date, inMonth}, ...7], ...]
export function monthWeeks(nowMs) {
    const [y, m] = kstToday(nowMs).split('-').map(Number);
    const first = Date.UTC(y, m - 1, 1);
    const start = first - new Date(first).getUTCDay() * DAY_MS;
    const last = Date.UTC(y, m, 0);
    const weeks = [];
    for (let t = start; t <= last; t += 7 * DAY_MS)
        weeks.push(Array.from({ length: 7 }, (_, i) => {
            const date = new Date(t + i * DAY_MS).toISOString().slice(0, 10);
            return { date, inMonth: Number(date.slice(5, 7)) === m };
        }));
    return weeks;
}

export const mmdd = date => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;

export const weekdayOf = date => WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];

// 편집 화면이 저장할 때 쓴다. 연도가 헷갈리지 않게 날짜는 늘 YYYY-MM-DD로 적는다.
export function serializeSchedule({ events, offAir }) {
    const lines = [
        ...[...offAir].map(date => ({ date, order: -1, line: `${date} 휴방` })),
        ...events.map((ev, i) => ({
            date: ev.date,
            order: i,
            time: ev.time,
            line: [ev.date, ev.time, String(ev.text).replace(/\s+/g, ' ').trim()].filter(Boolean).join(' '),
        })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.order < 0 ? -1 : b.order < 0 ? 1 : timeKey(a.time).localeCompare(timeKey(b.time)) || a.order - b.order));
    let out = '';
    let last = '';
    for (const l of lines) {
        if (last && l.date.slice(0, 10) !== last) out += '\n';
        out += l.line + '\n';
        last = l.date;
    }
    return out;
}

// 편집 화면용: 한 주 앞뒤로 옮긴 날의 이번 주
export const shiftWeek = (nowMs, weeks) => nowMs + weeks * 7 * DAY_MS;

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
