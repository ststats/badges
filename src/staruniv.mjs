// 캄몬스타즈 일정·로고: 스타유니브 사이트가 쓰는 공개 Supabase 함수를 그대로 읽는다.
// 관리자 화면에서 고치면 1분 안에 뱃지에 반영된다.
import { config } from './config.mjs';
import { keepFresh } from './cache.mjs';
import { rpc } from './store.mjs';

const TIME_RE = /^\d{1,2}:\d{2}$/;

// 사이트 일정 행 → 뱃지 일정 {date, end, time, who, text, color, order}
// 시간 칸에 '비방연습'처럼 글이 들어 있고 내용이 없으면 그 글을 내용으로 쓴다.
export function starEvents(rows) {
    return (rows || [])
        .filter(r => r?.start_date)
        .map((r, order) => {
            let time = String(r.event_time || '').trim();
            let text = String(r.description || '').trim();
            if (!text && time && !TIME_RE.test(time) && time !== '시간미정') [text, time] = [time, ''];
            return { date: r.start_date, end: r.end_date || r.start_date, time, who: String(r.person || '').trim(), text, color: r.color || '', order };
        });
}

// 휴방: 날짜별 멤버 [{soopId, name}] (이름은 멤버 목록에서, 없으면 SOOP ID)
export function starOffAir(rows, members) {
    const names = new Map((members || []).map(m => [m['SOOP ID'], m['이름']]));
    const byDate = {};
    for (const r of rows || []) if (r?.off_date && r.soop_id) (byDate[r.off_date] ||= []).push({ soopId: r.soop_id, name: names.get(r.soop_id) || r.soop_id });
    return byDate;
}

export const starSchedule = keepFresh(
    async () => {
        const [schedule, holidays, members] = await Promise.all([
            rpc('api_schedule', {}),
            rpc('api_holidays', {}).catch(() => ({})),
            rpc('api_site_members', {}).catch(() => ({})),
        ]);
        return {
            events: starEvents(schedule?.events),
            offAir: starOffAir(schedule?.offAir, members?.members),
            holidays: new Set(Object.keys(holidays || {}).filter(d => holidays[d])),
        };
    },
    { ms: 30000, label: '스타유니브 일정' }
);

// 로고: 스타유니브 관리자 '팀 로고'에 올린 그림(이름으로 찾음). 바꾸면 10분 안에 뱃지도 바뀐다. 없으면 null.
export const starLogo = keepFresh(
    async () => {
        const [row] = (await rpc('api_university_logos', { p_names: [config.staruniv.name] })) || [];
        return row?.path ? `${config.supabase.url}/storage/v1/object/public/staruniv-media/${row.path.split('/').map(encodeURIComponent).join('/')}` : null;
    },
    { ms: 10 * 60 * 1000, label: '팀 로고' }
);
