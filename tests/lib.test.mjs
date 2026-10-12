import test from 'node:test';
import assert from 'node:assert/strict';
import { monthWeeks, parseSchedule, postText, serializeSchedule, recentOwnPosts, weekDates, weekSchedule } from '../src/lib.mjs';
import { starEvents } from '../src/staruniv.mjs';

test('이번 주는 한국 시간 월요일부터', () => {
    // 2026-10-11 15:30 UTC = 10-12(월) 00:30 KST
    assert.deepEqual(weekDates(Date.parse('2026-10-11T15:30:00Z')), [
        '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ]);
    // 일요일은 그 주의 마지막 날
    assert.equal(weekDates(Date.parse('2026-10-11T05:00:00Z'))[0], '2026-10-05');
});

test('schedule.txt 읽기: 시간 생략·휴방·주석·잘못된 줄', () => {
    const now = Date.parse('2026-10-08T03:00:00Z');
    const { events, offAir, errors } = parseSchedule(
        ['# 주석', '', '10.6 시간미정 늦은', '10.6 9:00 이른', '2026-10-06 20:00 캄몬 VS 드림즈', '10.9 휴방', '10.10 20:00', '13.40 이상', '10.7 그냥'].join('\n'),
        now
    );
    const days = weekSchedule({ events, offAir }, now);
    assert.deepEqual(days[1].events.map(e => [e.time, e.text]), [['9:00', '이른'], ['20:00', '캄몬 VS 드림즈'], ['시간미정', '늦은']]);
    assert.deepEqual(days[2].events.map(e => [e.time, e.text]), [['', '그냥']]);
    assert.deepEqual(days.map(d => d.offAir), [false, false, false, false, true, false, false]);
    assert.equal(errors.length, 2);
});

test('연도 없는 날짜는 가까운 해', () => {
    const dec = Date.parse('2026-12-28T03:00:00Z');
    assert.equal(parseSchedule('1.2 신년', dec).events[0].date, '2027-01-02');
    assert.equal(parseSchedule('12.30 연말', dec).events[0].date, '2026-12-30');
});

test('최근 글: 본인 글만, 고정 공지와 겹치면 한 번, 최신순', () => {
    const board = {
        contents: [
            { titleNo: 1, userId: 'soju2022', regDate: '2026-10-01 10:00:00' },
            { titleNo: 2, userId: 'fan', regDate: '2026-10-09 10:00:00' },
            { titleNo: 3, userId: 'SOJU2022', regDate: '2026-10-08 10:00:00' },
        ],
        noticeData: [{ titleNo: 1, userId: 'soju2022', regDate: '2026-10-01 10:00:00' }, { titleNo: 4, userId: 'soju2022', regDate: '2026-10-05 10:00:00' }],
    };
    assert.deepEqual(recentOwnPosts(board, 'soju2022', 3).map(p => p.titleNo), [3, 4, 1]);
});

test('본문은 HTML에서 줄바꿈을 살려 뽑는다', () => {
    const post = { content: { textContent: '잘린 글 ...', content: '<p dpt=1>첫 줄&nbsp;&amp;</p><p></p><p></p><p>둘<br>셋 &#x1F600;</p>' } };
    assert.equal(postText(post), '첫 줄 &\n\n둘\n셋 \u{1F600}');
    assert.equal(postText({ content: { textContent: '가<br>나' } }), '가\n나');
});

test('편집 화면 저장 형식은 다시 읽어도 같다', () => {
    const now = Date.parse('2026-10-08T03:00:00Z');
    const parsed = parseSchedule('10.7 시간미정 늦은\n10.7 9:00 이른\n10.9 휴방\n10.6 내용  두 칸', now);
    const text = serializeSchedule(parsed);
    assert.equal(text, '2026-10-06 내용 두 칸\n\n2026-10-07 9:00 이른\n2026-10-07 시간미정 늦은\n\n2026-10-09 휴방\n');
    const again = parseSchedule(text, now);
    assert.deepEqual(weekSchedule(again, now), weekSchedule(parsed, now).map(d => ({ ...d, events: d.events.map((e, i) => ({ ...e, order: weekSchedule(again, now).find(x => x.date === d.date).events[i].order })) })));
});

test('여러 날 일정은 걸친 날마다, 이번 달 달력은 일요일부터', () => {
    const now = Date.parse('2026-10-12T03:00:00Z');
    const days = weekSchedule({ events: [{ date: '2026-10-13', end: '2026-10-14', time: '', text: '연습', order: 0 }], offAir: new Set() }, now);
    assert.deepEqual(days.map(d => d.events.length), [0, 1, 1, 0, 0, 0, 0]);
    const weeks = monthWeeks(now);
    assert.equal(weeks.length, 5);
    assert.deepEqual([weeks[0][0], weeks[0][4], weeks[4][6]], [
        { date: '2026-09-27', inMonth: false }, { date: '2026-10-01', inMonth: true }, { date: '2026-10-31', inMonth: true },
    ]);
});

test('스타유니브 일정 행을 뱃지 일정으로', () => {
    const [a, b] = starEvents([
        { start_date: '2026-10-13', end_date: '2026-10-14', event_time: '비방연습', person: '캄몬', description: null, color: 'orange' },
        { start_date: '2026-10-15', end_date: '2026-10-15', event_time: '시간미정', person: '캄몬', description: '캄몬 VS 드림즈', color: 'blue' },
    ]);
    assert.deepEqual(a, { date: '2026-10-13', end: '2026-10-14', time: '', who: '캄몬', text: '비방연습', color: 'orange', order: 0 });
    assert.equal(b.time, '시간미정');
});
