// Read-only end-to-end verification against a local server or deployed site.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

const base = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const dest = process.argv[3];
const membersResponse = await fetch(`${base}/api/members`);
assert.equal(membersResponse.status, 200);
const members = await membersResponse.json();
assert.ok(members.some(m => m.soopId === 'soju2022'));
assert.ok(members.some(m => m.soopId === 'minchul'));
for (const route of ['soju/schedule.png', 'member/soju2022/schedule.png', 'member/minchul/schedule.png', 'staruniv/today.png', 'staruniv/calendar.png']) {
    const response = await fetch(`${base}/${route}`);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /image\/png/);
    const image = Buffer.from(await response.arrayBuffer());
    const meta = await sharp(image).metadata();
    assert.equal(meta.width, 900, route);
    assert.ok(meta.height > 0);
    if (dest) { await fs.mkdir(dest, { recursive: true }); await fs.writeFile(path.join(dest, route.replaceAll('/', '-')), image); }
    console.log(`${route}: ${meta.width}×${meta.height}`);
}
assert.equal((await fetch(`${base}/member/unknown-member/schedule.png`)).status, 404);
assert.equal((await fetch(`${base}/api/save`)).status, 410);
assert.equal((await fetch(`${base}/api/save`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({file:'schedule',content:'must not save'}) })).status, 410);
for (const route of ['/edit','/edit/']) {
    const response = await fetch(base + route, {redirect:'manual'});
    assert.ok([302,307,308].includes(response.status));
    assert.equal(response.headers.get('location'),'https://staruniv.vercel.app/schedule/');
}
const browser = await chromium.launch({headless:true,channel:'chrome'});
try {
    const context = await browser.newContext({permissions:['clipboard-read','clipboard-write']});
    const page = await context.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(()=>!document.getElementById('member-select').disabled);
    for (const [id,name] of [['minchul','김민철'],['soju2022','소주양']]) {
        await page.selectOption('#member-select',id);
        assert.equal(await page.locator('[data-key="soju"] h2').textContent(),name);
        assert.equal(await page.locator('[data-key="soju"] .shot img').getAttribute('src'),`/member/${id}/schedule.png`);
        await page.locator('[data-key="soju"] [data-copy="code"]').click();
        const copied = await page.evaluate(()=>navigator.clipboard.readText());
        assert.ok(copied.includes(`${base}/member/${id}/schedule.png`));
        assert.ok(copied.includes(`https://www.sooplive.co.kr/station/${id}`));
    }
    assert.equal(await page.getByText('일정 편집',{exact:true}).count(),0);
    assert.deepEqual(errors,[]);
    if(dest) {await page.setViewportSize({width:1280,height:1000});await page.screenshot({path:path.join(dest,'badges-page.png'),fullPage:true});}
    console.log(`멤버 선택·복사 코드·이전 편집 경로·오류 응답 검증 완료 (${members.length}명)`);
} finally {await browser.close();}
