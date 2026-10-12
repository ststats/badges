// 합성 긴 공지: 원문/로그인 없이 전체 내용과 분할 이미지를 검증한다.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { chromium } from 'playwright';
import { noticeDocument, captureNotice } from '../src/notice-document.mjs';

const dest = path.resolve(process.argv[2] || 'work/autopost-preview');
await fs.mkdir(dest, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
    const fixture = await sharp({ create: { width: 700, height: 280, channels: 3, background: '#e8eefc' } }).png().toBuffer();
    const wrapped = { async newContext(opts) {
        const context = await browser.newContext(opts);
        await context.route('https://stimg.sooplive.co.kr/preview-*.png', route => route.fulfill({ contentType: 'image/png', body: fixture }));
        return context;
    } };
    const post = { titleNo: 1, titleName: '디자인 확인용 · 제목과 본문을 끝까지 담는 소주양 공지', regDate: '2026-10-12 21:00:00',
        content: { content: '<p>합성 미리보기입니다. 실제 소주양 공지가 아닙니다.</p>' + Array.from({ length: 100 }, (_, i) => `<p>${i + 1}번째 문단 — 긴 글도 줄 수 제한 없이 마지막까지 모두 담습니다.</p>`).join('') + '<p>마지막 문단: 여기까지 빠짐없이 출력되었습니다.</p>' },
        photos: Array.from({ length: 7 }, (_, i) => ({ url: `https://stimg.sooplive.co.kr/preview-${i + 1}.png` })) };
    const html = await noticeDocument({ name: '소주양', post, colors: { from: '#e8eefc', to: '#f3f0fb' } });
    const images = await captureNotice(wrapped, html);
    assert.ok(images.length > 1);
    const metas = await Promise.all(images.map(p => sharp(p).metadata()));
    assert.ok(metas.every(p => p.width === 1182 && p.height > 0));
    for (let i = 0; i < images.length; i++) await fs.writeFile(path.join(dest, `preview-${i + 1}.png`), images[i]);
    await fs.writeFile(path.join(dest, 'preview.html'), html);
    const stitched = await sharp({ create: { width: 1182, height: metas.reduce((n, p) => n + p.height, 0), channels: 3, background: '#fff' } }).composite(images.map((input, i) => ({ input, left: 0, top: metas.slice(0, i).reduce((n, p) => n + p.height, 0) }))).png().toBuffer();
    await fs.writeFile(path.join(dest, 'preview-full.png'), stitched);
    console.log(`전체 문단 100개·사진 7장 미리보기: ${images.length}장, 전체 ${metas.reduce((n, p) => n + p.height, 0)}px`);
} finally { await browser.close(); }
