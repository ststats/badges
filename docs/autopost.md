# 소주양 공지 → 와이고수 자동 등록

대상: `soju2022` 본인 글 → `https://ygosu.com/board/pan_sojuyang`.
공개·즐겨찾기 전용 글 모두 기존 Vercel에 저장된 SOOP 쿠키로 확인합니다.
Supabase의 공개 `member_posts` 수집에는 즐겨찾기 본문을 넣지 않습니다.

## 실행 구조와 사용량

기존 Supabase `live-status` cron(2분 주기)에 Vercel `/api/autopost-detect` 호출을 덧붙입니다.
Vercel이 로그인 목록을 확인하고 새 공지가 있을 때만 GitHub 워크플로를 실행합니다.
GitHub 자체의 예약 실행은 없습니다. 이미지 생성·와고 로그인·등록은 GitHub에서 처리합니다.
GitHub 작업은 OIDC 신원으로 `/api/autopost-source`를 호출합니다. 쿠키와 복호화 키는 Vercel 안에 남습니다.
서버는 GitHub 서명, 저장소/소유자 ID, main, 워크플로 경로를 모두 검증합니다.

2분 간격은 실시간 푸시가 아닙니다. GitHub 실행 대기 시간도 추가됩니다.
Vercel 호출은 30일 기준 21,600회이며 CPU·메모리·전송량도 기존 뱃지와 함께 한도를 사용합니다.
첫 페이지의 최신 글만 대상으로 하므로 오래 중단되었다고 과거 페이지를 모두 조회하지 않습니다.

## 디자인

기존 뱃지와 같은 프로필/파스텔 머리/흰 카드에 **전체 제목·본문·사진**을 담습니다.
원문 문단·사진 순서를 유지하고 별도 첨부 사진도 모두 넣습니다.
기존 뱃지의 줄 수·사진 수 제한이나 썸네일 자르기를 적용하지 않습니다.
긴 공지는 약 1800px마다 이어지는 PNG로 나눠 한 글에 순서대로 업로드하고 원문 링크를 붙입니다.
GIF는 캡처 시점 정지 화면입니다. 영상·본문 누락·이미지 다운로드 실패·지원하지 않는 이미지 호스트는 생략하지 않고 실행을 중단합니다.
원문 이미지는 SOOP/아프리카 도메인만 허용합니다.

## 설정과 활성화 순서

GitHub Actions Secrets에는 `YGOSU_ID`, `YGOSU_PASSWORD`만 등록합니다.
`SOOP_COOKIE`와 `COOKIE_KEY`는 GitHub에 추가하지 않습니다.
와고는 매 실행마다 아이디/비밀번호로 로그인합니다. 추가 인증·캡차·권한 문제가 있으면 중단합니다.
SOOP 쿠키가 만료되면 기존 상태 화면에서 갱신합니다.
최근 첫 페이지에 공개 목록에 없는 본인 글이 있어야 즐겨찾기 접근을 확인합니다.
이를 확인하지 못하면 공개 글로 대체하지 않고 멈춥니다.

1. 코드를 main에 병합하고 Vercel 배포 성공을 확인합니다.
2. Supabase SQL Editor에서 `supabase/autopost.sql`을 실행합니다.
3. GitHub Variable `AUTOPOST_ENABLED=true`를 설정하고 **소주양 공지 자동 등록**을 한 번 수동 실행합니다.
   최초 실행은 현재 글을 기준으로 기록하며 과거 공지를 올리지 않습니다. 이 초기화를 감지 활성화보다 먼저 완료해야 합니다.
4. GitHub의 fine-grained PAT를 이 저장소만 선택하고 **Actions: Read and write** 권한으로 생성합니다.
   Vercel Production의 민감 환경 변수 `GITHUB_DISPATCH_TOKEN`에 저장합니다. 코드·Variables·채팅에 넣지 않습니다.
5. Vercel Production에 `AUTOPOST_DETECT_ENABLED=true`를 설정하고 다시 배포합니다.
   기존 `BADGE_WRITE_SECRET`과 Supabase Vault의 `badge_write_secret`을 그대로 사용합니다.
6. `supabase/autopost-tick.sql`을 실행합니다. 기존 작업과 2분 주기를 검증하고, 호출을 중복 없이 추가합니다.
   감지 첫 요청도 현재 글을 기준으로만 저장합니다. 그 다음 새 공지부터 자동 실행합니다.

Supabase `ststat.sql`로 live-status cron을 다시 만들었다면 마지막 tick SQL도 다시 실행해야 합니다.
중지할 때는 GitHub Variable `AUTOPOST_ENABLED=false`를 설정합니다.
감지 호출도 멈추려면 기존 cron 명령에서 `badges-autopost-tick-v1` 블록만 제거합니다.

## 폭주·중복 방지

최신 새 글 **딱 하나만** 등록합니다. 밀린 나머지 글은 건너뛰며 마지막 성공 등록 후 5분 이내 추가 등록하지 않습니다.
Supabase 감지 상태에는 글 번호·시각·잠금만 저장하고 첫 감지는 기준 저장만 합니다.
행 잠금·5분 임대·dispatch 간격 제한으로 동시 감지를 막습니다.
GitHub 동일 워크플로는 한 번에 하나만 실행합니다.
전용 orphan `autopost-state` 브랜치에는 시작 시각·SOOP 번호·와고 번호만 기록하며 본문·인증 정보를 저장하지 않습니다.
이 브랜치를 Vercel Preview 배포 대상으로 추가하지 마세요.

등록 요청 **전에** 영구 `pending`을 저장하고 SHA 충돌 검사를 적용합니다.
응답이 불확실하거나 등록 후 상태 저장이 실패하면 다음 실행도 중단해 중복 게시를 막습니다.
이미지 준비 오류는 재시도할 수 있습니다. 원문 수정·삭제는 이미 등록한 고정 이미지에 자동 반영하지 않습니다.
GitHub 로그/artifact에 본문·쿠키·스크린샷을 남기지 않습니다.

`pending`이 남으면:

1. `AUTOPOST_ENABLED=false`로 중지하고 와고 등록 결과를 직접 확인합니다.
2. 등록되었다면 상태 파일 `done`에 `"SOOP번호": 와고글번호`를 추가하고 `pending`을 삭제합니다.
   확실히 등록되지 않았다면 `pending`만 삭제합니다. 상태 파일 전체를 지우지 마세요.
3. `AUTOPOST_ENABLED=true`로 재개합니다.

## 검증

`npm test`: 수집·최신 하나·중복 방지·등록 전 상태 저장·내용 보존·OIDC 신원·감지/dispatch 검증.
`npx playwright install chromium && node scripts/preview-autopost.mjs`: 합성 긴 공지의 이미지 전체 생성·분할 검증.
실계정 로그인·업로드·등록과 Supabase/Vercel 연결은 별도 운영 검증이 필요합니다.
