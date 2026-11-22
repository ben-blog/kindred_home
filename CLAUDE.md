# HOME 프로젝트

코딩 에이전트용 전체 절차는 `AGENTS.md`에 있다. 둘의 내용이 어긋나면 `AGENTS.md`와 `npm run check`를 따른다.

## 개요

kinxdred 메인 웹사이트. Astro 정적 출력 + Vercel adapter. 지금 열려 있는 페이지는 `public/`에 그대로 있고, 캐릭터·작품·세계 데이터는 `src/content`에 있다.

- GitHub: `ben-blog/kindred_home`
- 배포: Vercel (`https://kindred-home.vercel.app`, 도메인 `https://kinxdred.com`)
- 플랜: Hobby, 지금은 비상업

## 기술 스택

- Astro (`output: 'static'`), content collections, `@astrojs/vercel`
- 살아 있는 페이지는 여전히 순수 HTML / CSS / JS (`public/`)
- 가벼운 API는 이 저장소의 Vercel function (`/api`). 지금은 `/api/health`만
- 긴 에이전트는 Railway에 그대로 둔다 (`kin-agent`, `dred-agent`, `mirrored-api`). 이 페이즈에서 호출을 바꾸지 않는다
- 데이터는 나중에 Supabase. 이 페이즈에서는 스키마와 reducer만 저장소에 있다. 키를 넣지 않는다

## 폴더

```
public/                 지금 사이트. 빌드가 그대로 복사한다
├── index.html          랜딩
├── main.html           메인
├── kin/                KIN 허브. /characters/kin 으로 보내지 않는다
├── dred/               DRED 허브, dred/d14
├── data/               갤러리 JSON
├── js/                 site-base, gallery, d14
└── assets/gallery/
src/content/            캐릭터, 세계, 장소, 존재, 관계, 외부 소스, 작품, 캠페인
src/pages/              /characters, /works, /c/[slug], /api/health
world/step.js           step(state, events) -> state
routing/legacy.js       옛 K2·D2 redirect, GAZE rewrite
```

캐릭터는 파일 하나다. 코드에 인원수나 KIN, DRED 이름을 박지 않는다. `status`는 `active` | `archived` | `draft`. draft는 빌드하지 않고, archived는 주소를 유지한다.

## 명령

```bash
npm run dev
npm run serve   # 빌드 결과. Vercel adapter에서는 astro preview가 안 된다
npm run check
```

`check`는 스키마 검사, reducer 테스트, lint, 빌드, 링크 검사다.

## Vercel

`rewrites`는 파일보다 먼저가 아니다. 같은 경로에 파일이 있으면 그 파일이 이긴다. rewrite 대상 경로에는 `index.html`을 두지 않는다.

`redirects`는 그 경로의 페이지를 지운 뒤에 옛 주소를 `/main.html`로 보낸다. 목록의 원본은 `routing/legacy.js`이고 `vercel.json`과 같아야 한다. 빌드 끝에 같은 규칙이 `.vercel/output/config.json`에 들어간다.

- `/kin/k2`, `/kin/k2/:path*`, `/kin/k2/:path*/` → `/main.html`
- `/dred/d2`, `/dred/d2/:path*`, `/dred/d2/:path*/` → `/main.html`
- `/mood-camera`, `/mood-camera/:path*`, `/_next/:path*` → `https://mirrored-five.vercel.app`

D14는 `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`를 그대로 쓴다.

`vercel.json`에 `buildCommand: null`이나 `outputDirectory: "."`를 다시 넣지 않는다. 그러면 Astro 빌드와 `/api/health`가 빠진다.

## 세계

정적 canon은 `src/content`. 방문자는 `influence`만 쌓고, Ben(`kind: "leader"`)이 `tick`할 때만 `world/step.js`가 상태를 바꾼다. 모든 캐릭터는 Ben과 `leader` + `friend`다. DRED와 Ben은 추가로 `썸`이고 `tension` 숫자가 있다. 외부 소스는 데이터만 있다. KIN은 서브컬처, DRED는 음악, 공유는 날씨·계절. `fetch`는 `false`다.

## 코딩 컨벤션

- 지금 페이지의 상대 경로를 유지한다. 공용 스크립트의 이미지 경로는 `asset('/assets/...')`
- 새 페이지의 색·글꼴은 `src/styles/site.css`. 캐릭터 색은 character 파일의 `identity.color`에서 `--accent`로 들어간다
- 폰트: Syne (제목), DM Mono (본문)
- 팔레트: `--black: #0a0a0a`, `--yellow: #FFE500`, `--dred: #5B4FCF`, `--white: #f5f5f0`
- 시각 조정은 `src/styles`, `src/layouts`, `src/pages`의 마크업, `identity.mark`까지. `public/`과 `world/step.js`는 그 작업에 포함하지 않는다

## 환경변수

- Supabase 클라이언트는 없다. 키를 코드나 브라우저에 두지 않는다
- 갤러리 Supabase와 D2 API는 더 이상 쓰지 않는다
- `dred/d2/musicdb/` 옛 스크립트에 삭제된 프로젝트의 service_role 키가 있었다. 그 폴더를 다시 넣지 말 것

## Git 주의사항

- `dred/d2/musicdb/`와 `dred/d2/api/`, 그리고 `public/` 아래의 같은 경로는 `.gitignore`
- `.DS_Store`는 전역 무시
- 갤러리 데이터 설명은 `README.md`
