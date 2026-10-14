// 캄몬스타즈 일정·로고: 스타유니브 사이트가 쓰는 공개 Supabase 함수를 그대로 읽는다.
// 관리자 화면에서 고치면 1분 안에 뱃지에 반영된다.
import { config } from './config.mjs';
import { keepFresh } from './cache.mjs';
import { rpc } from './store.mjs';
import { eventMembers, resolveMember, subjectLabel } from './member-schedule.mjs';

// 사이트 일정 행 → 뱃지 일정 {date, end, time, who, text, color, order, subjectType, participants, subjectLabel}
export function starEvents(rows, members = []) {
    return (rows || [])
        .filter(r => r?.start_date)
        .map((r, order) => {
            const time = String(r.event_time || '').trim();
            const text = String(r.title || '').trim();
            const subject = String(r.person || '').trim();
            const owner = r.subject_type === 'person' ? resolveMember(members, subject) : null;
            const event = { date: r.start_date, end: r.end_date || r.start_date, time, who: owner?.['이름'] || subject, text, color: r.color || '', order,
                subjectType: r.subject_type || 'other', participants: eventMembers(r, members) };
            return { ...event, subjectLabel: subjectLabel(event, members) };
        });
}

// 휴방: 날짜별 멤버 [{soopId, name}] (이름은 멤버 목록에서, 없으면 SOOP ID)
export function starOffAir(rows, members) {
    const names = new Map((members || []).map(m => [String(m['SOOP ID']), m['이름']]));
    const byDate = {};
    for (const r of rows || []) if (r?.off_date && r.soop_id != null) {
        const id = String(r.soop_id);
        const day = (byDate[r.off_date] ||= []);
        if (!day.some(m => m.soopId === id)) day.push({ soopId: id, name: names.get(id) || id });
    }
    return byDate;
}

export const starSchedule = keepFresh(
    async () => {
        const [schedule, holidays, members] = await Promise.all([
            rpc('api_schedule', {}),
            rpc('api_holidays', {}).catch(() => ({})),
            rpc('api_site_members', {}),
        ]);
        const list = members?.members || [];
        return {
            members: list,
            events: starEvents(schedule?.events, list),
            offAir: starOffAir(schedule?.offAir, list),
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
