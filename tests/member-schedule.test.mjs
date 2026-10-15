import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { memberWeek, resolveMember, subjectLabel } from '../src/member-schedule.mjs';
import { starEvents, starOffAir } from '../src/staruniv.mjs';
import { renderSchedule, renderToday, renderCalendar } from '../src/render.mjs';
import { monthWeeks } from '../src/lib.mjs';

const now = Date.parse('2026-10-14T05:00:00Z');
const members = [
    { 이름: '한멤버', 'SOOP ID': 'member01' },
    { 이름: '김민철', 'SOOP ID': 'minchul' },
    { 이름: '숫자', 'SOOP ID': 123 },
];
const rows = [
    {
        start_date: '2026-10-13',
        end_date: '2026-10-14',
        person: '대회',
        subject_type: 'competition',
        title: '참가 경기',
        participants: [{ soop_id: 'member01', name: '옛이름', role: '출전' }],
    },
    { start_date: '2026-10-14', person: '민철', subject_type: 'person', title: '개인 주체', participants: [] },
    { start_date: '2026-10-14', person: '한멤버', subject_type: 'group', title: '이름이 같은 단체', participants: [] },
    {
        start_date: '2026-10-14',
        person: '대회',
        subject_type: 'competition',
        title: '다른 멤버',
        participants: [{ soop_id: 'minchul', name: '한멤버' }],
    },
];
const data = {
    members,
    events: starEvents(rows, members),
    offAir: starOffAir([{ off_date: '2026-10-14', soop_id: 'member01' }], members),
};

test('달력 주체 옆 인원은 스타유니브 달력과 같다', () => {
    const people = [
        { soop_id: 'minchul', name: '김민철' },
        { soop_id: 'member01', name: '한멤버' },
    ];
    assert.equal(subjectLabel({ who: '김민철', subjectType: 'person', participants: people }, members), '민철 외 1인');
    assert.equal(
        subjectLabel({ who: '민철', subjectType: 'person', participants: people.slice(0, 1) }, members),
        '민철'
    );
    assert.equal(
        subjectLabel({ who: '한멤버', subjectType: 'person', participants: people.slice(0, 1) }, members),
        '멤버 외 1인'
    );
    assert.equal(subjectLabel({ who: '캄몬', subjectType: 'group', participants: people }, members), '캄몬 · 2인');
    assert.equal(
        subjectLabel({ who: 'ASL22', subjectType: 'competition', participants: people }, members),
        'ASL22 · 2인'
    );
    assert.equal(subjectLabel({ who: '김민철', subjectType: 'person', participants: [] }, members), '민철');
    const [event] = starEvents(
        [{ ...rows[0], person: '민철', subject_type: 'person', participants: [...people, people[0]] }],
        members
    );
    assert.equal(event.subjectLabel, '민철 외 1인');
});

test('멤버 주간 일정: SOOP ID 기준, 개인 주체, 여러 날 일정, 멤버별 휴방', () => {
    const week = memberWeek(data, 'member01', now);
    assert.deepEqual(
        week.days.map(d => d.events.length),
        [0, 1, 1, 0, 0, 0, 0]
    );
    assert.equal(week.days[2].offAir, true);
    assert.deepEqual(week.days[2].events[0].participants, [{ soop_id: 'member01', name: '한멤버' }]);
    assert.equal(week.days[2].events[0].who, '대회');
    const other = memberWeek(data, 'minchul', now);
    assert.equal(other.days[2].offAir, false);
    assert.deepEqual(
        other.days[2].events.map(e => e.text),
        ['개인 주체', '다른 멤버']
    );
    assert.equal(resolveMember(members, '', '123')['이름'], '숫자');
    assert.equal(resolveMember(members, '한멤버', 'wrong'), undefined);
    assert.equal(resolveMember([...members, { 이름: '박민철', 'SOOP ID': 'other' }], '민철'), undefined);
    assert.throws(() => memberWeek(data, 'unknown', now), { status: 404 });
});

test('일정 뱃지 PNG는 빈 달력까지 모두 가로 900px', async t => {
    t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 404 }));
    const who = { name: '한멤버', soopId: 'member01' };
    const pngs = [
        await renderSchedule({ ...memberWeek(data, 'member01', now), today: '2026-10-14' }),
        await renderToday({ ...who, date: '2026-10-14', events: [], offAir: [] }),
        await renderCalendar({ ...who, weeks: monthWeeks(now), today: '2026-10-14', events: [] }),
    ];
    for (const png of pngs) assert.equal((await sharp(png).metadata()).width, 900);
});
