# DESIGN.md

Binding visual spec for kinxdred.com. Read this before any visual change, including Codex visual tuning. `AGENTS.md` still decides what a task may edit. This file decides how it must look.

This phase is structure. This document does not start a redesign. When a task does change visuals, follow this file. If it disagrees with the current `src/styles/site.css`, follow this file. `public/` is the measured source. Do not edit `public/`, `world/`, `src/pages/api`, or `vercel.json` to make them match this spec unless the task explicitly says so.

Character pages stay in the existing KIN / DRED language: dark, full-bleed, film grain, frosted panels, Syne display, DM Mono labels. From [telemyr.com](https://telemyr.com), borrow only the interaction listed under Telemyr. Do not borrow the rest of that site.

Per-character values come from `src/content`. Components do not branch on the names KIN or DRED, and do not hardcode how many characters exist.

## Direction (approved)

- Dark base on every character page. No light page, no white corporate canvas.
- KIN accent is `#FFE500`. DRED accent is `#5B4FCF`. New pages read the accent from `identity.color`. They do not paint a second yellow.
- `public/main.html` still paints some KIN type and the KIN-side cursor in `#FFE800`. That is a known inconsistency. Leave it until a task is allowed to edit `public/`.
- Text is white at four opacities: `.92`, `.72`, `.50`, `.35`.
- Frosted panels are `rgba(8,8,8,.88)` with a 14–16px backdrop blur. Film grain sits near 2% opacity.
- Display type is Syne 800. UI type is DM Mono 300/400. Cormorant Garamond and Share Tech Mono belong to D14 only.
- Motion uses the easings below, and every new motion respects `prefers-reduced-motion`. The live pages do not, yet.
- Blob marks, borrowed from telemyr, sit in the hero only. They are driven by `identity.mark`. They are not the nav and not the cursor.

## Color

Accent is data. Today the files are `src/content/characters/kin.json` (`identity.color` `#FFE500`) and `src/content/characters/dred.json` (`identity.color` `#5B4FCF`). A new character brings its own hex. Set `--accent` from that field.

| Token | Value | Where it is measured |
| --- | --- | --- |
| KIN ground | `#080806` | `public/kin/index.html` — `html,body` `background`, and `:root { --bg:#080806 }`. Header fade is `linear-gradient(rgba(8,8,6,.9), transparent)` on `#header`. |
| DRED / world ground | `#000` | `public/dred/index.html` — `html,body` `background`, `:root { --bg:#000 }`. Same ground on `public/main.html` `html,body` and `public/dred/d14/index.html` `html,body`. |
| Landing ground | `#0a0a0a` | `public/index.html` — `:root { --black:#0a0a0a }` and `html, body { background: var(--black) }`. A third black. Not the character-page ground. |
| KIN accent, approved | `#FFE500` | `public/kin/index.html` `:root { --kin:#FFE500 }`. `public/index.html` `:root { --yellow:#FFE500 }`. Character file `identity.color`. Borders and sheets in `public/main.html` already use `rgba(255,229,0,…)`. |
| DRED accent | `#5B4FCF` | `public/dred/index.html` `:root { --dred:#5B4FCF }`. `public/index.html` `:root { --dred:#5B4FCF }`. `public/main.html` `.td` `color`. Character file `identity.color`. |
| KIN accent, live drift | `#FFE800` | `public/main.html` `.tk`, the `.tx` gradient, `.card-kin-name`, the `.card-kindred-name` gradient, and `updateCursor` (`background:'#FFE800'`). Nearby tints use `rgba(255,232,0,…)` on `#sl-kin`, `.bn-k`, `.vm-char-kin`, `.vm-item-kin`, `.card-kin-tag`. Do not copy this hex onto new pages. |

Approved character-page ground is near-black: `#080806` or `#000`. Pick one for the shared character layout and keep it. Do not switch the ground by character name. The hubs already differ, and that difference stays in `public/`. Do not lighten the page because the accent is yellow. The landing's `#0a0a0a` stays on the landing.

D14's favicon SVG uses `#0a0812` as a mark fill. That is not a page background.

## Text

White type on the dark ground, in four steps. New pages use this ramp and no others.

| Step | Opacity | Role | Measured selector |
| --- | --- | --- | --- |
| Primary | `.92` | Names and the sentence you are meant to read | Approved step. Live white at `.92` is the KIN thumbnail balloon fill, not type: `public/kin/index.html` `.thumb-label` `background:rgba(255,255,255,.92)` (the words inside are `#111`). Nearest white type is `public/main.html` `.ks-item-name` and `.kx-item-name` at `.85`, `#skip-btn:hover` at `#fff`, and `public/dred/d14/index.html` `--text-ts:#fff` on `.timestamp`. New primary text uses `.92`. |
| Body | `.72` | Description | `public/kin/index.html` `#detail-desc` and `public/dred/index.html` `#detail-desc`: `color:rgba(255,255,255,.72)`. |
| Secondary | `.50` | Controls, language, close | `public/kin/index.html` and `public/dred/index.html`: `.lt`, `#detail-close`, `.dn` at `rgba(255,255,255,.50)`. |
| Quiet | `.35` | Counts and idle actions | Both hubs: `#like-btn` and `#detail-counter` at `rgba(255,255,255,.35)`. |

Other live whites are not extra steps. Do not add them to new pages: `#skip-btn` `.75`, `.h-back` `.55`, `#detail-technique` `.52`, `.perspective-text` `.60`, `public/main.html` `.sct` `.42`, `.card-kin-desc` `.38`, `.lt-sep` `.25`, `public/dred/index.html` `#hint` `.14`.

`public/index.html` `--white:#f5f5f0` is the landing's solid warm white. Character pages use the opacity ramp, not a solid `#f5f5f0` body.

Accent type stays the character color. Examples already on the hubs: `public/kin/index.html` `.h-name` and `#detail-title` use `var(--kin)`; `public/dred/index.html` `.h-name` and `#detail-title` use `var(--dred)`.

## Surfaces

Frost, approved for new panels:

| Piece | Value | Source |
| --- | --- | --- |
| Fill | `rgba(8,8,8,.88)` | `public/main.html` `.bwrap` `background`, and the tail `border-*-solid` on `.bwrap::after`. |
| Blur | `14px` | `public/main.html` `.bwrap` `backdrop-filter:blur(14px)`. |
| Blur, upper end | `16px` | `public/main.html` `.card-kin-inner`, `.card-kindred-inner`, `.card-dred-inner`. |
| DRED detail scrim | `rgba(0,0,0,.94)` + `blur(14px)` | `public/dred/index.html` `#detail-panel`. |
| KIN viewer scrim | `rgba(4,4,3,.88)`, no blur | `public/kin/index.html` `#backdrop`. |

New frosted panels use `rgba(8,8,8,.88)` and `backdrop-filter: blur(14px)` or `blur(16px)`, with a 1px border in the character accent at low opacity (the live bubble is `border:1px solid rgba(255,229,0,.28)` on `.bwrap`). Hover cards tint the fill (`rgba(10,9,3,.94)`, `rgba(8,6,10,.94)`, `rgba(4,3,16,.94)`). A tint is allowed. A white card is not.

The KIN gallery balloon (`.thumb-label`, white at `.92`, text `#111`) is a thumbnail speech bubble. It is not a panel style and not a reason to make a light page.

Film grain, about 2% opacity, fractal noise, `pointer-events:none`, animated with `steps(1)`:

| Page | Opacity | Selector |
| --- | --- | --- |
| World | `.019` | `public/main.html` `#grain`. SVG `viewBox='0 0 512 512'`, `baseFrequency='0.75'`. |
| KIN hub | `.022` | `public/kin/index.html` `#grain`. SVG `viewBox='0 0 256 256'`, `baseFrequency='0.9'`, `numOctaves='4'`. |
| DRED hub | `.025` | `public/dred/index.html` `#grain`. Same 256 SVG as KIN. |
| Landing | `0.35` on the overlay | `public/index.html` `body::before`. The SVG rect inside is `opacity='0.04'`, so this layer is heavier than the hubs. Do not copy `0.35`. |
| D14 | none | `public/dred/d14/index.html` has no grain element. |

New pages use a grain layer at about `.02` (the hub band `.019`–`.025`). Stop the `steps(1)` animation under reduced motion.

KIN also lays a halftone on `body::after` (`radial-gradient` dots of `rgba(255,229,0,.045)` at `opacity:.6`). That is gallery texture. It is not required on a character page.

## Type

Load only the faces the page uses.

| Role | Face | Where it is set |
| --- | --- | --- |
| Display | Syne 800 | `public/main.html` `.tk` and `.td`: `font-family:'Syne'`, `font-weight:800`, `font-size:clamp(44px,8.5vw,116px)`, `letter-spacing:-.02em`. The same tracking is on `.card-dred-name`, `.ds-item-name`, and both hubs' `#detail-title`. |
| Display, secondary | Syne 700 | `public/main.html` `.tx` (the ×): `font-weight:700`, `clamp(32px,6vw,82px)`, `letter-spacing:.03em`. Not the hero style. |
| UI | DM Mono 300 and 400 | Body font on `public/main.html`, `public/kin/index.html`, and `public/dred/index.html`: `font-family:'DM Mono',monospace`. The stylesheet link on those three pages requests `DM+Mono:wght@300;400`. Weight 400 is set on `.thumb-action-link` (KIN) and `.frame-action-link` (DRED). Weight 300 is set on `public/dred/d14/index.html` `.meta-top span`, `.d14-nav-link`, and `.share-btn`. |
| D14 time | Share Tech Mono | `public/dred/d14/index.html` `.timestamp`. Link: `Share+Tech+Mono`. Size `clamp(3rem,8vw,5.5rem)`, `letter-spacing:0.06em`. |
| D14 line | Cormorant Garamond italic 400 | `public/dred/d14/index.html` `.message`: `font-style:italic`, `clamp(1rem,2.2vw,1.4rem)`, color `var(--text-msg)` which is `#909090`. Link: `Cormorant+Garamond:ital,wght@1,400`. |

UI labels on the hubs are uppercase DM Mono, mostly 7–12px, tracking `.18em`–`.32em`. Use that band for new labels.

| Size | Tracking | Example |
| --- | --- | --- |
| 7px | `.18em` | `public/kin/index.html` `.thumb-action-link`. `public/dred/index.html` `.frame-action-link`. |
| 7px | `.22em` | Both hubs: `.thumb-action-badge` / `.frame-action-badge`. |
| 7px | `.32em` | Both hubs: `.action-section-label`. |
| 8px | `.32em` | Both hubs: `#detail-eyebrow`. |
| 9px | `.28em` | `public/main.html` `.bn`. |
| 10px | `.22em`–`.3em` | `public/kin/index.html` `.h-back` (`.22em`). `public/dred/index.html` `.h-back` (`.3em`). |
| 11px | `.32em` | `public/main.html` `#skip-btn`. |
| 12px | body, not tracked as a label | Both hubs: `#detail-desc` and `.perspective-text`. |

Live outliers, not the new-page standard: `public/main.html` `.sl` at `.52em`, `.sct` at `.48em`, `public/dred/index.html` `#hint` at `.4em`. The world title is the only place for `clamp(44px, 8.5vw, 116px)`.

Small Syne 800 is for names inside the UI, not a second hero: `public/kin/index.html` `.h-name` is 14px, `public/dred/index.html` `.h-name` is 15px, `public/main.html` `.card-dred-name` is 30px.

New character pages use Syne and DM Mono. They do not load Cormorant Garamond or Share Tech Mono. Those two stay on D14.

## Motion

| Easing | Curve | Where it lives |
| --- | --- | --- |
| Shared | `cubic-bezier(.16,1,.3,1)` | `public/main.html` `.h-card-kin`, `.h-card-dred`, `.h-card-kindred`, `.sheet`. `public/kin/index.html` `.thumb`, `#sfx.slam`, `.like-heart`. `public/dred/index.html` `.frame img`, `#detail-inner`, `.like-heart`. This is the default for new motion. |
| DRED spring | `cubic-bezier(.34,1.56,.64,1)` | `public/dred/index.html` `.frame.has-action:hover img` inside `@media(pointer:fine)`. The comment above it names it as spring easing. |
| KIN snap | `cubic-bezier(.87,0,.13,1)` | `public/kin/index.html` `.cp` (the viewer crack panels). |

New components use the shared curve. Do not pick the spring or the snap by testing the character's name. There is no easing field on the character file. If a character needs its own curve later, add it to the content file first.

Durations already in use, for reference: thumb reveal `.45s`, card enter `.65s`, DRED card `.14s`, sheet `.42s`, detail `.4s`, crack `.5s`, spring `.38s`. Keep new motion in that range. Do not introduce long cinematic loads on a character page.

Coarse pointers already drop the custom cursor: `html,body { cursor:auto }` inside `@media(pointer:coarse)` on `public/main.html`, `public/kin/index.html`, `public/dred/index.html`, and `public/index.html`. Keep that.

## Cursor

The world cursor is `public/main.html` `updateCursor`. It is not a blob.

| State | Shape | Source |
| --- | --- | --- |
| Before the world phase | 8×8px circle, `#fff`, `mix-blend-mode:difference` | `updateCursor` when `ph!=='WORLDS'`. Default CSS is `#cur` in the same file. |
| KIN side | 13×13px circle | `width:'13px', height:'13px', borderRadius:'50%'`. Live fill is `#FFE800`. Approved fill is the character accent `#FFE500`. |
| DRED side | 2×22px line, `border-radius:2px` | `width:'2px', height:'22px', background:'#5B4FCF'`. |
| DRED hover | 2×2px circle | `rgba(91,79,207,.4)`. |

Between the two sides the cursor lerps size and color. That lerp is world-page behavior. A character page has one accent, from `identity.color`.

Hub cursors are different and stay on those hubs: `public/kin/index.html` `#cur` is 8px (`#cur.big` 24px) in `var(--kin)`; `public/dred/index.html` `#cur` is 8px (`#cur.drag` 18px, `border-radius:2px`) in `var(--dred)`. `public/index.html` `#cursor` is a 10px white circle that grows to 36px.

`public/dred/d14/index.html` `.cursor` is a text caret (`1.5px` wide, blink), not the pointer.

Blob marks do not replace any of these.

## Reduced motion

`prefers-reduced-motion` does not appear in `public/` or `src/`. That is a gap. Every new animation, transition, grain step, cursor lerp, typewriter, blob wobble, and 3D loop must sit inside a check for `prefers-reduced-motion: reduce`.

When it matches:

- No grain animation. The still grain image may stay.
- No blob wobble and no pointer scatter. Draw one still frame of the mark.
- No custom-cursor motion. The system cursor is fine.
- No typewriter. D14's `typewrite` in `public/dred/d14/index.html` is the live pattern to avoid copying without this check.
- No three.js render loop. Show the still frame.

Do not retrofit this into `public/` unless the task says to edit those files.

## Telemyr

Borrow one interaction: a liquid blob mark for the character.

- Shape, wobble, and speed come from that character's `identity.mark`: `points`, `wobble`, `speed`. Today KIN is `points: 6`, `wobble: 0.08`, `speed: 1`. DRED is `points: 5`, `wobble: 0.06`, `speed: 0.8`. Both set `scatterOnHover: true`. Read the file. Do not copy these numbers into a component.
- The pointer pushes the blob. When `scatterOnHover` is true, the pointer scatters it. Color is `identity.color`.
- The blob is in the hero only. Not in the nav. Not in the cursor. Not in a footer.
- 3D, if the mark needs it, loads lazily when the hero is on screen or the browser is idle (`client:visible` or `client:idle`). Keep three.js off the character page unless that island is the one that needs it. D14 already loads `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`. Do not upgrade it and do not import it into the character page by default.
- Reduced motion gets a still frame, not a paused-looking loop.

Do not borrow from telemyr:

- A white or light corporate base.
- A bottom dock.
- A heavy robot 3D scene.
- Corporate, product, or assistant copy. Character lines stay short and spoken, in the register of the hub captions and the gallery comments. See Voice.

## Data, not names

A character page is a function of `src/content/characters/<slug>.json` and the related content files.

| On the page | Field |
| --- | --- |
| Accent, `--accent` | `identity.color` |
| Hero blob | `identity.mark` (`points`, `wobble`, `speed`, `scatterOnHover`) |
| Name | `name`, a language map. Pages read it with `text()` from `src/lib/locale.js`. |
| Intro | `profile.tagline`, `profile.bio` |
| Bond line | `relationships[].note`, `relationships[].kinds`. A `썸` bond also has numeric `tension`. |

`identity.mark` is not drawn yet. Tuning the numbers is safe. Drawing them belongs to a visual task that follows this file.

The hub URLs (`/kin`, `/dred`, `/dred/d14`) stay the live hubs. They are `aliases`. They are not redirects to `/characters/[slug]`.

## Voice

Intro and description copy sounds like the character. The sources are the lines already on the site: the captions in `public/main.html` (`.bn-k`, `.bn-d`), the character's own `kin_perspective` / `dred_perspective` in `public/data/kindred_gallery_kin.json` and `public/data/kindred_gallery_dred.json`, and the hub copy. Do not invent a backstory, a product sentence, or a route announcement (`The live page is /kin`).

Write `en`. Other locale keys are optional and stay hidden until that code is listed in `src/config/site.js`. See `AGENTS.md`. Keep it short.

DRED's bond with Ben includes `썸` in `kinds` and a numeric `tension`. That is mutual romantic interest, and they are not a couple. The prose does not announce it. The data carries it. KIN's bond is `leader` and `friend` only.

## Known inconsistencies

Leave these in the code until a task is allowed to change the file that holds them.

1. `#FFE800` on `public/main.html` type and the KIN-side cursor, against approved `#FFE500`. Listed under Color.
2. No `prefers-reduced-motion` support. New work adds it. Old pages wait.
3. Grain opacity is a band (`.019` / `.022` / `.025`), and the landing overlay is a different treatment. New pages use about `.02`.
4. Three dark grounds (`#080806`, `#000`, `#0a0a0a`). A shared character layout picks one of `#080806` or `#000` and does not switch it by name.
5. `src/styles/site.css` currently copies the landing tokens (`--black:#0a0a0a`, solid `--white:#f5f5f0`) and has no grain, frost, or opacity ramp. It is the file a visual task edits. It is not the source of these tokens.

## Do / Don't

Codex and any other agent follow this list on visual work.

Do:

- Read this file first, then the character JSON for the page being touched.
- Keep the ground near-black and full-bleed. Put film grain near 2% opacity over it.
- Set `--accent` from `identity.color`. Draw the hero blob from `identity.mark`.
- Use Syne 800 at `clamp(44px, 8.5vw, 116px)` and `letter-spacing:-.02em` for the hero name. Use DM Mono 300/400, 7–12px, uppercase, tracking `.18em`–`.32em`, for labels.
- Use white at `.92` / `.72` / `.50` / `.35` for type.
- Use frosted panels at `rgba(8,8,8,.88)` with 14–16px backdrop blur.
- Ease new motion with `cubic-bezier(.16,1,.3,1)`.
- Honor `prefers-reduced-motion: reduce` with a still frame and no looping motion.
- Hide a custom cursor on `pointer: coarse`.
- Write copy from the character's existing lines, in `en`. Add another locale only by the steps in `AGENTS.md`.
- Put before/after screenshots in the PR, as below.

Don't:

- Don't make a light character page, a white canvas, or a bottom dock.
- Don't import telemyr's robot scene or its corporate copy.
- Don't put the blob in the nav or the cursor.
- Don't hardcode a character name, a character count, `#FFE500`, or `#5B4FCF` inside a component. Read the content file.
- Don't choose the DRED spring or the KIN snap with a name check.
- Don't load Cormorant Garamond or Share Tech Mono on a character page.
- Don't add motion that ignores `prefers-reduced-motion`.
- Don't upgrade D14's three.js, and don't restyle `public/**/*.html` as part of a character-page pass.
- Don't "fix" `#FFE800` in `main.html` from a character-page task.
- Don't write bios that describe the route, the schema, or the agent (`gallery`, `the live page is /kin`, `concept only`).
- Don't ship a visual change without the screenshots below.

## Screenshots

Any pull request that changes how a page looks must include before and after screenshots of every existing page it touches. That includes the preserved hubs when they are in the diff (`/`, `/main.html`, `/kin`, `/dred`, `/dred/d14`) and the new routes the diff changes (`/characters`, `/characters/[slug]`, `/works`, `/works/[slug]`, `/c/[slug]`).

A docs-only or copy-only pull request is not a visual pull request. It does not need those screenshots. It does need the full before/after text of every copy field it changes, with the source line each new sentence comes from.
