# HOME 프로젝트

## 개요
kinxdred 메인 웹사이트. 정적 HTML/CSS/JS. Vercel과 GitHub Pages 둘 다 루트 정적 파일로 연다.

- GitHub: `ben-blog/kindred_home`
- 배포: Vercel, GitHub Pages (`https://ben-blog.github.io/kindred_home/`)

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
├── vercel.json                ← 정적 출력만 (rewrite 없음)
├── data/                      ← 갤러리 JSON, 메인 카드, D2 트랙
├── js/                        ← site-base, gallery, d2, d14
├── assets/gallery/            ← 갤러리·D2·D14 이미지 (지금 placeholder)
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

## 경로
GitHub Pages 프로젝트 사이트는 `/kindred_home/` 아래다. HTML 링크는 페이지 기준 상대 경로. JS의 사이트 루트 경로는 `js/site-base.js`의 `asset()`가 `github.io`에서만 접두어를 붙인다. Vercel과 로컬 루트 서버는 접두어가 없다.

예전에 rewrite로 열리던 주소는 폴더 `index.html`이 실제 파일로 보낸다.

- `/kin/k2/worldcup/work` → `kin/k2/services/worldcup-work/worldcup.html`
- `/kin/k2/worldcup/character` → `kin/k2/services/worldcup-character/worldcup.html`
- `/kin/k2/quiz`, `/kin/k2/result` → `kin/k2/` (퀴즈는 그 페이지 안)
- `/mood-camera` → `https://mirrored-five.vercel.app/mood-camera`

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
- 원본 갤러리 이미지를 넣을 자리와 Pages 켜는 법은 `README.md`
