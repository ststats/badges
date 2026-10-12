// /status: 로그인 쿠키가 잘 먹는지와 지금 뱃지에 들어가는 글
// /status.json: 같은 내용을 편집 화면이 읽어 쿠키 만료를 알린다
//   state: none(쿠키 없음) | error(SOOP이 거절) | stale(즐겨찾기 글이 하나도 안 보임 → 만료 의심) | ok | unknown
import { config } from '../src/config.mjs';
import { query, sendJson } from '../src/http.mjs';
import { escapeHTML, formatPostDate } from '../src/lib.mjs';
import { cookieStatus } from '../src/live.mjs';

const FIX = '편집 화면(/edit/)의 "SOOP 쿠키 바꾸기"에서 새 쿠키를 넣으세요.';
const MESSAGES = {
    none: '쿠키 없음: 공개 글만 나옵니다. 즐겨찾기 글까지 넣으려면 편집 화면(/edit/)의 "SOOP 쿠키 바꾸기"에서 넣으세요.',
    error: e => `⚠️ 쿠키로 게시판을 읽지 못했습니다(${e}). 만료됐거나 잘못 복사된 것 같습니다. ${FIX} 지금은 공개 글만 나옵니다.`,
    ok: n => `✅ 쿠키로 즐겨찾기 전용 글까지 받고 있습니다. 최근 글 중 공개 목록에 없는 글 ${n}개.`,
    stale: '쿠키는 들어 있지만 최근 글 20개 중 즐겨찾기 전용 글이 없습니다(지금 없거나, 쿠키가 로그인 상태가 아닐 수 있습니다).',
};

export default async function handler(req, res) {
    let state = 'unknown';
    let text;
    let extraCount = 0;
    let posts = [];
    try {
        const st = await cookieStatus();
        ({ posts } = st);
        extraCount = st.extra.length;
        state = !st.hasCookie ? 'none' : st.error ? 'error' : extraCount ? 'ok' : 'stale';
        text = state === 'error' ? MESSAGES.error(escapeHTML(st.error)) : state === 'ok' ? MESSAGES.ok(extraCount) : MESSAGES[state];
    } catch (e) {
        text = `게시판을 읽지 못했습니다: ${escapeHTML(e.message)}`;
    }
    if (query(req).get('format') === 'json')
        return sendJson(res, 200, { state, extraCount, posts: posts.map(p => ({ title: p.titleName, date: p.regDate })) });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHTML(config.name)} 뱃지 상태</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:24px auto;padding:0 16px;color:#18181b;background:#fafafa;line-height:1.6}
.st{background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:12px 14px}li{margin:4px 0}</style></head><body>
<h1>${escapeHTML(config.name)} 뱃지 상태</h1><div class="st">${text}</div>
<h2>지금 뱃지에 들어가는 글</h2><ol>${posts.map(p => `<li>${escapeHTML(p.titleName)} <small>(${escapeHTML(formatPostDate(p.regDate))})</small></li>`).join('')}</ol>
<p><a href="/">뱃지·코드 모음</a> · <a href="/edit/">일정 편집</a></p></body></html>`);
}
