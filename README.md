# 소주양 뱃지

커뮤니티 글에 이미지로 넣는 뱃지입니다. 이미지를 누르면 원글(또는 일정 페이지)로 갑니다.
이미지 주소와 링크 주소는 그대로이고, 빌드할 때마다 내용과 이동할 곳만 바뀝니다.

| 뱃지 | 이미지 | 누르면 |
|---|---|---|
| 최근 글 1~3 | `notice-1.png` ~ `notice-3.png` | `n/1/` ~ `n/3/` → 그 글의 SOOP 원글 |
| 주간 일정(월~일) | `schedule.png` | `s/` → 소주양 방송국 |

붙여 넣을 코드는 배포된 첫 화면(`https://ststats.github.io/badges/`)에 있습니다. 예:

```html
<a href="https://ststats.github.io/badges/n/1/"><img src="https://ststats.github.io/badges/notice-1.png" alt="소주양 최근 글 1"></a>
```

## 일정 적기

**편집 화면: https://ststats.github.io/badges/edit/** (휴대폰에서도 됩니다)

요일마다 `+ 일정 추가`로 시간·내용을 적고, 쉬는 날은 `휴방`을 체크한 뒤 **저장**. 1~2분 뒤 뱃지가 바뀝니다.
오른쪽(휴대폰은 아래)에 뱃지 미리보기가 바로 보이고, `다음 주 ›`로 미리 적어 둘 수 있습니다(뱃지에는 늘 이번 주만).

- 시간은 `20:00`(또는 `2000`, `20시`), 모르면 `미정`, 비우면 시간 없이 나옵니다.
- 처음 한 번 **저장 권한**에서 GitHub 토큰을 넣어야 합니다(화면에 만드는 법이 있습니다:
  ststats/badges만, Contents: Read and write). 토큰은 그 브라우저에만 기억됩니다.
- 저장하면 화면이 저장소의 [`schedule.txt`](schedule.txt)를 고쳐 커밋합니다. 그 파일을 GitHub에서 직접 고쳐도 됩니다
  (한 줄에 `날짜 [시간] 내용`, 내용이 `휴방`이면 휴방).

## 최근 글

SOOP 방송국 게시판 첫 쪽에서 소주양 본인 글(고정 공지 포함) 최신 3개. 본문은 가장 최근 글이 10줄, 나머지 두 개가 3줄까지 보입니다(`config.json`의 `noticeLines`).
사진은 최신 글이면 본문 아래에 4장까지(더 있으면 `+N`), 나머지는 오른쪽에 첫 장만 작게 나옵니다.
이미지라서 커뮤니티 안에서 '더보기'로 펼칠 수는 없고, 누르면 원글이 열립니다.

대상·링크 등은 `config.json`에서 바꿉니다.

## 갱신

`.github/workflows/build.yml`이 5분마다 SOOP 게시판을 확인해서, 새 글·글 수정·날짜 변경(오늘 표시)이 있을 때만
크롬으로 다시 찍어 GitHub Pages에 배포합니다. 바뀐 게 없으면 1분 안에 끝나고 배포하지 않습니다
(배포된 `state.txt`와 비교). `schedule.txt`나 코드를 올리면 늘 바로 만듭니다.
데이터를 못 받으면 배포하지 않아 직전 뱃지가 남습니다.

- GitHub 정기 실행은 붐빌 때 10~30분씩 밀리기도 합니다. 더 제때 돌리려면 cron-job.org에서 5분마다
  `POST https://api.github.com/repos/ststats/badges/actions/workflows/build.yml/dispatches`
  (본문 `{"ref":"main"}`, Actions: Read and write 토큰)를 부르세요. 스타유니브 빌드와 같은 방식입니다.
- 저장소에 60일 동안 커밋이 없으면 GitHub이 정기 실행을 끕니다. 일정을 고치면 커밋이 생기니 보통 괜찮고,
  꺼지면 Actions 탭에서 다시 켜면 됩니다.
- GitHub Pages는 이미지를 10분 캐시합니다. 커뮤니티가 이미지를 자체 서버에 복사해 두는 곳이면 그 커뮤니티 쪽에서 늦게 바뀔 수 있습니다.

### 처음 한 번

저장소 Settings → Pages → Source를 **GitHub Actions**로 바꾸고 Actions → Build badges → Run workflow.

## 로컬에서

```sh
npm ci
npm test
CHROME=/path/to/chrome npm run build   # dist/에 결과. CHROME이 없으면 설치된 Chrome을 씀
```
