# 뱃지 모음(소주양·캄몬스타즈)

소주양의 공개·즐겨찾기 글을 전체 뱃지 이미지로 와이고수에 자동 등록하는 기능은 [자동 등록 설정](docs/autopost.md)을 참고하세요.

커뮤니티 글에 이미지로 넣는 뱃지입니다. 방송 썸네일처럼 **볼 때마다 지금 내용으로 바뀌고**(최대 1분 지연)
클릭 링크가 있는 뱃지는 해당 방송국으로 이동합니다. 모든 뱃지가 같은 디자인(파스텔 머리 + 흰 카드)과 같은 주소 규칙
`/<대상>/<뱃지>.png`을 씁니다.

| 대상 | 뱃지 | 이미지 | 누르면 |
|---|---|---|---|
| 소주양 | 주간 일정(월~일) | `/soju/schedule.png` | `/soju/s` → 소주양 방송국 |
| 캄몬스타즈 | 오늘의 일정(일정 + 휴방 멤버) | `/staruniv/today.png` | (링크 없음) |
| 캄몬스타즈 | 이번 달 달력(일~토) | `/staruniv/calendar.png` | (링크 없음) |

붙여 넣을 코드는 Vercel 주소 첫 화면(**뱃지 모음**)에서 `코드 복사`로 받습니다. 예:

```html
<a href="https://<vercel 주소>/soju/s"><img src="https://<vercel 주소>/soju/schedule.png" alt="소주양 주간 일정"></a>
```

## 구조

- **뱃지 그림**(`api/img.js`): `/soju/schedule.png`로 요청이 오면 저장된 주간 일정을 읽고 그림에 나오는 내용의
  해시를 붙인 `/soju/schedule.<해시>.png`로 보냅니다(CDN 20초). 새 뱃지는 `api/img.js`의 `BADGES`에 한 줄 더하면 됩니다. 해시 주소는 `src/render.mjs`가 satori + resvg로 **한 번만**
  그리고 CDN이 계속 씁니다. 내용이 바뀔 때만 그려서 Vercel 무료 한도(Active CPU 월 4시간, 스타유니브·시너지와 합산)를
  거의 쓰지 않습니다.
- **화면 세 개**: 뱃지 모음(`/`, `src/index.html`) · 일정 편집(`/edit/`) · 상태(`/status`, `api/status.js`)가 같은 위 막대와
  `src/site.css`를 써서 한 사이트처럼 오갑니다. 머리·위 막대는 `src/shell.mjs` 하나에서 만들고, 정적 화면에는 빌드
  (`scripts/vercel-public.mjs`)가 `<!--head:…-->`, `<!--topbar:…-->` 자리에 넣습니다.
- **편집 화면**(`/edit/`, `src/edit.html`): 읽기·저장은 `api/save.js`(비밀번호 확인 후 Supabase에 저장, 바로 반영),
  미리보기는 `api/preview.js`(실제 뱃지와 같은 그림을 SVG로, 그림 변환을 건너뛰어 빠름).
- **일정·쿠키**는 스타유니브 Supabase의 `badge_files` 표(`supabase/badges.sql`)에 둡니다. 쿠키는 암호문.
  저장하면 재배포 없이 바로 반영됩니다(일정 뱃지 고정 주소는 20초 캐시). Supabase가 잠깐 안 되면 직전에 읽은 값을 씁니다.
- **캄몬스타즈 일정**(`src/staruniv.mjs`): 스타유니브 사이트가 쓰는 공개 Supabase 함수 `api_schedule`·`api_holidays`·`api_site_members`를 그대로 읽습니다
  (30초 기억). 스타유니브 관리자 화면에서 고치면 1분 안에 뱃지가 바뀝니다. 이번 달 칸에 걸친 일정만 그림 내용으로 쳐서
  다른 달 일정을 고쳐도 다시 그리지 않습니다.
- `src/lib.mjs` 글 목록·일정 처리(서버와 편집 화면이 같이 씀) · `src/live.mjs` SOOP 읽기·쿠키 ·
  `src/staruniv.mjs` 스타유니브 일정 · `src/cache.mjs` 잠깐 기억·직전 값 대신 쓰기 ·
  `src/store.mjs` Supabase 저장소 · `src/render.mjs` 그림 · `src/http.mjs`·`src/config.mjs` 공용.

### Supabase(처음 한 번)

스타유니브 Supabase SQL 편집기에서 `supabase/badges.sql`을 실행하고, 맨 아래 주석처럼 쓰기 비밀값을 만듭니다:
`select vault.create_secret('<긴 아무 문자열>', 'badge_write_secret');` → 같은 값을 Vercel `BADGE_WRITE_SECRET`에.

### Vercel 환경 변수

