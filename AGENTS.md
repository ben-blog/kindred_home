# AGENTS.md

Operating guide for coding agents on kinxdred.com. This includes OpenAI Codex CLI, which the site owner uses locally for visual tuning. `CLAUDE.md` is the Korean companion. If a rule here disagrees with a comment in old code, follow this file and keep `npm run check` green.

The live site must keep working. This phase is structure. It is not a visual redesign.

Visual work, including Codex, reads `DESIGN.md` before editing anything a visitor sees. That file is the binding visual spec: tokens measured from `public/`, what may be borrowed from telemyr.com, and the Do / Don't list. If `DESIGN.md` disagrees with `src/styles/site.css`, follow `DESIGN.md`. A pull request that changes how a page looks must include before and after screenshots of every existing page it touches.

## Commands

Node 22. From the repo root:

```bash
npm install
npm run dev          # http://localhost:4321
npm run serve        # production build. astro preview does not run with the Vercel adapter
npm run validate     # content schema and cross-references
npm test             # world reducer and publish rules
npm run lint
npm run build        # static pages + Vercel function output
npm run check:links  # preserved files, internal links, legacy routes
npm run check        # all of the above, in that order
```

Run `npm run check` before opening a PR. `vercel.json` redirects and the `/mood-camera` proxy apply on Vercel. The link check replays the built Vercel route table locally.

## Hard rules

