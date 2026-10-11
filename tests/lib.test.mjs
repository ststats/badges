import test from 'node:test';
import assert from 'node:assert/strict';
import { isMyEvent, recentOwnPosts, redirectHtml, weekDates, weekSchedule } from '../src/lib.mjs';

const match = { personKeywords: ['주양', '쏘', '소주'], teamNames: ['캄몬'] };

test('이번 주는 한국 시간 월요일부터', () => {
    // 2026-10-11 15:30 UTC = 10-12(월) 00:30 KST
    assert.deepEqual(weekDates(Date.parse('2026-10-11T15:30:00Z')), [
        '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18',
    ]);
    // 일요일은 그 주의 마지막 날
    assert.equal(weekDates(Date.parse('2026-10-11T05:00:00Z'))[0], '2026-10-05');
});

test('일정 담당자 줄임말과 팀 일정을 찾는다', () => {
    assert.ok(isMyEvent({ person: '쏘랑밍송' }, match));
    assert.ok(isMyEvent({ person: '주양두두송이' }, match));
    assert.ok(isMyEvent({ person: '캄몬', description: '점호' }, match));
    assert.ok(isMyEvent({ person: '두두', description: '주양CK' }, match));
    assert.ok(!isMyEvent({ person: '캄몬컵' }, match));
    assert.ok(!isMyEvent({ person: '윤환햇살두두', description: '클암CK' }, match));
});

test('주간 일정: 여러 날 일정·휴방·시간순', () => {
    const now = Date.parse('2026-10-08T03:00:00Z');
    const days = weekSchedule(
        {
            events: [
                { person: '캄몬', description: '늦은', start_date: '2026-10-06', event_time: '시간미정' },
                { person: '쏘', description: '이른', start_date: '2026-10-06', event_time: '9:00' },
                { person: '주양', description: '긴', start_date: '2026-10-04', end_date: '2026-10-06', event_time: '20:00' },
                { person: '마토', description: '남', start_date: '2026-10-06', event_time: '10:00' },
            ],
            offAir: [{ off_date: '2026-10-09', soop_id: 'soju2022' }, { off_date: '2026-10-10', soop_id: 'other' }],
        },
        now,
        { soopId: 'soju2022', ...match }
    );
    assert.deepEqual(days[0].events.map(e => e.description), ['긴']);
    assert.deepEqual(days[1].events.map(e => e.description), ['이른', '긴', '늦은']);
    assert.deepEqual(days.map(d => d.offAir), [false, false, false, false, true, false, false]);
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
