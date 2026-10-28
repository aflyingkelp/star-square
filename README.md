# STAR//SQUARE update

## Firebase Hosting and the independent cloud API

`npm run build:cloud` builds a static site in `dist/firebase` and a Supabase Edge Function bundle in `dist/edge`. Deploy the static directory with the included `firebase.json` on Firebase's Spark plan; Cloud Functions for Firebase and a billing account are not required. Firebase hosts the website; Supabase runs the API and retains the existing maps, profiles, score replays, and rankings. The Firebase browser client has no Render dependency. School network access depends on the school's policy for the actual Firebase and Supabase addresses.

The public endpoint and publishable application key are in `cloud/hosting-config.json`. These are browser configuration, not server secrets. The Supabase function uses its injected server key internally. Deploy `dist/edge/index.ts` as `star-square-api` with all sibling bundle files. Its gateway JWT check is disabled because the function checks the publishable application key itself. Apply `cloud/state-commit.sql` once before using it.

Ranked replays are simulated in chunks of 2,000 ticks. An HMAC signature binds each short-lived checkpoint to the complete submitted score and current rules, so changing a checkpoint, replay, or PP claim invalidates verification. The browser continues verification automatically; PP enters the leaderboard only after the final simulation state matches. `node cloud/check.mjs` checks cold-start continuation and rejects modified proofs. Database commits compare version timestamps and update related state documents in one transaction.

The original Node address can use `CLOUD_API_PROXY=1` during migration. It then sends online operations to the same cloud API, including completing checkpoint verification for older browser clients. Its local development default remains the local Node API.

Browser progress belongs to each website address. Choose **Export save** on your current address, then **Import save** on the Firebase address to keep unlocks, equipment, drafts, player identity, and local replays. Import keeps a local backup before replacing the destination browser save. Server records stay in the same database throughout the move.

## Free cloud hosting: Render + Supabase

Deploy this repository as a Render **Free web service**, with Node 22, build command `npm install`, and start command `npm start`. The `render.yaml` Blueprint contains this configuration. The game and API share the Render URL; GitHub Pages alone cannot run the API.

1. Create a free Supabase project and run `supabase-schema.sql` in its SQL Editor.
2. Deploy `supabase/functions/game-storage/index.ts` to Supabase. The function authenticates the Render server with a 32-byte random token, whose SHA-256 hash is recorded in its source. The token itself belongs only in Render's `STORAGE_GATEWAY_TOKEN` secret. Set `STORAGE_GATEWAY_URL` to the deployed function URL. The Supabase database secret stays inside Supabase. The function disables the gateway's JWT check because it checks its own dedicated token before any database operation.
3. Set `REQUIRE_PERSISTENT_STORAGE=1` on Render. Until Supabase is configured, the game loads but online API operations return 503 instead of writing temporary local files.
4. Open `/api/health` on the Render URL. `storage: "supabase"` confirms credentials are configured; uploading a map or score confirms the schema and database connection work.

Maps (including embedded PNGs), score replays, and ranking profiles are stored in Supabase. This initial adapter keeps three JSON state documents and serializes writes within one server process; use one instance. It is intended for a small community. Larger deployments need individual database records and transactional updates instead of rewriting the whole score collection. Local JSON data is not imported automatically.

The deployed service is https://star-square.onrender.com. Render owns the runtime environment settings; the Blueprint is a template for recreating the service. For a direct REST setup instead of the function, the server also accepts paired `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` variables. Never expose either server credential to browser code. For token rotation, deploy a new hash and update Render's token together; the old token stops working immediately.

Render Free sleeps after inactivity, so the first visit can take about a minute. Free provider quotas and Supabase project pausing still apply. No part of the deployed app depends on your PC staying on.

## Run the game with the community hub

Requires Node.js 18 or newer. From this folder, run:

```sh
npm start
```

