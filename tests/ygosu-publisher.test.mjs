import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { ygosuPublisher } from '../src/ygosu-publisher.mjs';
import { BOARD, postingKey } from '../src/autopost.mjs';

test('등록 성공과 실패 후 사이트 키 함수를 복원하고 옛 재등록 키를 무시한다', async () => {
    const originalKey = () => 'site-generated-key';
    let fail = false;
    const keys = [];
    const api = {
        createV3ArticleIdempotencyKey: originalKey,
        getV3ArticleWriteContext: () => ({ boardCode: BOARD }),
        getV3ArticleWritePayload: data => ({ categoryCode: data.get('category_code[]') }),
        submitV3ArticleWrite: async () => {
            keys.push(api.createV3ArticleIdempotencyKey());
            if (fail) throw new Error('network failure');
            return { article: { boardCode: BOARD, articleId: 900 } };
        },
    };
    const page = {
        on() {}, setDefaultTimeout() {}, async goto() {}, async waitForFunction() {},
        async evaluate(fn, args) {
            if (!args) return [{ text: '공지', href: `/board/${BOARD}?s_category=Cnotice` }];
            if (args.password) return 'SUCCESS';
            return vm.runInNewContext(`(${fn.toString()})(args)`, {
                args, YG_BOARD: api, document: { querySelector: () => ({}) },
                FormData: class extends Map {
                    constructor() { super([['csrf_token', 'token']]); }
                    append(key, value) { this.set(key, value); }
                },
            });
        },
    };
    const browser = { newContext: async () => ({ newPage: async () => page, close: async () => {} }) };
    const publisher = await ygosuPublisher(browser, {
        id: 'test', password: 'test', postingKeys: { '123': 'a'.repeat(64) },
    });
    const post = { titleNo: 123, regDate: '2026-10-12 12:00:00' };
    const uploads = [{ fileUrl: 'https://storage2.ygosu.com/?code=Stest', code: 'Stest', part: '1/1' }];
    try {
        assert.equal(await publisher.publish(post, uploads), 900);
        assert.equal(api.createV3ArticleIdempotencyKey, originalKey);
        fail = true;
        await assert.rejects(publisher.publish(post, uploads), /YGOSU_WRITE_HTTP_0_UNCLASSIFIED/);
        assert.equal(api.createV3ArticleIdempotencyKey, originalKey);
        assert.deepEqual(keys, [postingKey(123), postingKey(123)]);
    } finally { await publisher.close(); }
});
