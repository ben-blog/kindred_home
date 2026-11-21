# kinxdred

KIN × DRED. 정적 HTML/CSS/JS. Vercel에서 연다.

주소는 `https://kindred-home.vercel.app` 이다.

K2(퀴즈, 월드컵)만 아직 살아있는 Supabase(`lmfyspozcmyefgrkgxch`)와 AniList를 쓴다. 갤러리, D2, D14는 저장소 안 데이터다.

## 로컬 확인

```bash
python3 -m http.server 8765
```

`http://127.0.0.1:8765/` 는 Vercel과 같이 사이트 루트다. `vercel.json`의 rewrite와 `/mood-camera` 프록시는 Vercel에서만 적용된다. 로컬 정적 서버는 그 경로를 대신 열어 주지 않는다.

## 원본 이미지

갤러리 그림 23장과 D2/D14가 쓰던 3장은 Supabase Storage에만 있었고 git에는 없다. 지금은 `assets/gallery/`의 단색 placeholder다. 같은 파일명으로 그 폴더에 넣고 커밋하면 페이지가 그 파일을 읽는다.

갤러리 (KIN 11, DRED 12):

- `kin_g3_bus_risograph.webp`
- `kin_room_mangacafe_01.webp`
- `kin_a1_laptop_night.webp`
- `kin_a2_convenience_store.webp`
- `kin_c1_crowd_subway.webp`
- `kin_c2_convenience_night.webp`
- `kin_g1_energy_poster.webp`
- `kin_g2_subway_platform.webp`
- `kin_c3_sketchbook_floor.webp`
- `kin_k1_adachi_clean.webp`
- `kin_k2_adachi_okonomiyaki.webp`
- `dred_a1_camera_black.webp`
- `dred_a2_rain_window.webp`
- `dred_c1_escalator.webp`
- `dred_c2_parking_worm.webp`
- `dred_d1-2_rush_hour.webp`
- `dred_d2_gas_station_worm.webp`
- `dred_d3_painterly_solitude.webp`
- `dred_g2_kin_dred_1.webp`
- `dred_g2_turnback.webp`
- `dred_g3_music.webp`
- `dred_g4_highway_wall.webp`
- `dred_room_studio_01.webp`

D2 상태 그림, D14 옥상 그림 (갤러리 JSON에는 없는 파일):

- `dred_d2_state1.webp`
- `dred_d2_state2.webp`
- `dred_rooftop_sunset_v1.webp`

## 데이터

| 파일 | 내용 |
| --- | --- |
| `data/kindred_gallery_kin.json` | 갤러리 텍스트 v2.1, KIN 11. `af4e75a` 직전 |
| `data/kindred_gallery_dred.json` | 갤러리 텍스트 v2.1, DRED 12 |
| `data/main-actions.json` | 메인 메뉴 카드 |
| `data/d2-tracks.json` | D2 트랙 4,330. 아티스트, 제목, 장르, Spotify id, 키워드 비트 |

D2 키워드는 `65ef653` 직전의 `d2_tags_result.json`에서 왔다. 15개 키워드 밖 태그는 그때의 `clean_tags.py`와 같이 빠졌다. `muse_v3.csv`(18MB)는 넣지 않았다.

좋아요는 이 브라우저의 `localStorage`(`kxd_liked`, `kxd_like_counts`)다.

캐릭터 에이전트(`kin-agent`, `dred-agent`) 이벤트는 `kinxdred.com`에서만 보낸다. 다른 호스트는 호출하지 않아서, 허용되지 않은 Origin의 실패가 페이지를 멈추거나 콘솔을 막지 않는다.
