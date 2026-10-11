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

GitHub에서 [`schedule.txt`](schedule.txt)를 열고 연필(Edit) 버튼 → 고치기 → **Commit changes**.
1~2분 뒤 뱃지가 바뀝니다(휴대폰 브라우저에서도 됩니다).

```
10.13 20:00 주양CK
10.14 휴방
10.15 시간미정 캄몬 VS 드림즈
10.16 합방
```

- 한 줄에 일정 하나: `날짜 [시간] 내용`. 날짜는 `10.13` 또는 `2026-10-13`, 시간(`20:00`·`시간미정`)은 빼도 됩니다.
- 내용이 `휴방`이면 그날은 휴방으로 표시합니다.
- 뱃지에는 이번 주(한국 시간 월~일)만 나옵니다. 지난 줄은 지워도 남겨 둬도 됩니다.
- 날짜를 못 읽은 줄은 빼고 만들고, Actions 실행 화면에 노란 경고로 알려 줍니다.

## 최근 글

SOOP 방송국 게시판 첫 쪽에서 소주양 본인 글(고정 공지 포함) 최신 3개. 본문은 가장 최근 글이 10줄, 나머지 두 개가 3줄까지 보입니다(`config.json`의 `noticeLines`).
이미지라서 커뮤니티 안에서 '더보기'로 펼칠 수는 없고, 누르면 원글이 열립니다.

대상·링크 등은 `config.json`에서 바꿉니다.

## 갱신

`.github/workflows/build.yml`이 테스트 → 데이터 받기 → 크롬으로 찍기 → GitHub Pages 배포를 합니다.
데이터를 하나라도 못 받으면 배포하지 않아 직전 뱃지가 남습니다.

- `schedule.txt` 등을 main에 올릴 때 바로, 그리고 새 글을 반영하려고 30분마다(`schedule`) 돕니다. GitHub 정기 실행은 늦어지기도 하고 저장소에 60일간
  커밋이 없으면 꺼지므로, 제때 돌리려면 cron-job.org에서
  `POST https://api.github.com/repos/ststats/badges/actions/workflows/build.yml/dispatches`
  (본문 `{"ref":"main"}`, Actions: Read and write 토큰)를 부르세요. 스타유니브 빌드와 같은 방식입니다.
- GitHub Pages는 이미지를 10분 캐시합니다. 커뮤니티가 이미지를 자체 서버에 복사해 두는 곳이면 그 커뮤니티 쪽에서 늦게 바뀔 수 있습니다.

### 처음 한 번

저장소 Settings → Pages → Source를 **GitHub Actions**로 바꾸고 Actions → Build badges → Run workflow.

## 로컬에서

```sh
npm ci
npm test
CHROME=/path/to/chrome npm run build   # dist/에 결과. CHROME이 없으면 설치된 Chrome을 씀
```
