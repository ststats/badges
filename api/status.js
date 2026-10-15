// /status: SOOP 쿠키 상태·바꾸기와 멤버별 공지 자동 등록 켜기(저장은 /api/save, 편집 비밀번호)
import { escapeHTML } from '../src/lib.mjs';
import { cookieStatus } from '../src/live.mjs';
import { head, topbar } from '../src/shell.mjs';
import { currentMembers } from '../src/staruniv.mjs';
import { getTargets } from '../src/store.mjs';

const FIX = '아래 "SOOP 쿠키 바꾸기"에서 새 쿠키를 넣으세요.';
const COOKIE = {
    none: [
        '',
        '쿠키 없음',
        '쿠키가 없어 공개 글만 확인합니다. 즐겨찾기 전용 글까지 올리려면 아래에서 쿠키를 넣으세요.',
    ],
    ok: ['ok', '쿠키 정상', 'SOOP이 저장된 쿠키를 받아 줍니다. 즐겨찾기 전용 글까지 확인합니다.'],
    error: [
        'warn',
        '쿠키 확인 필요',
        e =>
            `SOOP이 쿠키를 받지 않았습니다(${e}). 만료됐거나 잘못 복사된 것 같습니다. 그동안은 공개 글만 확인합니다. ${FIX}`,
    ],
    unknown: ['', '확인 못 함', e => `쿠키 상태를 확인하지 못했습니다(${e}).`],
};

// json은 <script> 안에 넣으므로 </script>가 끊지 않게 <를 바꾼다
const inlineJson = value => JSON.stringify(value).replace(/</g, '\\u003c');

