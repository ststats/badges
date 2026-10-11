import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchedule, recentOwnPosts, redirectHtml, weekDates, weekSchedule } from '../src/lib.mjs';

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

test('이동 페이지는 주소를 스크립트 밖으로 새지 않게 넣는다', () => {
    const html = redirectHtml('https://example.com/a"</script><b>');
    assert.ok(!html.includes('</script><b>'));
    assert.ok(html.includes('content="0;url=https://example.com/a&quot;'));
});
