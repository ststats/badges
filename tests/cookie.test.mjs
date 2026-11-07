import test from 'node:test';
import assert from 'node:assert/strict';
import { decryptCookie, encryptCookie } from '../src/soop-board.mjs';

const key = 'test-key-for-unit-tests-123456';

test('쿠키 암호문은 같은 열쇠로만 풀린다', async () => {
    const enc = await encryptCookie('PdboxTicket=abc; 한글=값', key);
    assert.ok(!enc.includes('PdboxTicket'));
    assert.equal(await decryptCookie(enc, key), 'PdboxTicket=abc; 한글=값');
    await assert.rejects(decryptCookie(enc, 'another-key-1234567890'));
});
