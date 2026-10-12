import test from 'node:test';
import assert from 'node:assert/strict';
import { monthWeeks, parseSchedule, weekSchedule } from '../src/lib.mjs';
import { renderCalendar, renderNotice, renderSchedule, renderToday } from '../src/render.mjs';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
// 프로필 사진을 못 받아도(없는 ID) 그림은 나와야 한다
const soopId = 'no-such-user-for-test';

test('일정 뱃지를 PNG로 그린다', async () => {
    const now = Date.parse('2026-10-14T05:00:00Z');
    const days = weekSchedule(parseSchedule('10.12 20:00 주양CK\n10.13 휴방\n10.14 시간미정 합방', now), now);
    const png = await renderSchedule({ name: '소주양', soopId, days, today: '2026-10-14', footer: '방송국 가기' });
    assert.deepEqual(png.subarray(0, 4), PNG);
});

test('글 뱃지를 PNG로 그린다(글 없음 포함)', async () => {
    const post = { titleNo: 1, titleName: '제목', regDate: '2026-10-11 01:26:00', content: { content: '<p>첫 줄</p><p></p><p>둘째 줄</p>' }, photos: [] };
    assert.deepEqual((await renderNotice({ name: '소주양', soopId, post, lines: 10 })).subarray(0, 4), PNG);
    assert.deepEqual((await renderNotice({ name: '소주양', soopId, post, lines: 3 })).subarray(0, 4), PNG);
    assert.deepEqual((await renderNotice({ name: '소주양', soopId, post: undefined, lines: 3 })).subarray(0, 4), PNG);
});

test('스타유니브 오늘의 일정·달력을 PNG로 그린다(로고·사진을 못 받아도)', async () => {
    const now = Date.parse('2026-10-12T03:00:00Z');
    const events = [{ date: '2026-10-12', end: '2026-10-14', time: '20:00', who: '캄몬', text: '종겜', color: 'blue', order: 0 }];
    const star = { name: '캄몬스타즈', logo: 'http://127.0.0.1:9/none.webp' };
    const offAir = [{ soopId: 'no-such-user-for-test', name: '누구' }];
    assert.deepEqual((await renderToday({ ...star, date: '2026-10-12', events, offAir })).subarray(0, 4), PNG);
    assert.deepEqual((await renderToday({ ...star, date: '2026-10-12', events: [] })).subarray(0, 4), PNG);
    assert.deepEqual((await renderCalendar({ ...star, weeks: monthWeeks(now), events, holidays: ['2026-10-09'], today: '2026-10-12' })).subarray(0, 4), PNG);
});
