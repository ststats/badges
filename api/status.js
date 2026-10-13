// /status: 로그인 쿠키가 잘 먹는지, 쿠키 확인용 최근 글, 쿠키 바꾸기(저장은 /api/save, 편집 비밀번호)
// /status.json: 같은 내용을 뱃지 모음·편집 화면이 읽어 쿠키 문제를 알린다
//   state: none(쿠키 없음) | error(SOOP이 거절) | stale(즐겨찾기 글이 하나도 안 보임 → 만료 의심) | ok | unknown
import { config } from '../src/config.mjs';
import { query, sendJson } from '../src/http.mjs';
import { escapeHTML, formatPostDate } from '../src/lib.mjs';
import { cookieStatus } from '../src/live.mjs';
import { head, topbar } from '../src/shell.mjs';

const FIX = '아래 "SOOP 쿠키 바꾸기"에서 새 쿠키를 넣으세요.';
const MESSAGES = {
    none: '쿠키 없음: 공지 자동 등록에 필요한 로그인 쿠키를 아래 "SOOP 쿠키 바꾸기"에서 넣으세요.',
    error: e => `쿠키로 게시판을 읽지 못했습니다(${e}). 만료됐거나 잘못 복사된 것 같습니다. ${FIX} 공지 자동 등록은 공개 글로 대체하지 않고 중단합니다.`,
    ok: n => `쿠키로 즐겨찾기 전용 글까지 받고 있습니다. 최근 글 중 공개 목록에 없는 글 ${n}개.`,
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
    const pill = { ok: ['ok', '쿠키 정상'], none: ['', '쿠키 없음'], unknown: ['', '확인 못 함'] }[state] || ['warn', '쿠키 확인 필요'];
    res.end(`<!doctype html><html lang="ko"><head>${head(`${config.name} 뱃지 상태`)}
<style>.st { padding: 18px 20px; margin-top: 18px; line-height: 1.7; color: var(--body); }
.st .pill { margin-bottom: 8px; }
.posts { padding: 6px 0; margin-top: 18px; list-style: none; }
.posts li { display: flex; gap: 12px; align-items: baseline; padding: 12px 20px; border-top: 1px solid var(--tint); }
.posts li:first-child { border-top: 0; }
.posts b { flex: 1; } .posts small { color: var(--sub); white-space: nowrap; }
h2 { font-size: 16px; margin: 28px 0 0; }
.change { padding: 18px 20px; margin-top: 18px; }
.change ol { padding-left: 18px; margin: 0 0 8px; color: var(--body); font-size: 14px; line-height: 1.8; }
.change textarea, .change input { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 9px 10px; margin: 6px 0; background: #fff; }
.change textarea { min-height: 84px; font: 12px ui-monospace, monospace; resize: vertical; }
.change textarea:focus, .change input:focus { outline: 2px solid #c7d2fe; border-color: transparent; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.row input { flex: 1; min-width: 180px; margin: 0; }
.msg { font-size: 13px; margin: 8px 0 0; } .msg.err { color: var(--red); } .msg.ok { color: var(--green); }</style></head><body>
${topbar('status')}
<main class="wrap">
<h1 class="page-title">상태</h1>
<p class="lead">${escapeHTML(config.name)} 공지 자동 등록에 사용하는 SOOP 쿠키 상태를 확인합니다.</p>
<div class="card st"><span class="pill ${pill[0]}">${pill[1]}</span><div>${text}</div></div>
<h2>쿠키 확인용 최근 글</h2>
<ol class="card posts">${posts.map(p => `<li><b>${escapeHTML(p.titleName)}</b><small>${escapeHTML(formatPostDate(p.regDate))}</small></li>`).join('') || '<li><small>없음</small></li>'}</ol>
<h2 id="change">SOOP 쿠키 바꾸기</h2>
<section class="card change">
  <ol>
    <li>PC 크롬에서 SOOP에 로그인한 채로 <a href="https://www.sooplive.co.kr/station/${encodeURIComponent(config.soopId)}/board" target="_blank" rel="noopener">${escapeHTML(config.name)} 게시판</a> 열기</li>
    <li>F12 → Network → 새로고침 → 이름에 <b>board</b>가 들어간 요청 → Headers → Request Headers의 <b>cookie</b> 값 전체 복사</li>
    <li>아래에 붙여 넣고 저장</li>
  </ol>
  <p class="hint">저장하면 서버가 SOOP에서 먹히는지 먼저 확인하고 암호화해서 저장해요(암호문만 저장). 바로 적용돼요.</p>
  <textarea id="cookie" placeholder="AbroadChk=OK; …" autocomplete="off" spellcheck="false"></textarea>
  <div class="row">
    <input id="pw" type="password" placeholder="편집 비밀번호" autocomplete="current-password">
    <button class="btn primary" id="save" type="button">쿠키 저장</button>
  </div>
  <div class="msg" id="msg"></div>
</section>
</main>
<script>
// 쿠키 변경 비밀번호는 이 브라우저에 기억한다
const PW_KEY = 'badges-edit-password';
const $ = id => document.getElementById(id);
try { $('pw').value = localStorage.getItem(PW_KEY) || ''; } catch {}
const msg = (text, cls = '') => { $('msg').textContent = text; $('msg').className = 'msg ' + cls; };
$('save').addEventListener('click', async () => {
    const password = $('pw').value;
    const cookie = $('cookie').value.trim();
    if (!cookie) return msg('쿠키를 붙여 넣어 주세요.', 'err');
    if (!password) return msg('편집 비밀번호를 넣어 주세요.', 'err');
    $('save').disabled = true;
    msg('SOOP에서 이 쿠키가 먹는지 확인하고 저장하는 중…');
    try {
        const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, file: 'cookie', cookie }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '서버 ' + res.status);
        try { localStorage.setItem(PW_KEY, password); } catch {}
        $('cookie').value = '';
        msg(data.extraCount
            ? '저장했어요. 즐겨찾기 전용 글 ' + data.extraCount + '개가 보이는 쿠키예요. 곧 새로고침해서 상태를 다시 보여 드려요.'
            : '저장했어요. 다만 이 쿠키로도 즐겨찾기 전용 글이 안 보여요(로그인이 풀린 쿠키일 수 있어요).', data.extraCount ? 'ok' : 'err');
        if (data.extraCount) setTimeout(() => location.reload(), 1500);
    } catch (e) {
        msg('저장하지 못했어요: ' + e.message, 'err');
    } finally {
        $('save').disabled = false;
    }
});
</script>
</body></html>`);
}