| 이름 | 내용 |
|---|---|
| `EDIT_PASSWORD` | 편집 화면 비밀번호(4자 이상) |
| `BADGE_WRITE_SECRET` | Supabase Vault `badge_write_secret`과 같은 값(저장 권한) |
| `COOKIE_KEY` | 쿠키 암호화 열쇠(16자 이상, 바꾸면 상태 화면에서 쿠키를 다시 저장) |

### Vercel 연결(처음 한 번)

1. vercel.com → **Add New… → Project** → Import Git Repository에서 `ststats/badges`
   (안 보이면 *Adjust GitHub App Permissions*에서 이 저장소를 허용)
2. Framework Preset **Other**, 나머지는 그대로(`vercel.json`이 정함) → **Deploy**
3. 주소를 바꾸려면 Project Settings → Domains(예: `sojuyang-badges.vercel.app`)
4. 그 주소 첫 화면의 코드를 커뮤니티 글에 붙여 넣기

## 공지 자동 등록용 SOOP 쿠키

공지 자동 등록은 본인 SOOP 로그인 쿠키로 공개·즐겨찾기 전용 글을 확인합니다.
일정 뱃지는 쿠키나 게시판 본문을 사용하지 않습니다.

- **쿠키 넣기·바꾸기:** 상태 화면(`/status`)의 **SOOP 쿠키 바꾸기**에 붙여 넣고 저장(편집 비밀번호 필요). 서버가 SOOP에서 먹히는지
  먼저 보고, `COOKIE_KEY`로 암호화해 저장합니다(암호문만 저장, 바로 적용).
  쿠키 얻기: PC 크롬에서 로그인한 채로 소주양 게시판 → F12 → Network → 새로고침 → `board` 요청 → Request Headers의 **cookie** 값 전체.
- 뱃지 모음의 소주양 카드에 쿠키 상태 알약이 나오고(누르면 상태 화면), 만료가 의심되면(즐겨찾기 글이 하나도 안 보이면)
  일정 편집 화면 위에도 빨간 알림이 뜹니다.
- 쿠키가 새어 나갔다 싶으면 SOOP에서 로그아웃하면 무효가 됩니다.

## 일정 적기

**편집 화면: https://staruniv-badges.vercel.app/edit/** (휴대폰에서도 됩니다)

요일마다 `+ 일정 추가`로 시간·내용을 적고, 쉬는 날은 `휴방`을 체크한 뒤 **저장**. 바로 반영됩니다(커뮤니티에서는 길어야 30초쯤).
오른쪽(휴대폰은 아래)에 뱃지 미리보기가 바로 보이고, `다음 주 ›`로 미리 적어 둘 수 있습니다(뱃지에는 늘 이번 주만).

- 시간은 `20:00`(또는 `2000`, `20시`), 모르면 `미정`, 비우면 시간 없이 나옵니다.
- 처음 한 번 **편집 비밀번호**를 넣으면 그 브라우저에 기억됩니다.
- 저장 형식은 한 줄에 `날짜 [시간] 내용`(내용이 `휴방`이면 휴방).

## 캄몬스타즈 일정

로고는 스타유니브 관리자 '팀 로고'에 올린 캄몬스타즈 로고를 이름으로 찾아 씁니다(바꾸면 10분 안에 반영).
머리 색은 그 로고에서, 달력 일정 색은 사이트 달력과 같은 색 이름을 씁니다. 오늘의 일정은 사이트처럼 휴방 멤버를
사진·이름으로(없으면 '없음'), 달력은 칸마다 일정 6개까지(넘치면 `+N`), 공휴일은 빨간 날짜.

## 설정

- 이름·버튼 글자: `config.json` (`staruniv.name`은 팀 로고를 찾는 이름이기도 합니다)
- 누르면 가는 곳(`/soju/s`): `vercel.json`의 `redirects`
- 소주양 머리 배경은 프로필 사진에서 뽑은 두 색의 파스텔 그라데이션이고,
  `config.json`에 `"theme": {"from": "#e8eefc", "to": "#f3f0fb"}`처럼 넣으면 그 색으로 고정됩니다.

## GitHub Pages 판(그만둠)

예전에는 GitHub Actions가 5분마다 크롬으로 찍어 `https://ststats.github.io/badges/`에 올렸습니다. 지금은 꺼서
마지막으로 배포된 그림이 그대로 남아 있습니다(더 바뀌지 않음). 현재 Actions는 테스트와 공지 자동 등록에 사용합니다.

## 로컬에서

```sh
npm ci
npm test
EDIT_PASSWORD=… BADGE_WRITE_SECRET=… COOKIE_KEY=… npm run dev   # http://localhost:3000 (vercel.json 경로를 흉내 낸 서버)
```
