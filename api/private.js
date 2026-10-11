// /p/<키>/: 비밀 판 상태와 뱃지 미리보기. 본인만 북마크해서 본다.
import { escapeHTML, formatPostDate } from '../src/lib.mjs';
import { access, config, notFound, privateStatus, query } from '../src/live.mjs';

export default async function handler(req, res) {
    const who = access(query(req));
    if (!who || !who.priv) return notFound(res);
    let status;
    try {
        const { hasCookie, error, extra } = await privateStatus();
        status = !hasCookie
            ? '쿠키가 없습니다. Vercel 환경 변수 SOOP_COOKIE를 넣어 주세요. 지금은 공개 글만 나옵니다.'
            : error
              ? `⚠️ 쿠키로 게시판을 읽지 못했습니다(${escapeHTML(error)}). 쿠키가 만료됐거나 잘못 복사된 것 같습니다. 새 쿠키를 넣고 다시 배포해 주세요. 지금은 공개 글만 나옵니다.`
              : extra.length
              ? `로그인 쿠키로 즐겨찾기 전용 글까지 받고 있습니다. 최근 글 중 공개 목록에 없는 글 ${extra.length}개: ` +
                extra.slice(0, 5).map(p => `“${escapeHTML(p.titleName)}”(${escapeHTML(formatPostDate(p.regDate))})`).join(', ')
              : '쿠키는 있지만 최근 글 20개 중 공개 목록에 없는 글이 없습니다. 지금 즐겨찾기 전용 글이 없거나, 쿠키가 만료됐을 수 있습니다(만료되면 공개 글만 나옵니다).';
    } catch (e) {
        status = `게시판을 읽지 못했습니다: ${escapeHTML(e.message)}`;
    }
    const items = [
        ...Array.from({ length: config.noticeCount }, (_, i) => ({ img: `notice-${i + 1}.png`, link: `n/${i + 1}`, label: `최근 글 ${i + 1}` })),
        { img: 'schedule.png', link: '../../s', label: '주간 일정' },
    ];
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.end(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><meta name="referrer" content="no-referrer"><title>${escapeHTML(config.name)} 뱃지(비밀)</title>
<style>body{font-family:system-ui,sans-serif;max-width:680px;margin:24px auto;padding:0 16px;color:#18181b;background:#fafafa}
.st{background:#fff;border:1px solid #e4e4e7;border-radius:14px;padding:12px 14px;font-size:14px;line-height:1.6}
a.b{display:block;margin:14px 0}img{max-width:100%;display:block}h2{font-size:14px;color:#71717a;margin:18px 0 4px}</style></head><body>
<h1>${escapeHTML(config.name)} 뱃지 <small style="color:#a1a1aa">비밀 판</small></h1>
<div class="st">${status}</div>
${items.map(b => `<h2>${b.label}</h2><a class="b" href="${b.link}"><img src="${b.img}" alt="${b.label}"></a>`).join('\n')}
</body></html>`);
}
