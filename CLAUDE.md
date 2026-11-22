# HOME 프로젝트

## 개요
kinxdred 메인 웹사이트. 정적 HTML/CSS/JS. Vercel에서 루트로 연다.

- GitHub: `ben-blog/kindred_home`
- 배포: Vercel (`https://kindred-home.vercel.app`)

## 기술 스택
- 순수 HTML / CSS / JavaScript (프레임워크 없음)
- 공용 스크립트는 클래식 `<script>` (`js/site-base.js`, `js/gallery.js`, `js/d14.js`)
- 갤러리·D14는 저장소 안 JSON. 백엔드 없음
- K2(퀴즈·월드컵)와 D2(선곡)는 제거했다. 옛 주소는 `/main.html`로 리다이렉트

## 폴더 구조

```
home/
├── index.html                 ← 메인 랜딩 (kinxdred 진입점)
├── main.html                  ← 메인 콘텐츠 페이지
├── vercel.json                ← 옛 K2·D2 → /main.html. GAZE(/mood-camera) 프록시
├── data/                      ← 갤러리 JSON, 메인 카드
├── js/                        ← site-base, gallery, d14
├── assets/gallery/            ← 갤러리·D14 원본 webp
├── favicon.svg
│
├── kin/                       ← KIN 갤러리
│   └── index.html             ← kin 허브
│
├── dred/                      ← DRED 서비스
│   ├── index.html             ← dred 허브
│   └── d14/
│       └── index.html         ← D14 프론트엔드
```

## Vercel
`rewrites`는 파일보다 먼저가 아니다. 같은 경로에 파일이 있으면 그 파일이 이긴다. rewrite 대상 경로에는 `index.html`을 두지 않는다.

`redirects`는 그 경로의 페이지를 지운 뒤에 옛 주소를 `/main.html`로 보낸다.

- `/kin/k2`, `/kin/k2/:path*` → `/main.html`
- `/dred/d2`, `/dred/d2/:path*` → `/main.html`
- `/mood-camera`, `/mood-camera/:path*`, `/_next/:path*` → `https://mirrored-five.vercel.app` 프록시 (GAZE)

## 코딩 컨벤션
- 페이지 상대 경로. 공용 스크립트의 이미지 경로는 `asset('/assets/...')` (`js/site-base.js`, 사이트 루트)
- CSS 커스텀 프로퍼티. 색은 각 페이지 `:root`에 둔다
- 폰트: Syne (제목), DM Mono (본문/코드)
- 색상 팔레트: `--black: #0a0a0a`, `--yellow: #FFE500`, `--dred: #5B4FCF`, `--white: #f5f5f0`

## 환경변수
- Supabase 클라이언트는 없다. K2만 쓰던 anon key도 페이지와 함께 빠졌다
- 갤러리 Supabase와 D2 API는 더 이상 쓰지 않는다
- `dred/d2/musicdb/` 옛 스크립트에 삭제된 프로젝트의 service_role 키가 있었다. 그 폴더를 다시 넣지 말 것

## Git 주의사항
- `dred/d2/musicdb/`와 `dred/d2/api/`는 `.gitignore` (로컬에 남은 시크릿이 커밋되지 않게)
- `.DS_Store`는 전역 무시
- 갤러리 데이터는 `README.md`