export default async function handler(req, res) {
    const [cookie, members, targets] = await Promise.all([
        cookieStatus().catch(e => ({ state: 'unknown', error: e.message })),
        currentMembers().catch(() => null),
        getTargets().catch(() => null),
    ]);
    const [pillClass, pillText, message] = COOKIE[cookie.state] || COOKIE.unknown;
    const text = typeof message === 'function' ? message(escapeHTML(cookie.error || '')) : message;
    const saved = new Map((targets || []).map(t => [t.soopId, t]));
    const rows = (members || []).map(m => {
        const t = saved.get(m.soopId.toLowerCase());
        return {
            soopId: m.soopId,
            name: m.name,
            board: t?.board || '',
            enabled: !!t?.enabled,
            blocked: !!t?.blocked,
        };
    });
    const loadError = !members
        ? '멤버 목록을 불러오지 못했습니다. 새로고침해 주세요.'
        : !targets
          ? '자동 등록 설정을 읽지 못했습니다(supabase/autopost.sql 실행 여부를 확인하세요).'
          : '';
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(`<!doctype html><html lang="ko"><head>${head('뱃지 상태')}
<style>.st { padding: 18px 20px; margin-top: 18px; line-height: 1.7; color: var(--body); }
.st .pill { margin-bottom: 8px; }
h2 { font-size: 16px; margin: 28px 0 0; }
.box { padding: 18px 20px; margin-top: 18px; }
.box ol { padding-left: 18px; margin: 0 0 8px; color: var(--body); font-size: 14px; line-height: 1.8; }
.box textarea, .box input[type=text], .box input[type=password] { width: 100%; border: 1px solid var(--line); border-radius: 10px; padding: 9px 10px; margin: 6px 0; background: #fff; font: inherit; }
.box textarea { min-height: 84px; font: 12px ui-monospace, monospace; resize: vertical; }
.box textarea:focus, .box input:focus { outline: 2px solid #c7d2fe; border-color: transparent; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
.box .row input { flex: 1; min-width: 180px; margin: 0; }
.targets { list-style: none; padding: 0; margin: 0 0 8px; }
.targets li { display: grid; grid-template-columns: 22px minmax(70px, 120px) minmax(0, 1fr); gap: 10px; align-items: center; padding: 10px 0; border-top: 1px solid var(--tint); }
.targets li:first-child { border-top: 0; }
.targets input[type=checkbox] { width: 18px; height: 18px; margin: 0; }
.targets b { font-size: 14px; }
.targets small { grid-column: 2 / -1; color: var(--red); font-size: 12px; }
.msg { font-size: 13px; margin: 8px 0 0; } .msg.err { color: var(--red); } .msg.ok { color: var(--green); }</style></head><body>
${topbar('status')}
<main class="wrap">
<h1 class="page-title">상태</h1>
<p class="lead">공지 자동 등록에 쓰는 SOOP 쿠키와, 멤버별 자동 등록을 켜고 끕니다.</p>
<div class="card st"><span class="pill ${pillClass}">${pillText}</span><div>${text}</div></div>

<h2 id="autopost">공지 자동 등록</h2>
<section class="card box">
  <p class="hint">켠 멤버의 새 SOOP 글을 그 멤버의 와고 게시판에 올립니다. 켠 뒤에 올라온 글부터 올리고, 아무도 켜지 않으면 아무 것도 올리지 않아요.
  게시판은 와고 게시판 주소나 이름(예: <code>pan_이름</code>)을 넣으세요.</p>
  ${loadError ? `<p class="msg err">${escapeHTML(loadError)}</p>` : ''}
  <ul class="targets" id="targets"></ul>
  <div class="row">
    <input id="pw-targets" type="password" placeholder="편집 비밀번호" autocomplete="current-password">
    <button class="btn primary" id="save-targets" type="button"${loadError ? ' disabled' : ''}>설정 저장</button>
  </div>
  <div class="msg" id="msg-targets"></div>
</section>

<h2 id="change">SOOP 쿠키 바꾸기</h2>
<section class="card box">
  <ol>
    <li>PC 크롬에서 SOOP에 로그인한 채로 아무 멤버의 방송국 게시판 열기</li>
    <li>F12 → Network → 새로고침 → 이름에 <b>board</b>가 들어간 요청 → Headers → Request Headers의 <b>cookie</b> 값 전체 복사</li>
    <li>아래에 붙여 넣고 저장</li>
  </ol>
  <p class="hint">저장하면 서버가 SOOP에서 먹히는지 먼저 확인하고 암호화해서 저장해요(암호문만 저장). 바로 적용돼요.</p>
  <textarea id="cookie" placeholder="AbroadChk=OK; …" autocomplete="off" spellcheck="false"></textarea>
  <div class="row">
    <input id="pw-cookie" type="password" placeholder="편집 비밀번호" autocomplete="current-password">
    <button class="btn primary" id="save-cookie" type="button">쿠키 저장</button>
  </div>
  <div class="msg" id="msg-cookie"></div>
</section>
</main>
<script>
// 편집 비밀번호는 이 브라우저에 기억한다
const PW_KEY = 'badges-edit-password';
const $ = id => document.getElementById(id);
const rows = ${inlineJson(rows)};
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
$('targets').innerHTML = rows.map((r, i) => \`
  <li>
    <input type="checkbox" id="on-\${i}" \${r.enabled ? 'checked' : ''} aria-label="\${esc(r.name)} 자동 등록">
    <label for="on-\${i}"><b>\${esc(r.name)}</b></label>
    <input type="text" id="board-\${i}" value="\${esc(r.board)}" placeholder="와고 게시판 (pan_…)" aria-label="\${esc(r.name)} 와고 게시판" autocomplete="off" spellcheck="false">
    \${r.blocked ? '<small>등록이 멈췄어요: 와고 등록 결과를 확인한 뒤 껐다 켜면 다시 시작해요</small>' : ''}
  </li>\`).join('') || '<li><small>멤버 없음</small></li>';
try { $('pw-targets').value = $('pw-cookie').value = localStorage.getItem(PW_KEY) || ''; } catch {}
const msg = (key, text, cls = '') => { $('msg-' + key).textContent = text; $('msg-' + key).className = 'msg ' + cls; };
async function save(key, body) {
    const password = $('pw-' + key).value;
    if (!password) return msg(key, '편집 비밀번호를 넣어 주세요.', 'err');
    $('save-' + key).disabled = true;
    msg(key, '저장하는 중…');
    try {
        const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, ...body }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || '서버 ' + res.status);
        try { localStorage.setItem(PW_KEY, password); } catch {}
        msg(key, '저장했어요. 곧 새로고침해서 상태를 다시 보여 드려요.', 'ok');
        setTimeout(() => location.reload(), 1200);
    } catch (e) {
        msg(key, '저장하지 못했어요: ' + e.message, 'err');
    } finally {
        $('save-' + key).disabled = false;
    }
}
$('save-targets').addEventListener('click', () =>
    save('targets', { file: 'targets', targets: rows.map((r, i) => ({ soopId: r.soopId, enabled: $('on-' + i).checked, board: $('board-' + i).value })) }));
$('save-cookie').addEventListener('click', () => {
    const cookie = $('cookie').value.trim();
    if (!cookie) return msg('cookie', '쿠키를 붙여 넣어 주세요.', 'err');
    save('cookie', { file: 'cookie', cookie });
});
</script>
</body></html>`);
}
