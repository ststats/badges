import { BOARD, articleBody } from './autopost.mjs';
import { config } from './config.mjs';
import { profile } from './render.mjs';
import { captureNotice, noticeDocument } from './notice-document.mjs';
import { createHash } from 'node:crypto';

export async function ygosuPublisher(browser, { id, password }) {
    if (!id || !password) throw new Error('YGOSU_ID와 YGOSU_PASSWORD Secrets가 필요합니다');
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    await page.goto(`https://ygosu.com/board/${BOARD}`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof YG_LOGIN_API !== 'undefined' && typeof YG_LOGIN_SESSION !== 'undefined');
    const login = await page.evaluate(async ({ id, password, board }) => {
        await YG_LOGIN_SESSION.beginLogin();
        try {
            const r = await YG_LOGIN_API.request('password', { login_id: id, login_pwd: password, auto_login: 'N', back_url: `/board/${board}` });
            return String(r.msg || 'UNKNOWN');
        } finally { YG_LOGIN_SESSION.endLogin(); }
    }, { id, password, board: BOARD });
    if (login !== 'SUCCESS') { await context.close(); throw new Error('와고 자동 로그인 실패 또는 추가 인증 필요'); }
    return {
        close: () => context.close(),
        async prepare(post) {
            const who = await profile({ soopId: config.soopId, theme: config.theme });
            const html = await noticeDocument({ name: config.name, post, ...who });
            const images = await captureNotice(browser, html);
            await page.goto(`https://ygosu.com/board/${BOARD}/?mode=write`, { waitUntil: 'domcontentloaded' });
            await page.waitForFunction(() => typeof YG_BOARD !== 'undefined' && typeof STORAGE !== 'undefined' && document.querySelector('form[name="writeform"]'));
            const parent = await page.evaluate(board => {
                const form = document.querySelector('form[name="writeform"]');
                const ctx = YG_BOARD.getV3ArticleWriteContext(form);
                if (!ctx || ctx.boardCode !== board || ctx.mode !== 'write') throw new Error('와고 글쓰기 권한/폼 확인 실패');
                const data = new FormData(form);
                if (data.get('parent_code')) return String(data.get('parent_code'));
                // 실제 폼이 업로드/등록 버튼에 넣은 부모 코드만 사용한다.
                for (const el of document.querySelectorAll('[onclick],[onchange]')) {
                    const code = `${el.getAttribute('onclick') || ''} ${el.getAttribute('onchange') || ''}`;
                    const match = /(?:board_file_upload|check_board_write)\(\s*['"]([^'"]+)['"]/.exec(code);
                    if (match) return match[1];
                }
                throw new Error('와고 첨부 부모 코드를 확인할 수 없습니다');
            }, BOARD);
            const uploads = [];
            for (let i = 0; i < images.length; i++) {
                const result = await page.evaluate(async ({ base64, parent, name }) => {
                    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
                    const file = new File([bytes], name, { type: 'image/png' });
                    const result = await STORAGE.uploadV3(file, parent, 'EDITOR');
                    if (result.msg !== 'SUCCESS' || !result.fileUrl || !result.storage_code) throw new Error('와고 이미지 업로드 실패');
                    return { fileUrl: result.fileUrl, code: result.storage_code };
                }, { base64: images[i].toString('base64'), parent, name: `soju-${post.titleNo}-${i + 1}.png` });
                const url = new URL(result.fileUrl, 'https://ygosu.com');
                if (url.protocol !== 'https:' || !/(^|\.)ygosu\.com$/.test(url.hostname)) throw new Error('와고 업로드 이미지 주소 확인 실패');
                uploads.push({ ...result, fileUrl: url.href, part: `${i + 1}/${images.length}` });
            }
            return uploads;
        },
        async publish(post, uploads) {
            const subject = `[소주양 공지] ${post.titleName || '(제목 없음)'}`;
            const body = articleBody(config.soopId, post, uploads);
            const key = createHash('sha256').update(`soju:${BOARD}:${post.titleNo}`).digest('hex');
            return page.evaluate(async ({ board, subject, body, codes, key }) => {
                const form = document.querySelector('form[name="writeform"]');
                const ctx = YG_BOARD.getV3ArticleWriteContext(form);
                if (!ctx || ctx.boardCode !== board) throw new Error('와고 글쓰기 문맥 변경');
                const data = new FormData(form);
                data.set('subject', subject);
                data.set('body', body);
                data.set('storage_code_list_editor', codes.join(','));
                const payload = YG_BOARD.getV3ArticleWritePayload(data, ctx);
                // 글 내용이 같으면 실행을 넘어 같은 멱등키를 사용한다.
                YG_BOARD.createV3ArticleIdempotencyKey = () => key;
                // 캡차/추가 인증 오류는 자동 해결하지 않고 중단한다.
                const result = await YG_BOARD.submitV3ArticleWrite(ctx, payload, String(data.get('csrf_token') || ''));
                const article = result?.article;
                if (article?.boardCode !== board || !Number.isSafeInteger(Number(article.articleId)) || Number(article.articleId) < 1) throw new Error('와고 등록 결과 확인 실패');
                return Number(article.articleId);
            }, { board: BOARD, subject, body, codes: uploads.map(x => x.code), key });
        },
    };
}
