import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchRace, raceSlot } from '../src/rider-race.mjs';

test('2분마다 오는 호출 중 10분 칸에 걸린 한 번만 경기를 띄운다', () => {
    const at = m => new Date(Date.UTC(2026, 9, 30, 3, m, 5));
    assert.deepEqual(
        [0, 2, 4, 6, 8, 10, 12, 50].map(m => raceSlot(at(m))),
        [true, false, false, false, false, true, false, true]
    );
    assert.equal(raceSlot(at(21)), true); // 늦게 온 호출도 그 칸 안이면 띄운다
});

test('경기 녹화 작업을 main에서 띄운다', async () => {
    const calls = [];
    await dispatchRace('tok', async (url, init) => (calls.push([url, init]), { status: 204 }));
    assert.match(calls[0][0], /workflows\/rider-race\.yml\/dispatches$/);
    assert.deepEqual(JSON.parse(calls[0][1].body), { ref: 'main' });
    await assert.rejects(dispatchRace('tok', async () => ({ status: 403 })));
    await assert.rejects(dispatchRace('', async () => ({ status: 204 })));
});
