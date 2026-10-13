import { eventsOn, weekDates } from './lib.mjs';

const idOf = value => String(value ?? '').trim().toLowerCase();

// IDs are authoritative. Names (including the site's two-letter subject label)
// are resolved only when exactly one registered member matches.
export function resolveMember(members, name, soopId) {
    if (soopId !== undefined && soopId !== null && String(soopId).trim())
        return members.find(m => idOf(m['SOOP ID']) === idOf(soopId));
    const value = String(name || '').trim();
    const exact = members.filter(m => m['이름'] === value || idOf(m['SOOP ID']) === idOf(value));
    if (exact.length === 1) return exact[0];
    const short = value.length === 2 ? members.filter(m => String(m['이름']).slice(-2) === value) : [];
    return short.length === 1 ? short[0] : undefined;
}

export function eventMembers(row, members) {
    const seen = new Set();
    return (Array.isArray(row.participants) ? row.participants : []).flatMap(p => {
        if (!p || typeof p !== 'object') return [];
        const member = resolveMember(members, p.name, p.soop_id);
        const entry = member ? { soop_id: String(member['SOOP ID']), name: member['이름'] }
            : { ...(p.soop_id != null ? { soop_id: String(p.soop_id) } : {}), name: String(p.name || p.soop_id || '') };
        const key = idOf(entry.soop_id || entry.name);
        if (!key || seen.has(key)) return [];
        seen.add(key);
        return [entry];
    });
}

export function memberWeek(data, soopId, now) {
    const member = resolveMember(data.members, '', soopId);
    if (!member) throw Object.assign(new Error('등록되지 않은 멤버입니다'), { status: 404 });
    const id = idOf(member['SOOP ID']);
    const events = data.events.filter(ev => ev.participants.some(p => idOf(p.soop_id) === id)
        || (ev.subjectType === 'person' && idOf(resolveMember(data.members, ev.who)?.['SOOP ID']) === id));
    return {
        name: member['이름'], soopId: String(member['SOOP ID']),
        days: weekDates(now).map(date => ({ date,
            offAir: (data.offAir[date] || []).some(p => idOf(p.soopId) === id),
            events: eventsOn(events, date),
        })),
    };
}
