# 뱃지 모음(멤버별 일정·캄몬스타즈)

소주양의 공개·즐겨찾기 글을 전체 뱃지 이미지로 와이고수에 자동 등록하는 기능은 [자동 등록 설정](docs/autopost.md)을 참고하세요.

커뮤니티 글에 이미지로 넣는 뱃지입니다. 방송 썸네일처럼 **볼 때마다 지금 내용으로 바뀌고**(최대 1분 지연)
클릭 링크가 있는 뱃지는 해당 방송국으로 이동합니다. 모든 뱃지가 같은 디자인(파스텔 머리 + 흰 카드)과 같은 주소 규칙
`/<대상>/<뱃지>.png`을 씁니다.

| 대상 | 뱃지 | 이미지 | 누르면 |
|---|---|---|---|
| 멤버 선택 | 주간 일정(월~일) | `/member/<SOOP ID>/schedule.png` | 선택한 멤버 방송국 |
| 캄몬스타즈 | 오늘의 일정(일정 + 휴방 멤버) | `/staruniv/today.png` | (링크 없음) |
| 캄몬스타즈 | 이번 달 달력(일~토) | `/staruniv/calendar.png` | (링크 없음) |

붙여 넣을 코드는 Vercel 주소 첫 화면(**뱃지 모음**)에서 `코드 복사`로 받습니다. 예:

```html
<a href="https://<vercel 주소>/soju/s"><img src="https://<vercel 주소>/soju/schedule.png" alt="소주양 주간 일정"></a>
```

## 구조

- **모든 뱃지 PNG는 가로 900px**, 기존 배치를 비례 확대합니다. 공지 자동 등록 이미지도 900px입니다.
- **일정의 단일 원천**: 스타유니브 Supabase 공개 함수 `api_schedule`·`api_site_members`·`api_holidays`를 조회합니다. 일정 사본은 저장하지 않습니다.
- **멤버별 일정**: 첫 화면에서 멤버를 선택하면 `/member/<SOOP ID>/schedule.png` 주소와 복사 코드가 바뀝니다. 개인 주체 또는 등록 참가자 ID가 일치하는 일정과 해당 멤버 휴방만 표시합니다. 이름은 등록 ID로 매핑하고 역할은 표시하지 않습니다.
- **이전 주소**: `/soju/schedule.png`는 소주양의 스타유니브 일정을 표시합니다. `/edit`·`/edit/`는 스타유니브 일정 페이지로 이동합니다.
- **저장소**: `badge_files`에는 암호화 쿠키만 저장합니다(`supabase/badges.sql`, `src/store.mjs`).
- **확인**: `npm test`, 배포 뒤 `node scripts/verify-schedule.mjs <주소>`(멤버 목록·일정 뱃지·첫 화면 멤버 선택).
- **화면**: 뱃지 모음(`/`)과 쿠키 상태(`/status`)는 기존 공통 디자인을 사용합니다.

### Supabase(처음 한 번)

스타유니브 Supabase SQL 편집기에서 `supabase/badges.sql`을 실행하고, 맨 아래 주석처럼 쓰기 비밀값을 만듭니다:
`select vault.create_secret('<긴 아무 문자열>', 'badge_write_secret');` → 같은 값을 Vercel `BADGE_WRITE_SECRET`에.

### Vercel 환경 변수

| 이름 | 내용 |
|---|---|
| `EDIT_PASSWORD` | 쿠키 변경 비밀번호(4자 이상) |
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
- 쿠키 상태는 상태 화면에서 확인합니다.
- 쿠키가 새어 나갔다 싶으면 SOOP에서 로그아웃하면 무효가 됩니다.

## 일정 관리

스타유니브 관리자 일정에서만 수정합니다. 등록 참가자 SOOP ID와 개인 주체를 기준으로 멤버별 뱃지에 반영됩니다.

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
