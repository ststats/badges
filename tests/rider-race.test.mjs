import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchRace, latestRaceSha, raceCacheSeconds, raceSlot } from '../src/rider-race.mjs';

test('2분마다 오는 호출 중 정각 8분 전 한 번만 경기를 띄운다', () => {
    const at = m => new Date(Date.UTC(2026, 9, 30, 3, m, 5));
    assert.deepEqual(
        [0, 2, 4, 6, 8, 10, 12, 52].map(m => raceSlot(at(m))),
        [false, true, false, false, false, false, true, true]
    );
    assert.equal(raceSlot(at(23)), true); // 늦게 온 호출도 그 칸 안이면 띄운다
});

test('최신 경기 커밋을 읽고, 모양이 틀리면 막는다', async () => {
    const sha = 'a'.repeat(40);
    assert.equal(await latestRaceSha('t', async () => ({ ok: true, json: async () => ({ object: { sha } }) })), sha);
    await assert.rejects(latestRaceSha('t', async () => ({ ok: true, json: async () => ({ object: { sha: 'x' } }) })));
    await assert.rejects(latestRaceSha('t', async () => ({ ok: false })));
});

test('경기 녹화 작업을 main에서 띄운다', async () => {
    const calls = [];
    await dispatchRace('tok', async (url, init) => (calls.push([url, init]), { status: 204 }));
    assert.match(calls[0][0], /workflows\/rider-race\.yml\/dispatches$/);
    assert.deepEqual(JSON.parse(calls[0][1].body), { ref: 'main' });
    await assert.rejects(dispatchRace('tok', async () => ({ status: 403 })));
    await assert.rejects(dispatchRace('', async () => ({ status: 204 })));
});

test('정각 직후 30초는 기억하지 않고, 그 밖에는 다음 정각을 넘지 않게 최대 60초 기억한다', () => {
    const at = (m, sec) => Date.UTC(2026, 9, 30, 3, m, sec);
    assert.equal(raceCacheSeconds(at(10, 0)), 0);
    assert.equal(raceCacheSeconds(at(10, 29)), 0);
    assert.equal(raceCacheSeconds(at(10, 30)), 60);
    assert.equal(raceCacheSeconds(at(19, 59)), 1);
});
