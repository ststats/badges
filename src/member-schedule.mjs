import { eventsOn, weekDates } from './lib.mjs';

const idOf = value =>
    String(value ?? '')
        .trim()
        .toLowerCase();

// 멤버 찾기: SOOP ID가 있으면 그것만 믿는다. 이름(사이트가 쓰는 두 글자 줄임 포함)은
// 딱 한 명만 맞을 때만 그 멤버로 본다.
export function resolveMember(members, name, soopId) {
    if (soopId !== undefined && soopId !== null && String(soopId).trim())
        return members.find(m => idOf(m['SOOP ID']) === idOf(soopId));
    const value = String(name || '').trim();
    const exact = members.filter(m => m['이름'] === value || idOf(m['SOOP ID']) === idOf(value));
    if (exact.length === 1) return exact[0];
    const short = value.length === 2 ? members.filter(m => String(m['이름']).slice(-2) === value) : [];
    return short.length === 1 ? short[0] : undefined;
}

// 일정의 참가자 → [{soop_id?, name}]. 등록 멤버면 이름을 멤버 목록 것으로 맞추고 같은 사람은 한 번만.
export function eventMembers(row, members) {
    const seen = new Set();
    return (Array.isArray(row.participants) ? row.participants : []).flatMap(p => {
        if (!p || typeof p !== 'object') return [];
        const member = resolveMember(members, p.name, p.soop_id);
        const entry = member
            ? { soop_id: String(member['SOOP ID']), name: member['이름'] }
            : { ...(p.soop_id != null ? { soop_id: String(p.soop_id) } : {}), name: String(p.name || p.soop_id || '') };
        const key = idOf(entry.soop_id || entry.name);
        if (!key || seen.has(key)) return [];
        seen.add(key);
        return [entry];
    });
}

// 멤버 한 명의 이번 주: 그 멤버가 참가자이거나 개인 주체인 일정과 그 멤버의 휴방
export function memberWeek(data, soopId, now) {
    const member = resolveMember(data.members, '', soopId);
    if (!member) throw Object.assign(new Error('등록되지 않은 멤버입니다'), { status: 404 });
    const id = idOf(member['SOOP ID']);
    const events = data.events.filter(
        ev =>
            ev.participants.some(p => idOf(p.soop_id) === id) ||
            (ev.subjectType === 'person' && idOf(resolveMember(data.members, ev.who)?.['SOOP ID']) === id)
    );
    return {
        name: member['이름'],
        soopId: String(member['SOOP ID']),
        days: weekDates(now).map(date => ({
            date,
            offAir: (data.offAir[date] || []).some(p => idOf(p.soopId) === id),
            events: eventsOn(events, date),
        })),
    };
}

// 주체 옆 인원(스타유니브 달력 calSubjectLabel과 같은 규칙): 개인은 본인을 뺀 '외 N인', 단체·대회는 'N인'
export function subjectLabel(event, members) {
    const owner = resolveMember(members, event.who);
    const subject = owner ? String(owner['이름']).slice(-2) : event.who;
    if (!event.participants.length) return subject;
    if (event.subjectType === 'person') {
        const hasOwner = event.participants.some(p =>
            owner && p.soop_id
                ? idOf(p.soop_id) === idOf(owner['SOOP ID'])
                : (resolveMember(members, p.name, p.soop_id)?.['이름']?.slice(-2) || p.name) === subject
        );
        const extras = event.participants.length - (hasOwner ? 1 : 0);
        return extras ? `${subject} 외 ${extras}인` : subject;
    }
    return `${subject} · ${event.participants.length}인`;
}
