import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { memberWeek, resolveMember } from '../src/member-schedule.mjs';
import { starEvents, starOffAir } from '../src/staruniv.mjs';
import { renderSchedule, renderToday, renderCalendar } from '../src/render.mjs';
import { monthWeeks } from '../src/lib.mjs';
import save from '../api/save.js';
import { getFile, putFile } from '../src/store.mjs';

const now = Date.parse('2026-10-14T05:00:00Z');
const members = [{이름: '소주양', 'SOOP ID': 'soju2022'}, {이름: '김민철', 'SOOP ID': 'minchul'}, {이름: '숫자', 'SOOP ID': 123}];
const rows = [
    {start_date:'2026-10-13',end_date:'2026-10-14',person:'대회',subject_type:'competition',title:'참가 경기',participants:[{soop_id:'soju2022',name:'옛이름',role:'출전'}]},
    {start_date:'2026-10-14',person:'민철',subject_type:'person',title:'개인 주체',participants:[]},
    {start_date:'2026-10-14',person:'소주양',subject_type:'group',title:'이름이 같은 단체',participants:[]},
    {start_date:'2026-10-14',person:'대회',subject_type:'competition',title:'다른 멤버',participants:[{soop_id:'minchul',name:'소주양'}]},
];
const data = {members, events:starEvents(rows,members),offAir:starOffAir([{off_date:'2026-10-14',soop_id:'soju2022'}],members)};

test('member schedule uses authoritative IDs, individual subjects, date ranges, and per-member off-air', () => {
    const soju = memberWeek(data,'soju2022',now);
    assert.deepEqual(soju.days.map(d=>d.events.length),[0,1,1,0,0,0,0]);
    assert.equal(soju.days[2].offAir,true);
    assert.deepEqual(soju.days[2].events[0].participants,[{soop_id:'soju2022',name:'소주양'}]);
    assert.equal(soju.days[2].events[0].who,'대회');
    const other = memberWeek(data,'minchul',now);
    assert.equal(other.days[2].offAir,false);
    assert.deepEqual(other.days[2].events.map(e=>e.text),['개인 주체','다른 멤버']);
    assert.equal(resolveMember(members,'','123')['이름'],'숫자');
    assert.equal(resolveMember(members,'소주양','wrong'),undefined);
    assert.equal(resolveMember([...members,{이름:'박민철','SOOP ID':'other'}],'민철'),undefined);
    assert.throws(()=>memberWeek(data,'unknown',now),{status:404});
});

test('retired schedule read/write APIs cannot read or recreate duplicate storage', async () => {
    for (const method of ['GET','POST']) {
        const req = Readable.from([JSON.stringify({file:'schedule',content:'new'})]);
        req.method = method;
        const res = {setHeader(){},end(body){this.body=body;}};
        await save(req,res);
        assert.equal(res.statusCode,410);
    }
    await assert.rejects(getFile('schedule'),{status:410});
    await assert.rejects(putFile('schedule','new'),{status:410});
});

test('every schedule badge PNG is exactly 900px wide, including empty calendars', async t => {
    t.mock.method(globalThis,'fetch',async()=>new Response('',{status:404}));
    const who = {name:'소주양',soopId:'soju2022'};
    const pngs = [
        await renderSchedule({...memberWeek(data,'soju2022',now),today:'2026-10-14'}),
        await renderToday({...who,date:'2026-10-14',events:[],offAir:[]}),
        await renderCalendar({...who,weeks:monthWeeks(now),today:'2026-10-14',events:[]}),
    ];
    for (const png of pngs) assert.equal((await sharp(png).metadata()).width,900);
});
