# kinxdred

KIN × DRED. Astro로 빌드하고 Vercel에서 연다. 지금 열려 있는 랜딩, 메인, 갤러리, D14는 `public/`에 그대로 있다.

주소는 `https://kindred-home.vercel.app` 이고, 도메인은 `https://kinxdred.com` 이다.

갤러리와 D14는 저장소 안 데이터다. K2(퀴즈·월드컵)와 D2(선곡)는 뺐다. 옛 주소 `/kin/k2`, `/kin/k2/*`, `/dred/d2`, `/dred/d2/*` 는 끝의 `/`가 있어도 `/main.html`로 보낸다. GAZE는 `/mood-camera` 프록시로 그대로다.

캐릭터·작품·세계 문서는 `AGENTS.md`.

## 로컬 확인

```bash
npm install
npm run dev
```

`http://localhost:4321/` 가 사이트 루트다. 프로덕션 출력은 `npm run build` 다음 `npm run check:links` 가 라우트 표로 확인한다. `vercel.json`의 redirect와 `/mood-camera` 프록시는 Vercel 배포에서 적용되고, 링크 검사는 그 라우트 표를 로컬에서 다시 적용한다.

## 갤러리 이미지

`public/assets/gallery/`는 Supabase Storage 버킷 `assets`의 원본 webp다. 페이지는 파일명만 붙인다 (`/assets/gallery/<filename>`). KIN 23장, DRED 28장(활성), 비활성 2장. D14 옥상 그림 `dred_rooftop_sunset_v1.webp`는 DRED 갤러리 항목이기도 하다.

## 데이터

| 파일 | 내용 |
| --- | --- |
| `public/data/kindred_gallery_kin.json` | 활성 KIN 23. 스키마 v2.1에 `show_on_main`, `like_count`, 태그 추가 |
| `public/data/kindred_gallery_dred.json` | 활성 DRED 28. 같은 스키마 |
| `public/data/main-actions.json` | `show_on_main=true` 16장. 메인 메뉴는 그 중 링크가 있는 카드만 그린다. 남은 링크는 GAZE와 D14 |

본문 순서는 DB `order_num`, 같으면 `id`다. 항목 1–23의 태그는 `gallery_item_tags`, 그 다음 항목은 `gallery_items.tags`다. 활성인데 파일이 없는 카드는 `kindred_mood_camera`뿐이고 `/mood-camera`로 간다.

좋아요의 기준 숫자는 `gallery_likes`다. 이 브라우저에서 누르면 `localStorage`의 `kxd_liked`가 그 위에 1을 더한다.

캐릭터 에이전트 이벤트는 `kinxdred.com`에서만 같은 출처의 `/api/event`로 보낸다. 다른 호스트는 호출하지 않는다. 업스트림 주소는 환경변수다. 없거나 잘못되면 함수는 503을 돌려 페이지는 그대로 둔다. 이름은 `AGENTS.md`와 `.env.example`에 있다.
