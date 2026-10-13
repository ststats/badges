// 세 화면(뱃지 모음 · 일정 편집 · 상태)이 같이 쓰는 머리와 위 막대. 한 사이트처럼 오가게 모양을 맞춘다.
// 정적 화면(src/index.html, src/edit.html)은 빌드(scripts/vercel-public.mjs)가 자리표시를 이걸로 바꾸고,
// /status(api/status.js)는 직접 쓴다.
import { escapeHTML as esc } from './lib.mjs';

const TABS = [
    ['home', '/', '뱃지 모음'],
    ['edit', '/edit/', '일정 편집'],
    ['status', '/status', '상태'],
];

export const head = title => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="/site.css">`;

export const topbar = active => `<header class="top"><nav class="top-in" aria-label="메뉴">
  <a class="brand" href="/"><span class="brand-dot" aria-hidden="true"></span>뱃지</a>
  <div class="tabs">${TABS.map(([key, href, label]) => `<a class="tab${key === active ? ' on' : ''}" href="${href}"${key === active ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</div>
</nav></header>`;
