# HOME 프로젝트

## 개요
kinxdred 메인 웹사이트. 정적 HTML/CSS/JS. Vercel에서 루트로 연다.

- GitHub: `ben-blog/kindred_home`
- 배포: Vercel (`https://kindred-home.vercel.app`)

## 기술 스택
- 순수 HTML / CSS / JavaScript (프레임워크 없음)
- ES Modules (`import/export`)
- Supabase 클라이언트는 K2만 (`kin/k2/lib/core.js`, 프로젝트 `lmfyspozcmyefgrkgxch`)
- 갤러리·D2·D14는 저장소 안 JSON. 백엔드 없음

## 폴더 구조

```
home/
├── index.html                 ← 메인 랜딩 (kinxdred 진입점)
├── main.html                  ← 메인 콘텐츠 페이지
├── vercel.json                ← Vercel rewrite (월드컵, 퀴즈, mood-camera 프록시)
├── data/                      ← 갤러리 JSON, 메인 카드, D2 트랙
├── js/                        ← site-base, gallery, d2, d14
├── assets/gallery/            ← 갤러리·D2·D14 원본 webp
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
│       ├── services/          ← 월드컵 페이지 (퀴즈·결과는 index.html 안)
│       │   ├── worldcup-work/
│       │   └── worldcup-character/
│       └── assets/            ← 이미지 (캐릭터, 배경)
│
├── dred/                      ← DRED 서비스
│   ├── index.html             ← dred 허브
│   ├── d2/
│   │   ├── index.html         ← D2. 선곡은 data/d2-tracks.json, 브라우저에서
│   │   └── musicdb/           ← 옛 스크립트 자리. .gitignore. 시크릿 있음, 커밋 금지
│   └── d14/
│       └── index.html         ← D14 프론트엔드
```

## Vercel Rewrite
`vercel.json`이 파일보다 먼저가 아니라, 같은 경로에 파일이 있으면 그 파일이 이긴다. rewrite 대상 경로에는 `index.html`을 두지 않는다.

- `/kin/k2/quiz`, `/kin/k2/result` → `/kin/k2/index.html` (퀴즈는 그 페이지 안. 옛 `services/quiz`, `services/result`는 없다)
- `/kin/k2/worldcup/work` → `/kin/k2/services/worldcup-work/worldcup.html`
- `/kin/k2/worldcup/character` → `/kin/k2/services/worldcup-character/worldcup.html`
- `/mood-camera`, `/mood-camera/:path*`, `/_next/:path*` → `https://mirrored-five.vercel.app` 프록시

## 코딩 컨벤션
- ES Modules (`import/export`)
- 페이지 상대 경로. 공용 모듈의 이미지 경로는 `asset('/kin/k2/...')`
- CSS 커스텀 프로퍼티 활용, 디자인 토큰은 `kin/k2/lib/design-tokens.css`
- 폰트: Syne (제목), DM Mono (본문/코드)
- 색상 팔레트: `--black: #0a0a0a`, `--yellow: #FFE500`, `--dred: #5B4FCF`, `--white: #f5f5f0`

## 환경변수
- K2 Supabase anon key: `kin/k2/lib/core.js` (공개 가능)
- 갤러리·음악 Supabase와 D2 API는 더 이상 쓰지 않는다
- `dred/d2/musicdb/` 옛 스크립트에 삭제된 프로젝트의 service_role 키가 있다. 그 파일을 다시 넣지 말 것

## Git 주의사항
- `dred/d2/musicdb/`는 `.gitignore`
- `.DS_Store`는 전역 무시
- 갤러리 데이터는 `README.md`
