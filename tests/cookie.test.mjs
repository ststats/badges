import test from 'node:test';
import assert from 'node:assert/strict';

process.env.COOKIE_KEY = 'test-key-for-unit-tests-123456';
const { encryptCookie, decryptCookie } = await import('../src/live.mjs');

test('쿠키 암호문은 같은 열쇠로만 풀린다', () => {
    const enc = encryptCookie('PdboxTicket=abc; 한글=값');
    assert.ok(!enc.includes('PdboxTicket'));
    assert.equal(decryptCookie(enc), 'PdboxTicket=abc; 한글=값');
    process.env.COOKIE_KEY = 'another-key-1234567890';
    assert.throws(() => decryptCookie(enc));
});
