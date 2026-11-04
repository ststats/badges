import test from 'node:test';
import assert from 'node:assert/strict';
import { monthWeeks, recentOwnPosts, weekDates, weekSchedule } from '../src/lib.mjs';
import { starEvents, starOffAir } from '../src/staruniv.mjs';

test('이번 주는 한국 시간 월요일부터', () => {
    // 2026-10-11 15:30 UTC = 10-12(월) 00:30 KST
    assert.deepEqual(weekDates(Date.parse('2026-10-11T15:30:00Z')), [
        '2026-10-12',
        '2026-10-13',
        '2026-10-14',
        '2026-10-15',
        '2026-10-16',
        '2026-10-17',
        '2026-10-18',
    ]);
    // 일요일은 그 주의 마지막 날
    assert.equal(weekDates(Date.parse('2026-10-11T05:00:00Z'))[0], '2026-10-05');
});

test('최근 글: 본인 글만, 고정 공지와 겹치면 한 번, 최신순', () => {
    const board = {
        contents: [
            { titleNo: 1, userId: 'member01', regDate: '2026-10-01 10:00:00' },
            { titleNo: 2, userId: 'fan', regDate: '2026-10-09 10:00:00' },
            { titleNo: 3, userId: 'MEMBER01', regDate: '2026-10-08 10:00:00' },
        ],
        noticeData: [
            { titleNo: 1, userId: 'member01', regDate: '2026-10-01 10:00:00' },
            { titleNo: 4, userId: 'member01', regDate: '2026-10-05 10:00:00' },
        ],
    };
    assert.deepEqual(
        recentOwnPosts(board, 'member01', 3).map(p => p.titleNo),
        [3, 4, 1]
    );
});

test('여러 날 일정은 걸친 날마다, 이번 달 달력은 일요일부터', () => {
    const now = Date.parse('2026-10-12T03:00:00Z');
    const days = weekSchedule(
        { events: [{ date: '2026-10-13', end: '2026-10-14', time: '', text: '연습', order: 0 }], offAir: new Set() },
        now
    );
    assert.deepEqual(
        days.map(d => d.events.length),
        [0, 1, 1, 0, 0, 0, 0]
    );
    const weeks = monthWeeks(now);
    assert.equal(weeks.length, 5);
    assert.deepEqual(
        [weeks[0][0], weeks[0][4], weeks[4][6]],
        [
            { date: '2026-09-27', inMonth: false },
            { date: '2026-10-01', inMonth: true },
            { date: '2026-10-31', inMonth: true },
        ]
    );
});

test('스타유니브 일정 행을 뱃지 일정으로', () => {
    const [a, b] = starEvents([
        {
            start_date: '2026-10-13',
            end_date: '2026-10-14',
            event_time: null,
            person: '캄몬',
            title: '비방연습',
            color: 'orange',
        },
        {
            start_date: '2026-10-15',
            end_date: '2026-10-15',
            event_time: '시간미정',
            person: '캄몬',
            title: '캄몬 VS 드림즈',
            color: 'blue',
        },
    ]);
    assert.deepEqual(a, {
        date: '2026-10-13',
        end: '2026-10-14',
        time: '',
        who: '캄몬',
        text: '비방연습',
        color: 'orange',
        order: 0,
        subjectType: 'other',
        participants: [],
        subjectLabel: '캄몬',
    });
    assert.equal(b.time, '시간미정');
});

test('스타유니브 휴방은 날짜별 멤버 이름으로', () => {
    const off = starOffAir(
        [
            { off_date: '2026-10-12', soop_id: 'a' },
            { off_date: '2026-10-12', soop_id: 'b' },
        ],
        [{ 'SOOP ID': 'a', 이름: '가나' }]
    );
    assert.deepEqual(off, {
        '2026-10-12': [
            { soopId: 'a', name: '가나' },
            { soopId: 'b', name: 'b' },
        ],
    });
});
