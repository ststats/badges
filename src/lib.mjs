// 데이터 가공(글 목록·일정). 네트워크·파일은 다루지 않는다.

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export const escapeHTML = s =>
    String(s ?? '').replace(
        /[&<>"']/g,
        c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );

// SOOP 날짜('2026-10-08 20:15:43')는 한국 시간이다
const soopDateMs = s => Date.parse(String(s || '').replace(' ', 'T') + '+09:00') || 0;

export const postUrl = (soopId, titleNo) =>
    `https://www.sooplive.co.kr/station/${encodeURIComponent(soopId)}/post/${encodeURIComponent(titleNo)}`;

// 게시판 목록 API. 방송국 '전체 글' 화면이 부르는 것과 같은 값으로 부른다(로그인 쿠키를 붙이면 즐겨찾기 글도 온다).
export const boardApiUrl = (soopId, host = 'api-channel.sooplive.com') =>
    `https://${host}/v1.1/channel/${encodeURIComponent(soopId)}/board?perPage=20&startDate=&endDate=&` +
    'field=title,contents,user_nick,user_id,hashtags&keyword=&type=all&orderBy=reg_date&page=1&bbsNo=';

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
    const monday =
        Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - ((kst.getUTCDay() + 6) % 7) * DAY_MS;
    return Array.from({ length: 7 }, (_, i) => new Date(monday + i * DAY_MS).toISOString().slice(0, 10));
}

export const kstToday = nowMs => new Date(nowMs + KST_OFFSET_MS).toISOString().slice(0, 10);

const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const timeKey = t => (TIME_RE.test(t || '') ? t.padStart(5, '0') : '99:99');

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
        weeks.push(
            Array.from({ length: 7 }, (_, i) => {
                const date = new Date(t + i * DAY_MS).toISOString().slice(0, 10);
                return { date, inMonth: Number(date.slice(5, 7)) === m };
            })
        );
    return weeks;
}

export const mmdd = date => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;

export const weekdayOf = date => WEEKDAYS[new Date(date + 'T00:00:00Z').getUTCDay()];

export function formatPostDate(regDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})/.exec(regDate || '');
    return m ? `${Number(m[2])}.${Number(m[3])} (${weekdayOf(`${m[1]}-${m[2]}-${m[3]}`)}) ${m[4]}:${m[5]}` : '';
}