Then open [http://localhost:4173](http://localhost:4173). The hub stores uploaded spell cards and community ratings in `data/maps.json` on the server. Keep that file with the server to retain its map library.

During a run, press **Esc** to pause or resume. Hold **Space** to dash; release it early to cut the dash short. The current health and remaining lives are shown in the right-side run panel.

Choose **Watch perfect TAS** from the title screen to browse demonstrations for every catalog level. Replays use normal earned equipment, take zero hits, use zero bombs, and do not award PP or change your progress. The viewer supports pause, slow motion, faster playback, and one-tick stepping. See [TAS documentation](tas-tools/README.md) for the input format and regeneration commands.

The existing GitHub Pages site is static and does not provide an upload API. The hub will explain when that server is unavailable; to enable shared uploads, host this Node server (or deploy its `/api/maps` routes on a compatible backend) and serve the game from the same origin.

## Star rating and PP

Open **Song select** to browse Dan sets, search by name/lane/star threshold, sort by rank or stars, filter to playable or cleared sets, and choose a base or Plus lane trial. Each Alpha–Omega Dan has four base lanes and four Plus lanes. The set-and-difficulty browsing flow is inspired by osu!’s song select.

Stars combine a rank progression with a restrained adjustment from simulated pattern difficulty. The progression is anchored at Tutorial/1st Dan = 1★, Kappa = 11★, and Omega = 44★. Intermediate ranks are centered on their same-Dan median simulated difficulty; the adjustment is capped at ±0.6★. Kappa and Omega are exact 11★ and 44★ anchors. Open **Difficulty inspector** for any map or **Analyze difficulty** in the editor for a draft. Results show the underlying five skill scores and strain graph.

- **Precision:** estimated bullet clearance after subtracting bullet radius and the player's 5 px hit radius.
- **Movement:** demanded movement speed, direction reversals, and availability of escape directions.
- **Reading:** nearby approaching projectiles and changing trajectories (homing, spin, acceleration).
- **Timing:** estimated escape margins; scripted frame-perfect requirements contribute from their real input count, spacing, and window.
- **Endurance:** strain maintained over threatening sections. Empty duration does not add difficulty by itself.

The analyzer uses the running game's volley generation, keyframe interpolation, boss movement, and bullet integrator. It searches three heuristic movement policies using focus, normal movement, sprint, and baseline dash. Each checks 17 actions every 12 frames against a 24-frame trajectory forecast. It evaluates all animation phases, including late keyframes. Fixed reference exposure is boss HP divided by 24 DPS, at least one complete animation cycle. This is an exposure estimate rather than a weapon aim / boss-kill simulation.

Strain accumulates and decays over time. Peaks are recorded every 400 ms, sorted, and combined with geometrically decreasing weights (0.93); the five skills combine with a power mean exponent of 2.2. These coefficients define the pattern adjustment to the rank progression. PNG art and names have no effect. The five skill scores remain the raw simulation; the displayed stars use the calibration described above.

Route finding is approximate: forecasts hold the homing target at its current position, and future volleys react to the selected route. A failed search is labeled **route unverified**, never proof of impossibility. An unverified rating carries a † marker in the level list and has lower confidence. A surviving heuristic route is not an independently verified TAS. The analysis does not measure maximum score or graze farming.

For an SS with no hits or bombs, PP follows these anchors: 3.5★ = 100, 4.3★ = 200, 5.4★ = 300, and 6.2★ = 400. After 7★, every additional 0.8★ adds 100 PP. Hits and bombs reduce PP. Existing cleared-map records are recalculated from saved best-run statistics; clears and unlocks are preserved. Score and graze do not boost PP. The weighted total still discounts successive best scores.

Official ratings and full curves are precomputed in difficulty-catalog.js for instant display. Custom maps run in a background Worker, with a yielding fallback. Regenerate the catalog after changing gameplay or the analyzer with node tas-tools/generate-difficulty.mjs. Generation also updates the existing replay library source fingerprint; it does not verify replay tapes.

Plus trials are designed as near-limit follow-ons. Each starts at least four pressure ranks above its base Dan, scales toward the rank-44 pressure ceiling, and adds a small bullet-speed increase. Plus stars add a rank-based 1.1–4.5★ premium to the base curve. Clear all four base lanes to unlock that Plus Dan, then clear each Plus set in sequence. Every Plus trial has a zero-hit, zero-bomb TAS; Omega+ also requires all 473 exact dash cues.

## Omega

Omega appears after Psi and is anchored at 44★ on the game’s rank curve. Omega clears require a continuous sequence of 473 Space inputs on exact 240 Hz simulation ticks (4.167 ms each). Missing a cue resets the sequence. The Omega boss cannot be defeated until the sequence is complete. Timing is deterministic and independent of the monitor refresh rate or browser scheduling.

## Build custom patterns

Open **Pattern editor** and choose a phase. Each phase has a scrubber and two keyframe tracks: **Patterns** and **Boss path**. The three phase timelines play in sequence during a trial.

- Scrub to a time and edit a shot group, or use **＋ Pattern key** to capture the complete volley. Speed, angle, copy count, spread, homing, spin, size, and firing interval interpolate between keys. Choose linear, eased, or hold interpolation. Adding/removing groups and changing colors or aiming mode takes effect at the corresponding key.
- Select **Move boss**, scrub to another time, and drag the boss to create a position key. You can also enter X, Y, and rotation in the inspector. Click a key diamond to return to it, drag the diamond to retime it, or delete keys with the timeline buttons. The first key stays at time zero.
- Select **Aim bullets** to draw new groups or drag ray tips to aim and set speed. Choose fan or ring in the group inspector. **Move target** repositions the preview dummy for aimed and homing patterns.
- Use **Play phase** to preview the animation, or **Playtest** to run all three timelines in the actual game. Scrubbing rebuilds projectile flight from the beginning of the selected phase. Custom volleys are capped at 240 shots, and custom projectiles expire after 10 seconds.

The **PNG ART** section accepts separate transparent PNGs for the boss body and enemy bullets. Files must be under 2 MB; the editor fits them within 256 × 256 pixels and embeds the PNG data in the map. Boss size and bullet art scale control their appearance; bullet hitbox radius is edited separately. Bullet art can rotate with its trajectory, and boss art follows position and rotation keys.

Saving, JSON export/import, and community map uploads retain all keyframes and PNG data. Shared uploads require the included Node server. If browser storage fills, the editor keeps your draft and offers JSON export rather than reporting a false save.

## Scores, accuracy, and replays

Each completed clear, failed run, and practice session is saved in this browser with its score, PP, grade, hit count, and replay. Run accuracy is survival accuracy: remaining lives divided by starting lives, shown as a percentage (a hit reduces it; a hitless run is 100%). Open **Saved scores** from the title screen or a result, then choose **Watch replay** to review the deterministic 240 Hz input tape. The list keeps recent runs, including failures.

When the game is served by `npm start` at `http://localhost:4173`, each new score and replay is also posted to `/api/scores` and stored in `data/scores.json` beside the server data. Starting the server later and opening Saved scores retries pending uploads. Opening the HTML directly with `file://` keeps scores local because browsers block same-origin API access. This is a server on your computer; hosting it publicly requires deploying the included Node server.

Press **Esc** from a result screen to return to the Dan tree.

## Server rankings and ranked score verification

The Dan tree opens **Global ranking** for global, country, and region positions plus a rank-history graph. Every official level card has its own **Leaderboard** button. These views require the game to be served from the same Node server; opening the HTML with file:// cannot submit scores or show shared rankings.

The server stores score runs in data/scores.json, and ranked player profiles in data/profiles.json. It replays each claimed ranked clear using the saved 240 Hz input tape, the official level, and the submitted loadout before adding its PP to global or level rankings. Failed, custom, practice, and speedhack scores are still stored; they appear in the unranked level table and do not add ranked PP.

Country and region are estimated from the request IP using ipapi.co. The server keeps the country and region codes, not the raw IP; it sends the address to ipapi.co for the lookup. IP-based region estimates can be imprecise. For local use, the provider sees the server's public egress address. Behind a reverse proxy, configure TRUST_PROXY_HOPS to the number of trusted proxy hops so the server can resolve the player's address; forwarded headers are ignored by default. GEOIP_LOOKUP=0 disables lookup.

Game speed can be set to 1.5×, 2×, 4×, or 8× from the control panel (F toggles 2×). Any run that uses accelerated speed is explicitly unranked: it still earns local unranked PP and uploads the replay, but the server excludes it from global and ranked level tables. A server-verified normal speed clear is needed for ranked PP.

Hit invulnerability shrinks as the Dan rank rises: it starts at 110 frames and drops by four frames per rank, with a 24-frame floor through Eta. Theta and every higher, beyond-human rank use exactly 2 frames.
