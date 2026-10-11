# 소주양 뱃지

커뮤니티 글에 이미지로 넣는 뱃지입니다. 이미지를 누르면 원글(또는 일정 페이지)로 갑니다.
이미지 주소와 링크 주소는 그대로이고, 빌드할 때마다 내용과 이동할 곳만 바뀝니다.

| 뱃지 | 이미지 | 누르면 |
|---|---|---|
| 최근 글 1~3 | `notice-1.png` ~ `notice-3.png` | `n/1/` ~ `n/3/` → 그 글의 SOOP 원글 |
| 주간 일정(월~일) | `schedule.png` | `s/` → 스타유니브 일정 페이지 |

붙여 넣을 코드는 배포된 첫 화면(`https://ststats.github.io/sojuyang-badges/`)에 있습니다. 예:

```html
<a href="https://ststats.github.io/sojuyang-badges/n/1/"><img src="https://ststats.github.io/sojuyang-badges/notice-1.png" alt="소주양 최근 글 1"></a>
```

## 데이터

- **최근 글**: SOOP 방송국 게시판 첫 쪽에서 소주양 본인 글(고정 공지 포함) 최신 3개.
- **주간 일정**: 스타유니브 Supabase 일정(`api_schedule`)에서 한국 시간 이번 주 월~일.
  - 담당자 칸에 `주양`·`쏘`·`소주`가 들어가거나(`쏘랑밍송`, `주양두두송이`), 설명에 들어가면(`주양CK`) 소주양 일정입니다.
  - 담당자가 정확히 `캄몬`이면 팀 일정이라 함께 넣습니다.
  - 휴방은 스타유니브 휴방 표에서 `soju2022`인 날입니다.
- 기준은 `config.json`에서 바꿉니다(대상 바꾸기, 줄임말 추가, 일정 링크 등).

## 갱신

`.github/workflows/build.yml`이 테스트 → 데이터 받기 → 크롬으로 찍기 → GitHub Pages 배포를 합니다.
데이터를 하나라도 못 받으면 배포하지 않아 직전 뱃지가 남습니다.

- main에 올릴 때, 그리고 30분마다(`schedule`) 돕니다. GitHub 정기 실행은 늦어지기도 하고 저장소에 60일간
  커밋이 없으면 꺼지므로, 제때 돌리려면 cron-job.org에서
  `POST https://api.github.com/repos/ststats/sojuyang-badges/actions/workflows/build.yml/dispatches`
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
