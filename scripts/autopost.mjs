import { chromium } from 'playwright';
import { coolingDown, newPosts, postingCandidates, publishPosts, recoverPending } from '../src/autopost.mjs';
import { withDelivery } from '../src/autopost-delivery.mjs';
import { vercelPosts, reportDelivery } from '../src/autopost-source.mjs';
import { githubState } from '../src/autopost-state.mjs';
import { ygosuPublisher } from '../src/ygosu-publisher.mjs';

// 인증 정보/본문/스크린샷을 Actions 로그나 artifact로 남기지 않는다.
async function main() {
    if (process.env.DIAGNOSE_ONLY === 'true') {
        const browser = await chromium.launch({ headless: true });
        try {
            const publisher = await ygosuPublisher(browser, {
                id: process.env.YGOSU_ID,
                password: process.env.YGOSU_PASSWORD,
                log: console.log,
            });
            try {
                console.log('읽기 전용 진단: ' + JSON.stringify(await publisher.diagnose()));
            } finally {
                await publisher.close();
            }
        } finally {
            await browser.close();
        }
        return;
    }
    console.log('등록 이력 확인');
    const store = await githubState({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN });
    const state = store.state;
    const includeLatest = process.env.PUBLISH_LATEST === 'true';
    const recovery = process.env.RECOVER_PENDING || '';
    if (state.pending && !recovery) newPosts(state, []);
    if (coolingDown(state)) {
        console.log('최근 등록 후 5분 이내: 이번 실행은 건너뜁니다');
        return;
    }
    console.log('SOOP 공개/즐겨찾기 글 수집 및 접근 확인');
    const posts = await vercelPosts();
    if (!recovery && !postingCandidates(state, posts, includeLatest).length) {
        console.log('등록할 공지 없음: 이미 등록한 최신 글은 재등록하지 않습니다');
        return;
    }
    const browser = await chromium.launch({ headless: true });
    try {
        console.log('와고 자동 로그인');
        const publisher = await ygosuPublisher(browser, {
            id: process.env.YGOSU_ID,
            password: process.env.YGOSU_PASSWORD,
            log: console.log,
        });
        try {
            if (recovery) {
                console.log('미확정 한 건만 동일 멱등키로 복구');
                await recoverPending({
                    state,
                    id: recovery,
                    posts,
                    save: store.save,
                    prepare: p => publisher.prepare(p),
                    publish: (p, uploads) => publisher.publish(p, uploads),
                });
                console.log('미확정 글 복구 완료');
                return;
            }
            const before = state.lastPostedAt;
            await publishPosts({
                state,
                posts,
                save: store.save,
                includeLatest,
                prepare: async p => {
                    console.log('전체 공지 이미지 생성·업로드');
                    return publisher.prepare(p);
                },
                publish: async (p, uploads) => {
                    console.log('와고 글 등록');
                    return publisher.publish(p, uploads);
                },
            });
            if (state.lastPostedAt === before) return;
            console.log('새 공지 자동 등록 완료');
        } finally {
            await publisher.close();
        }
    } finally {
        await browser.close();
    }
}

withDelivery({
    lease: process.env.DELIVERY_LEASE || '',
    titleNo: process.env.DELIVERY_TITLE || '',
    run: main,
    loadState: async () =>
        (await githubState({ repository: process.env.GITHUB_REPOSITORY, token: process.env.GITHUB_TOKEN })).state,
    report: reportDelivery,
}).catch(error => {
    // 정해진 고정 문구만 분류한다. 오류 원문에는 URL/본문/인증 정보가 포함될 수 있다.
    const known = [
        ['SOOP 전체 본문이 없습니다', 'SOOP_FULL_BODY_MISSING'],
        ['지원하지 않는 원문 이미지 주소', 'SOOP_IMAGE_HOST_UNSUPPORTED'],
        ['원문에 영상이 있습니다', 'SOOP_VIDEO_UNSUPPORTED'],
        ['원문 사진', 'SOOP_IMAGE_LOAD_FAILED'],
        ['사진 주소를 확인', 'SOOP_ATTACHMENT_INVALID'],
        ['와고 공지 카테고리 확인 실패', 'YGOSU_NOTICE_CATEGORY_MISSING'],
        ['와고 첨부 부모 코드', 'YGOSU_ATTACHMENT_CONTEXT_MISSING'],
        ['와고 글쓰기 권한/폼', 'YGOSU_WRITE_CONTEXT_INVALID'],
        ['와고 이미지 업로드 실패', 'YGOSU_UPLOAD_FAILED'],
        ['와고 자동 로그인 실패', 'YGOSU_LOGIN_FAILED'],
        ['YGOSU_ID와 YGOSU_PASSWORD', 'YGOSU_CREDENTIAL_MISSING'],
    ];
    const code =
        known.find(([fragment]) => String(error?.message).includes(fragment))?.[1] ||
        (/^YGOSU_WRITE_[A-Z0-9_]+$/.test(String(error?.message)) ? error.message : null) ||
        (error?.name === 'TimeoutError' ? 'BROWSER_TIMEOUT' : 'UNCLASSIFIED');
    console.error(`오류 분류: ${code}`);
    // 라이브러리 오류가 요청 본문/쿠키를 포함할 수 있어 원본 stack/message를 출력하지 않는다.
    console.error(
        '자동 등록 중단: 인증·원문 이미지·사이트 변경·상태 파일을 확인하세요. pending이 있으면 와고 등록 결과를 먼저 확인하세요.'
    );
    process.exitCode = 1;
});
