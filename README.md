# kinxdred

KIN × DRED. 정적 HTML/CSS/JS. Vercel에서 연다.

주소는 `https://kindred-home.vercel.app` 이다.

K2(퀴즈, 월드컵)만 아직 살아있는 Supabase(`lmfyspozcmyefgrkgxch`)와 AniList를 쓴다. 갤러리, D2, D14는 저장소 안 데이터다.

## 로컬 확인

```bash
python3 -m http.server 8765
```

`http://127.0.0.1:8765/` 는 Vercel과 같이 사이트 루트다. `vercel.json`의 rewrite와 `/mood-camera` 프록시는 Vercel에서만 적용된다. 로컬 정적 서버는 그 경로를 대신 열어 주지 않는다.

## 갤러리 이미지

`assets/gallery/`는 Supabase Storage 버킷 `assets`의 원본 webp다. 페이지는 파일명만 붙인다 (`/assets/gallery/<filename>`). KIN 23장, DRED 28장(활성), 비활성 2장, D2 상태 그림 2장. D14 옥상 그림 `dred_rooftop_sunset_v1.webp`는 DRED 갤러리 항목이기도 하다.

## 데이터

| 파일 | 내용 |
| --- | --- |
| `data/kindred_gallery_kin.json` | 활성 KIN 23. 스키마 v2.1에 `show_on_main`, `like_count`, 태그 추가 |
| `data/kindred_gallery_dred.json` | 활성 DRED 28. 같은 스키마 |
| `data/main-actions.json` | `show_on_main=true` 16장. 메인 메뉴는 그 중 링크가 있는 카드만 그린다 |
| `data/d2-tracks.json` | D2 트랙 4,330. 아티스트, 제목, 장르, Spotify id, 키워드 비트 |

본문 순서는 DB `order_num`, 같으면 `id`다. 항목 1–23의 태그는 `gallery_item_tags`, 그 다음 항목은 `gallery_items.tags`다. 활성인데 파일이 없는 카드는 `kindred_mood_camera`뿐이고 `/mood-camera`로 간다.

D2 키워드는 `65ef653` 직전의 `d2_tags_result.json`에서 왔다. 15개 키워드 밖 태그는 그때의 `clean_tags.py`와 같이 빠졌다. `muse_v3.csv`(18MB)는 넣지 않았다.

좋아요의 기준 숫자는 `gallery_likes`다. 이 브라우저에서 누르면 `localStorage`의 `kxd_liked`가 그 위에 1을 더한다.

캐릭터 에이전트(`kin-agent`, `dred-agent`) 이벤트는 `kinxdred.com`에서만 보낸다. 다른 호스트는 호출하지 않아서, 허용되지 않은 Origin의 실패가 페이지를 멈추거나 콘솔을 막지 않는다.
