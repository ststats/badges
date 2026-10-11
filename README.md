# 소주양 뱃지

커뮤니티 글에 이미지로 넣는 뱃지입니다. 방송 썸네일처럼 **볼 때마다 서버가 새로 그려서**(최대 1분 지연)
새 글이 올라오면 바로 바뀌고, 누르면 그 순간의 원글로 갑니다.

| 뱃지 | 이미지 | 누르면 |
|---|---|---|
| 최근 글 1~3 | `/notice-1.png` ~ `/notice-3.png` | `/n/1` ~ `/n/3` → 지금의 그 글(SOOP 원글) |
| 주간 일정(월~일) | `/schedule.png` | `/s` → 소주양 방송국 |

붙여 넣을 코드는 Vercel 주소 첫 화면에 있습니다. 예:

```html
<a href="https://<vercel 주소>/n/1"><img src="https://<vercel 주소>/notice-1.png" alt="소주양 최근 글 1"></a>
```

## 구조

- **Vercel 함수**(`api/img.js`, `api/go.js`): `/notice-1.png`로 요청이 오면 SOOP 게시판을 읽고(30초 기억)
  그림에 나오는 내용의 해시를 붙인 `/notice-1.<해시>.png`로 보냅니다(CDN 1분). 해시 주소는 `src/render.mjs`가
  satori + resvg로 **한 번만** 그리고 CDN이 계속 씁니다. 내용이 바뀔 때만 그려서 Vercel 무료 한도
  (Active CPU 월 4시간, 스타유니브·시너지와 같은 계정 합산)를 거의 쓰지 않습니다.
  프로필(움직이는 GIF)·사진은 sharp로 줄여 넣고, 머리 배경은 프로필을 미리 흐려 만듭니다. 이모지는 Twemoji.
- **정적 파일**(`public/`, 배포 때 `scripts/vercel-public.mjs`가 만듦): 일정 편집 화면 `/edit/`, 코드 모음 `/`.
- **일정**은 저장소의 `schedule.txt`. 편집 화면에서 저장하면 커밋되고 Vercel이 다시 배포합니다(1분 남짓).

### Vercel 연결(처음 한 번)

1. vercel.com → **Add New… → Project** → Import Git Repository에서 `ststats/badges`
   (안 보이면 *Adjust GitHub App Permissions*에서 이 저장소를 허용)
2. Framework Preset **Other**, 나머지는 그대로(`vercel.json`이 정함) → **Deploy**
3. 주소를 바꾸려면 Project Settings → Domains(예: `sojuyang-badges.vercel.app`)
4. 그 주소 첫 화면의 코드를 커뮤니티 글에 붙여 넣기

## 즐겨찾기 전용 글까지 넣기(선택)

본인 SOOP 로그인 쿠키로 게시판을 읽으면 뱃지에 즐겨찾기 전용 글도 나옵니다.
**뱃지 주소를 아는 사람은 누구나 그 글을 보게 되니** 커뮤니티 등에 올릴 때는 쿠키를 빼세요.

- **처음 한 번:** Vercel → Settings → Environment Variables에 `COOKIE_KEY`(16자 이상 아무 긴 문자열)를 넣고 Redeploy.
- **쿠키 넣기·바꾸기:** 편집 화면(`/edit/`)의 **SOOP 쿠키 바꾸기**에 붙여 넣고 저장. 서버가 SOOP에서 먹히는지 먼저 보고,
  `COOKIE_KEY`로 암호화한 `cookie.enc`를 편집 화면이 커밋합니다(저장소에는 암호문만, 1~2분 뒤 적용).
  쿠키 얻기: PC 크롬에서 로그인한 채로 소주양 게시판 → F12 → Network → 새로고침 → `board` 요청 → Request Headers의 **cookie** 값 전체.
- 편집 화면 맨 위에 쿠키 상태가 나오고, 만료가 의심되면(즐겨찾기 글이 하나도 안 보이면) 빨간 알림이 뜹니다.
  `/status`에서 자세히 볼 수 있습니다.
- `cookie.enc`가 없거나 풀리지 않으면 환경 변수 `SOOP_COOKIE`를 씁니다. 쿠키가 새어 나갔다 싶으면 SOOP에서 로그아웃하면 무효가 됩니다.

## 일정 적기

**편집 화면: `<vercel 주소>/edit/`** (휴대폰에서도 됩니다. `https://ststats.github.io/badges/edit/`도 같은 화면)

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

## GitHub Pages 판(예전 방식)

`.github/workflows/build.yml`이 5분마다 크롬으로 찍어 `https://ststats.github.io/badges/`에 올리는 예전 방식도
아직 돌아갑니다(커뮤니티 코드를 Vercel 주소로 바꾸기 전까지). 다 바꾸면 이 워크플로의 `schedule`을 지우면 됩니다.

## 로컬에서

```sh
npm ci
npm test
npm run dev        # http://localhost:3000 (vercel.json 경로를 흉내 낸 서버)
```
