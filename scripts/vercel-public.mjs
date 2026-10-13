// Vercel 정적 파일(public/): 뱃지 모음 화면과 공용 CSS. 뱃지 그림은 api/img.js가 그때그때 그린다.
// 화면의 <!--head:제목-->, <!--topbar:탭--> 자리는 src/shell.mjs로 채운다(/status와 같은 머리·위 막대).
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from '../src/config.mjs';
import { head, topbar } from '../src/shell.mjs';

const out = path.join(root, 'public');
const page = async (src, dest) => {
    const html = (await fs.readFile(path.join(root, src), 'utf-8'))
        .replace(/<!--head:(.+?)-->/, (_, title) => head(title))
        .replace(/<!--topbar:(\w+)-->/, (_, tab) => topbar(tab));
    await fs.mkdir(path.dirname(path.join(out, dest)), { recursive: true });
    await fs.writeFile(path.join(out, dest), html);
};

await fs.rm(out, { recursive: true, force: true });
await page('src/index.html', 'index.html');
for (const [src, dest] of [['src/site.css', 'site.css'], ['src/lib.mjs', 'lib.mjs'], ['config.json', 'config.json']])
    await fs.copyFile(path.join(root, src), path.join(out, dest));
console.log('public/ 준비 완료');