- Characters, works, and campaigns are files in `src/content`. Do not hardcode how many characters exist, and do not branch on the names KIN or DRED in code. Tests may name the current canon.
- A character is `active`, `archived`, or `draft`. Draft is not built. Archived keeps its URL.
- Secrets stay out of the repo and out of the browser. Do not add Supabase keys, service-role keys, or Railway URLs. Do not change Supabase or the Railway services. Do not change the agent event objects the hubs already send (`service`, `event_type`, `payload`, and KIN's `timestamp`).
- `world/step.js` is the only place that changes world state. It is a pure `step(state, events) -> state`. Visitors enqueue `influence`. The world changes only when the leader ticks. External sources are config only: `fetch` stays `false`.
- Do not delete or retarget the legacy routes in `routing/legacy.js`.
- `public/` is the current site. Visual tuning leaves it alone. The hubs post events to `/api/event` and must not call Railway or Supabase themselves.

## Layout

```
public/                 live HTML, CSS, JS, gallery JSON, images. Served as-is.
src/content/            canon. One JSON file per entry. The file name is the id.
src/pages/              new Astro pages, /api/health, and /api/event
src/layouts/Base.astro  shell for the new pages
src/styles/site.css     tokens and styles for the new pages only
world/                  reducer, state builder, zod schemas. No Astro imports in step.js.
routing/legacy.js       redirects and GAZE rewrites. vercel.json must match.
scripts/                validate, route injection, link check
```

Live URLs that must keep their current behavior:

- `/`, `/index.html`, `/main.html`
- `/kin`, `/dred`, `/dred/d14` (D14 still loads three.js r128 from cdnjs)
- `/data/kindred_gallery_kin.json`, `/data/kindred_gallery_dred.json`, `/data/main-actions.json`
- `/kin/k2`, `/kin/k2/*`, and the same paths with a trailing slash, redirect to `/main.html`. Same for `/dred/d2`.
- `/mood-camera` and `/mood-camera/*` rewrite to `https://mirrored-five.vercel.app`
- `/_next/*` rewrites to that same host
- `/api/health` returns JSON `{ "ok": true }` from a Vercel function
- `/api/event` accepts a character event and forwards it. See Browser calls. The same allowlist is reachable at the path on the character's `agent.path` (for example `/api/kin/event`)

`/kin` and `/dred` stay the existing hubs. They are recorded as `aliases` on the character. They are not redirects to `/characters/[slug]`. New pages live beside them: `/characters`, `/characters/[slug]`, `/works`, `/works/[slug]`, `/c/[slug]`.

There is one world, `kinxdred`. Adding a second file under `src/content/world/` fails validation on purpose.

## Character

`src/content/characters/<slug>.json`, plus a matching `src/content/entities/<slug>.json` with `"kind": "character"` and the same `status`.

Every character has a relation to the leader entity (`ben`, kind `leader`) whose kinds include `leader` and `friend`. That relation is concept only. DRED's relation also includes `썸` (mutual romantic interest, not a couple) and a numeric `tension`. The character file's `relationships` array must match the relation file.

Identity color is `identity.color`. KIN is `#FFE500`. DRED is `#5B4FCF`. New pages set `--accent` from that field. `identity.mark` (`points`, `wobble`, `speed`, `scatterOnHover`) is the hero blob mark. Nothing draws it yet. Tuning those numbers is safe. The rest of the visual system — type, grain, frost, motion, and what not to borrow — is `DESIGN.md`.

`initial` is the v0 starting snapshot (`mood`, `energy`, `xp`, `level`). `level` must be `1 + floor(xp / xpPerLevel)`.

### Add

1. Create the character file with `"status": "draft"`.
2. Add the entity, a location if it needs a new one, and a `leader` + `friend` relation to `ben`.
3. Point `location` at a location file. Point `works` at work files, or leave it empty.
4. Run `npm run validate`. Draft pages are not emitted. Preview with `npm run dev` only shows them after you switch the status.
5. Set `"status": "active"` when it should be public. `/characters/<slug>` is created. No page code changes.

### Change

Edit the character file. A change inside the world (mood, bond, place) is an event fed through `step`, not a hand edit of derived state. Canon edits are the files above. Run `npm run check`.

### Retire

Set the character, its entity, and its works to `"status": "archived"`. Keep the files and the aliases. The URL stays, and `step` does not move an archived character. Do not delete the hub under `public/` until a later phase says that hub is gone.

## Work

`src/content/works/<slug>.json` and `src/content/entities/<slug>.json` with `"kind": "work"`.

- `scope: "character"` lists the cast in `characters`. Each listed character's `works` array must include this slug.
- `scope: "shared"` has `"characters": []` and appears on every public character. GAZE is shared.
- `external: false` means `url` is a file under `public/` (`/kin`, `/dred/d14`).
- `external: true` means `url` is a rewrite (`/mood-camera`). Do not add a `public/` page at that path. A file there would hide the rewrite.

`/works/<slug>` is generated for `active` and `archived`. The live experience stays at `url`.

### Add

Add the work file and the entity. For an interactive piece, add the real page under `public/` and set `url` to it. Run `npm run check`.

### Change

Edit the work file. Keep `url` pointed at the live page.

### Retire

Set the work and its entity to `archived`. Leave `url` working.

## Campaign

`src/content/campaigns/<slug>.json`. `template.json` is a draft example. It is not published. Copy it.

```json
{
  "slug": "spring",
  "status": "draft",
  "title": { "ko": "...", "en": "..." },
  "summary": { "ko": "...", "en": "..." },
  "characters": ["kin"],
  "start": "2026-03-01",
  "end": "2026-03-31",
  "utmCampaign": "spring",
  "cta": { "label": { "ko": "...", "en": "..." }, "href": "/" }
}
```

Set `status` to `active` to publish `/c/<slug>`. `end` must be on or after `start`. Retire by setting `archived` (the URL stays) or `draft` (the URL is not built).

## World model

Static canon lives in `src/content`. `world/state.js` `createState(canon)` builds the initial state. `world/step.js` applies events.

```js
import { step } from './world/step.js';
const next = step(state, events);
```

An event has `id`, `worldId`, `tick`, `at`, `who`, `what`, `where`, `payload`, and `source`. `what` is one of:

| what | source | effect before a tick | effect on the leader's tick |
| --- | --- | --- | --- |
| `influence` | `visitor-influence` | queued | warmth on an active character |
| `agent_action` | `agent` | queued | `move` changes location, `note` is only logged |
| `external` | `external` | queued | logged, no stat change |
| `tick` | `leader` | the leader (`who` is the leader slug) advances time | pending events are applied and stamped with the new tick |

Rules in `src/content/world/kinxdred.json`:

- Warmth at or above `moodThreshold` (10) raises mood by 1, capped at `moodMax`.
- One event may carry at most `maxInfluencePerEvent` (5). Reaching the threshold takes more than one event.
- No warmth decays energy by `energyIdleDecay`. Warmth adds to energy, capped, and adds to xp.
- `level` is `1 + floor(xp / xpPerLevel)`. Crossing a level unlocks lore whose `unlock.stage` is now met.
- Warmth strengthens that character's relation with the leader by 1. A `썸` relation also raises `tension` by 1. If two characters who share a relation both receive warmth, that relation strengthens by 1.
- Archived characters do not change. Invalid events are ignored. The input state is not mutated.

`whereIs(state, slug)` reads the location after the last tick. Do not persist this state to Supabase in this phase.

External categories, not fetched:

- KIN: `subculture` (`anime_release`, `manga_release`)
- DRED: `music` (`new_song`, `lyrics`)
- shared: `weather` (`weather`, `season`)

## Browser calls

Hubs and D14 do not call Railway or Supabase. On `kinxdred.com` and `www.kinxdred.com` they POST `/api/event`:

```json
{ "slug": "kin", "event": { "service": "gallery", "event_type": "gallery_visit", "payload": {} } }
```

`event` is the existing payload. The function drops `slug` and forwards `event` only. Other hosts skip the call. A failure, including 503, is ignored, so the page still renders.

`POST /api/<slug>/...` forwards only when that exact path is `agent.path` for that character and the method is `POST`. Every other path is 404. Every other method is 405.

Routing is the character file: `slug` -> `agent.upstream`. The proxy has no character-name branches. A new public character is picked up from `src/content/characters`. Its `agent.path` must start with `/api/<slug>/`, and `agent.upstream` must be one of the origin keys below. Draft characters are not routed. `methods` can only list `POST`.

Missing or unsafe origin config fails closed with `503` and `{ "error": "unavailable" }`. The function does not guess a host. Upstream errors are `502` with the same body. Responses never include the upstream body, a stack, or a token.

Per serverless instance, not a global counter:

- JSON body at most 32KB
- 30 POSTs per IP per 60 seconds. The map holds at most 1000 IPs
- upstream timeout 8 seconds
- an `Origin` header must match this request's origin. No `Access-Control-Allow-Origin: *`
- hop-by-hop headers, cookies, and the caller's `Authorization` are not forwarded
- the paired `*_TOKEN` is sent as `Authorization: Bearer` only when it is set and is a single header-safe line

### Environment

Set these in the Vercel project. The repo lists the names in `.env.example` and nowhere stores a value.

| Name | Upstream |
| --- | --- |
| `KIN_AGENT_URL` | kin-agent origin (`https` host only, no path) |
| `DRED_AGENT_URL` | dred-agent origin |
| `MIRRORED_API_URL` | mirrored-api origin |
| `KIN_AGENT_TOKEN` | optional bearer for kin-agent |
| `DRED_AGENT_TOKEN` | optional bearer for dred-agent |
| `MIRRORED_API_TOKEN` | optional bearer for mirrored-api |

No character uses `MIRRORED_API_URL` yet. Nothing in `public/` or `src/` calls mirrored-api. The key is allowlisted so a character file can point at it without a proxy edit. Do not put a service-role key in any of these.

## Codex and other local CLIs

Read `DESIGN.md` first. It is mandatory for visual work. Tokens, motion, the telemyr borrow list, reduced motion, and the Do / Don't checklist live there.

Visual tuning belongs here, with a browser on `npm run dev`. A pull request that changes how a page looks must include before and after screenshots of every existing page it touches. `DESIGN.md` states that rule.

Safe to edit while watching the page:

- `src/styles/site.css`
- markup and layout in `src/layouts` and `src/pages` (except `src/pages/api`)
- `identity.mark` and profile copy in character JSON
- a new component under `src/components`

When the first interactive island is needed, add a small UI library such as Preact and use `client:visible` or `client:idle`. Keep three.js off the character pages. D14 already loads r128. Do not upgrade it in a visual pass.

Do not, as part of visual tuning:

- edit `world/step.js`, `routing/legacy.js`, or `public/`
- add a key, or a browser call to Railway or Supabase. Hubs already post to `/api/event`
- rename routes or aliases
- turn on `fetch` for an external source
- restyle the preserved galleries by editing `public/**/*.html`

If a visual change needs one of those, stop and say so.

## Checks that must stay true

- Preserved files in `public/` are byte-identical in `.vercel/output/static`.
- D14's HTML still contains `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js`.
- Built HTML and JS do not contain `railway.app`, `supabase.co`, or `service_role`.
- Draft content is absent from the build.
