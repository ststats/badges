// Vercel 정적 파일(public/): 편집 화면과 붙여 넣을 코드 모음(소주양·스타유니브). 뱃지 그림은 api/img.js가 그때그때 그린다.
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, root } from '../src/config.mjs';
import { escapeHTML as esc } from '../src/lib.mjs';

const out = path.join(root, 'public');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'edit'), { recursive: true });
await fs.copyFile(path.join(root, 'src/edit.html'), path.join(out, 'edit/index.html'));
await fs.copyFile(path.join(root, 'src/lib.mjs'), path.join(out, 'lib.mjs'));
await fs.copyFile(path.join(root, 'config.json'), path.join(out, 'config.json'));

const groups = [
    {
        name: config.name,
        badges: [
            ...Array.from({ length: config.noticeCount }, (_, i) => ({ img: `soju/notice-${i + 1}.png`, link: `soju/n/${i + 1}`, label: `최근 글 ${i + 1}` })),
            { img: 'soju/schedule.png', link: 'soju/s', label: '주간 일정' },
        ],
        note: '일정은 <a href="edit/">편집 화면</a>에서 고칩니다. 누르면 그 순간의 원글로 갑니다.',
    },
    {
        name: config.staruniv.name,
        badges: [
            { img: 'staruniv/schedule.png', link: 'staruniv/s', label: '주간 일정' },
            { img: 'staruniv/calendar.png', link: 'staruniv/s', label: '이번 달 일정' },
        ],
        note: '스타유니브 관리자 화면에서 일정을 고치면 1분 안에 바뀝니다.',
    },
];
await fs.writeFile(
    path.join(out, 'index.html'),
    `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>뱃지 모음</title>
<style>body{font-family:system-ui,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#18181b;background:#fafafa}
section{background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:16px;margin:14px 0}h2{font-size:22px;margin:32px 0 4px}h3{font-size:16px;margin:0 0 10px}
img{max-width:100%}textarea{width:100%;height:64px;font:12px monospace;margin-top:8px;box-sizing:border-box}</style></head><body>
<h1>뱃지 모음</h1>
<p>아래 코드를 커뮤니티 글(HTML 편집)에 붙이면 됩니다. 그림은 볼 때마다 지금 내용으로 바뀝니다(최대 1분 지연).</p>
${groups.map(g => `<h2>${esc(g.name)}</h2><p>${g.note}</p>
${g.badges.map(b => `<section data-img="${b.img}" data-link="${b.link}" data-label="${esc(`${g.name} ${b.label}`)}"><h3>${esc(b.label)}</h3></section>`).join('\n')}`).join('\n')}
<script>
for (const s of document.querySelectorAll('section')) {
    const code = '<a href="' + location.origin + '/' + s.dataset.link + '"><img src="' + location.origin + '/' + s.dataset.img + '" alt="' + s.dataset.label + '"></a>';
    s.insertAdjacentHTML('beforeend', code);
    const t = document.createElement('textarea');
    t.readOnly = true; t.value = code; t.onclick = () => t.select();
    s.append(t);
}
</script></body></html>
`
);
console.log('public/ 준비 완료');
