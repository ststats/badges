import fs from 'node:fs/promises';
import path from 'node:path';
import sanitize from 'sanitize-html';
import sharp from 'sharp';
import { root } from './config.mjs';
import { escapeHTML, formatPostDate } from './lib.mjs';

export function safeImage(url) {
    try {
        const u = new URL(url);
        return u.protocol === 'https:' && /(^|\.)(sooplive\.(com|co\.kr)|afreecatv\.com|afreeca\.com)$/.test(u.hostname) ? u.href : '';
    } catch { return ''; }
}

export function fullContent(post) {
    if (!post.content || typeof post.content.content !== 'string') {
        // summary/textContent는 잘릴 수 있어서 전체 본문 대신 쓰지 않는다.
        throw new Error('SOOP 전체 본문이 없습니다. 요약본으로 자동 등록하지 않았습니다');
    }
    const html = sanitize(post.content.content, {
        allowedTags: [...sanitize.defaults.allowedTags, 'img', 'br', 's', 'u'],
        allowedAttributes: { a: ['href'], img: ['src', 'alt'], '*': ['style'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] },
        allowedStyles: { '*': { 'text-align': [/^(left|center|right)$/], color: [/^#[0-9a-f]{3,8}$/i], 'font-weight': [/^(bold|[1-9]00)$/], 'text-decoration': [/^(underline|line-through)$/] } },
        allowedSchemes: ['https', 'http'],
        transformTags: {
            img: (_tag, attrs) => {
                const src = safeImage(attrs.src);
                if (!src) throw new Error('지원하지 않는 원문 이미지 주소입니다. 이미지를 생략하지 않고 중단했습니다');
                return { tagName: 'img', attribs: { src, alt: attrs.alt || '' } };
            },
            // 재생 가능한 첨부는 이미지에 담을 수 없으므로 자동 게시 전 확인을 요구한다.
            iframe: () => { throw new Error('원문에 영상이 있습니다. 이미지로 모두 담을 수 없어 등록을 중단했습니다'); },
            video: () => { throw new Error('원문에 영상이 있습니다. 이미지로 모두 담을 수 없어 등록을 중단했습니다'); },
        },
    });
    const present = new Set([...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(m => m[1].replace(/&amp;/g, '&')));
    const extras = (post.photos || []).map(p => {
        const url = safeImage(p.url);
        if (!url) throw new Error('사진 주소를 확인할 수 없습니다');
        if (present.has(url)) return '';
        present.add(url);
        return `<p><img src="${escapeHTML(url)}" alt="첨부 사진"></p>`;
    }).join('');
    return html + extras;
}

export async function noticeDocument({ name, post, avatar, colors }) {
    const fonts = await Promise.all([['Regular', 400], ['Bold', 700], ['ExtraBold', 800]].map(async ([name, weight]) => {
        const data = await fs.readFile(path.join(root, 'fonts', `Pretendard-${name}.woff`));
        return `@font-face{font-family:Pretendard;src:url(data:font/woff;base64,${data.toString('base64')});font-weight:${weight}}`;
    }));
    const from = /^#[0-9a-f]{6}$/i.test(colors?.from) ? colors.from : '#eceef3';
    const to = /^#[0-9a-f]{6}$/i.test(colors?.to) ? colors.to : '#f5f5f7';
    return `<!doctype html><html lang="ko"><meta charset="utf-8"><style>${fonts.join('')}
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#18181b;font-family:Pretendard,sans-serif}body{width:788px;padding:10px 14px 18px}.card{width:760px;border-radius:22px;border:1px solid #eee;overflow:hidden;box-shadow:0 3px 8px #18181b12}.head{display:flex;align-items:center;gap:14px;padding:24px 26px;background:radial-gradient(circle at 12% 0%,#ffffffbf,transparent 55%),linear-gradient(120deg,${from},${to});border-bottom:1px solid #18181b0f}.avatar{width:52px;height:52px;border-radius:50%;object-fit:cover;border:2.5px solid white}.name{font-size:24px;font-weight:800}.date{font-size:13px;color:#71717a;margin-top:4px}.tag{margin-left:auto;font-size:13px;font-weight:700;border-radius:99px;background:#ffffffb3;padding:8px 13px}.body{padding:24px 28px 20px}h1{font-size:25px;line-height:1.45;margin:0 0 18px;overflow-wrap:anywhere}.content{font-size:18px;line-height:1.75;overflow-wrap:anywhere;color:#3f3f46}.content p{margin:0 0 12px;min-height:1em}.content img{display:block;max-width:100%;width:auto;height:auto;margin:14px auto;object-fit:contain}.content table{width:100%;border-collapse:collapse;table-layout:fixed}.content td,.content th{border:1px solid #ddd;padding:7px}.content pre{white-space:pre-wrap}.foot{padding:0 28px 24px;font-size:13px;color:#71717a;text-align:right}
</style><div class="card"><header class="head">${avatar ? `<img class="avatar" src="${avatar}">` : ''}<div><div class="name">${escapeHTML(name)}</div><div class="date">${escapeHTML(formatPostDate(post.regDate))}</div></div><div class="tag">SOOP 공지</div></header><main class="body"><h1>${escapeHTML(post.titleName || '(제목 없음)')}</h1><article class="content">${fullContent(post)}</article></main><footer class="foot">원문 링크는 글 아래에 있어요</footer></div></html>`;
}

// 동일한 디자인의 독립 이미지. 줄 수/사진 수 제한, 썸네일 자르기를 적용하지 않는다.
export async function captureNotice(browser, html) {
    const context = await browser.newContext({ viewport: { width: 788, height: 1000 }, deviceScaleFactor: 1.5 });
    try {
        const page = await context.newPage();
        await page.route('**/*', route => safeImage(route.request().url()) ? route.fallback() : route.abort());
        await page.setContent(html, { waitUntil: 'load', timeout: 45000 });
        await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map(async img => {
                if (!img.complete) await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
                if (!img.naturalWidth) throw new Error('원문 사진 로딩 실패');
                await img.decode();
            }));
        });
        const layout = await page.evaluate(() => {
            const spans = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                if (walker.currentNode.parentElement.closest('style,script')) continue;
                const range = document.createRange();
                range.selectNodeContents(walker.currentNode);
                for (const r of range.getClientRects()) if (r.height) spans.push([r.top, r.bottom]);
            }
            for (const img of document.images) { const r = img.getBoundingClientRect(); spans.push([r.top, r.bottom]); }
            return { height: Math.ceil(document.body.getBoundingClientRect().height), spans };
        });
        if (layout.height > 100000) throw new Error('공지 이미지가 너무 깁니다. 생략하지 않고 등록을 중단했습니다');
        const full = await page.screenshot({ type: 'png', fullPage: true });
        const meta = await sharp(full).metadata();
        const scale = meta.width / 788;
        const images = [];
        for (let y = 0; y < layout.height;) {
            let end = Math.min(y + 1800, layout.height);
            if (end < layout.height) {
                // 줄/사진 사이에서 나눈다. 한 장이 1800px보다 긴 사진은 연속 조각으로 보존한다.
                for (let n = 0; n < layout.spans.length; n++) {
                    const crossing = layout.spans.find(([top, bottom]) => top < end && bottom > end);
                    if (!crossing || crossing[0] <= y + 300) break;
                    end = Math.floor(crossing[0]);
                }
            }
            const top = Math.round(y * scale);
            const bottom = Math.min(meta.height, Math.round(end * scale));
            images.push(await sharp(full).extract({ left: 0, top, width: meta.width, height: bottom - top }).png().toBuffer());
            y = end;
        }
        return images;
    } finally { await context.close(); }
}
