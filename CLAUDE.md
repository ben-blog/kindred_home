# HOME 프로젝트

## 개요
kinxdred 메인 웹사이트. 정적 HTML/CSS/JS 기반이며 Vercel로 배포한다.

- GitHub: `ben-blog/kindred_home`
- 배포: Vercel

## 기술 스택
- 순수 HTML / CSS / JavaScript (프레임워크 없음)
- ES Modules (`import/export`)
- Supabase 클라이언트 (`kin/k2/lib/core.js`에 설정)
- Anthropic Claude SDK (API 쪽)

## 폴더 구조

```
home/
├── index.html                 ← 메인 랜딩 (kinxdred 진입점)
├── main.html                  ← 메인 콘텐츠 페이지
├── vercel.json                ← Vercel rewrite 규칙
├── favicon.svg
│
├── kin/                       ← KIN 서비스
│   ├── index.html             ← kin 허브
│   └── k2/                    ← K2 앱
│       ├── index.html
│       ├── lib/               ← 공통 모듈
│       │   ├── core.js        ← 설정, 상수, 공통 로직 (DOM 없음)
│       │   ├── ui.js          ← UI 관련 로직
│       │   ├── common.css
│       │   └── design-tokens.css
│       ├── services/          ← 개별 서비스 페이지
│       │   ├── quiz/          ← quiz.html, quiz.js, quiz.css
│       │   ├── result/        ← result.html, result.js, result.css
│       │   └── worldcup-work/ ← worldcup.html, worldcup.js, worldcup.css
│       └── assets/            ← 이미지 (캐릭터, 배경)
│
├── dred/                      ← DRED 서비스
│   ├── index.html             ← dred 허브
│   ├── d2/
│   │   ├── index.html         ← D2 프론트엔드
│   │   ├── api/               ← [별도 Git 리포] Express 백엔드, Railway 배포
│   │   │   ├── index.js       ← 엔트리포인트 (포트 3001)
│   │   │   ├── routes/        ← d2.js, d14.js
│   │   │   └── utils/         ← supabase.js, claude.js, astronomy.js, location.js
│   │   └── musicdb/           ← 음악 DB 데이터 & Python 스크립트 (Git 미포함)
│   └── d14/
│       └── index.html         ← D14 프론트엔드
```

## Vercel Rewrite 규칙
- `/kin/k2/quiz` → `/kin/k2/services/quiz/quiz.html`
- `/kin/k2/result` → `/kin/k2/services/result/result.html`
- `/kin/k2/worldcup/work` → `/kin/k2/services/worldcup-work/worldcup.html`
- `/kin/k2/worldcup/character` → `/kin/k2/services/worldcup-character/worldcup.html`

## 코딩 컨벤션
- ES Modules (`import/export`)
- 절대 경로 사용 (Vercel rewrite 환경에서 상대경로 오동작 방지)
- CSS 커스텀 프로퍼티 활용, 디자인 토큰은 `kin/k2/lib/design-tokens.css`
- 폰트: Syne (제목), DM Mono (본문/코드)
- 색상 팔레트: `--black: #0a0a0a`, `--yellow: #FFE500`, `--dred: #5B4FCF`, `--white: #f5f5f0`

## 환경변수
- 프론트엔드 Supabase 설정: `kin/k2/lib/core.js`에 하드코딩 (anon key, 공개 가능)
- API `.env`: `dred/d2/api/.env`
  - `SUPABASE_URL`, `SUPABASE_KEY`, `PORT` (기본 3001)

## Git 주의사항
- `dred/d2/api/`는 별도 Git 저장소 → home 리포에서 커밋하지 말 것
- `dred/d2/musicdb/`는 `.gitignore`로 제외됨
- `.DS_Store`는 전역 무시

## dred/d2/api 참고사항
별도 Git 리포이며 Express.js (CommonJS) 사용:
- `require/module.exports` 방식
- 라우터: `/api/d2`, `/api/d14`
- Railway 배포 (`kin-agent-production.up.railway.app`)
