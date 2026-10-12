import { chromium } from 'playwright';
import { config } from '../src/config.mjs';
import { currentCookie } from '../src/live.mjs';
import { collectPosts, coolingDown, newPosts, publishPosts } from '../src/autopost.mjs';
import { githubState } from '../src/autopost-state.mjs';
import { ygosuPublisher } from '../src/ygosu-publisher.mjs';

// 인증 정보/본문/스크린샷을 Actions 로그나 artifact로 남기지 않는다.
async function main() {
    console.log('등록 이력 확인');
    const store = await githubState({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
    let state = store.state;
    if (state?.pending) newPosts(state, []);
    if (state && coolingDown(state)) { console.log('최근 등록 후 5분 이내: 이번 실행은 건너뜁니다'); return; }
    const started = Date.now();
    const cookie = process.env.SOOP_COOKIE || await currentCookie();
    console.log('SOOP 공개/즐겨찾기 글 수집 및 접근 확인');
    const posts = await collectPosts({ soopId: config.soopId, cookie, since: state?.since });
    if (!state) {
        state = { version: 1, since: started, done: Object.fromEntries(posts.map(p => [String(p.titleNo), 'baseline'])) };
        await store.save(state);
        console.log('초기 기준 저장 완료. 이후 올라오는 새 공지부터 등록합니다.');
        return;
    }
    if (!newPosts(state, posts).length) { console.log('새 공지 없음'); return; }
    const browser = await chromium.launch({ headless: true });
    try {
        console.log('와고 자동 로그인');
        const publisher = await ygosuPublisher(browser, { id: process.env.YGOSU_ID, password: process.env.YGOSU_PASSWORD });
        try {
            const before = state.lastPostedAt;
            await publishPosts({ state, posts, save: store.save,
                prepare: async p => { console.log('전체 공지 이미지 생성·업로드'); return publisher.prepare(p); },
                publish: async (p, uploads) => { console.log('와고 글 등록'); return publisher.publish(p, uploads); } });
            if (state.lastPostedAt === before) return;
            // 기준 시각을 앞으로 옮겨 다음 실행의 수집 범위를 줄인다. 번호 기록은 유지한다.
            state.since = started - 60000;
            await store.save(state);
            console.log('새 공지 자동 등록 완료');
        } finally { await publisher.close(); }
    } finally { await browser.close(); }
}

main().catch(() => {
    // 라이브러리 오류가 요청 본문/쿠키를 포함할 수 있어 원본 stack/message를 출력하지 않는다.
    console.error('자동 등록 중단: 인증·원문 이미지·사이트 변경·상태 파일을 확인하세요. pending이 있으면 와고 등록 결과를 먼저 확인하세요.');
    process.exitCode = 1;
});
