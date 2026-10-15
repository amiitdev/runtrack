<div align="center">

# 🏃 RunTrack

**A GPS running tracker — pure Expo app + Node API + Neon PostgreSQL.**

*Start a run → live GPS → distance · pace · speed · calories → route on a map →
save → history, charts, streaks and personal records.*

[![Expo](https://img.shields.io/badge/Expo-SDK_57-001F2F?logo=expo&logoColor=white)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React_Native-0.86-61DAFB?logo=react&logoColor=black)](https://reactnative.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Neon](https://img.shields.io/badge/Neon-PostgreSQL-00E599?logo=postgresql&logoColor=black)](https://neon.tech)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-000000?logo=vercel&logoColor=white)](https://vercel.com)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

</div>

---

## 📑 Table of Contents

- [What it does](#-what-it-does)
- [How it works](#-how-it-works)
- [Tech stack](#-tech-stack)
- [Architecture](#-architecture)
- [Repository layout](#repository-layout)
- [Getting started](#-getting-started)
- [The six things that make it correct](#-the-six-things-that-make-it-correct)
- [API reference](#-api-reference)
- [Testing](#-testing)
- [Command reference](#-command-reference)
- [Deploy to Vercel](#-deploy-to-vercel)
- [Build the APK](#-build-the-apk)
- [Authentication — how it works](#-authentication--how-it-works)
  - [The one idea that makes it work](#-the-one-idea-that-makes-it-work)
  - [The request lifecycle](#-the-request-lifecycle)
  - [What changed, file by file](#-what-changed-file-by-file)
  - [The database change](#-the-database-change)
  - [First sign-in claims your history](#-first-sign-in-claims-your-history)
  - [The two bugs that cost real time](#-the-two-bugs-that-cost-real-time)
  - [Verified live](#-verified-live)
  - [APK releases](#-apk-releases)
- [Roadmap — beyond that](#-roadmap--beyond-that)

---

## 📱 What it does

```
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  🏠 HOME                     │        │  🏃 LIVE RUN                 │
│                              │        │                              │
│  Today      8.92 km          │        │        00:23:41              │
│  Time       52:15            │        │        3.82 km               │
│  Pace       5:51 /km         │        │                              │
│  Calories   634 kcal         │        │  PACE NOW   SPEED NOW  CLIMB │
│                              │        │  6:12/km    9.68      12 m   │
│  THIS WEEK   28.4 km         │        │                              │
│  ALL TIME   126.7 km         │        │ ┌──────────────────────────┐ │
│                              │        │ │   ══════╲                │ │
│  WEEKLY DISTANCE             │        │ │          ╲──── 🏃       │ │
│   ┃    ┌──┐ ┌──┐ ┌──┐        │        │ │   live map, follows you  │ │
│   ┃ ┌──┤  │ │  │ │  │ ┌──┐   │        │ └──────────────────────────┘ │
│   ┴ ┴  ┴──┴─┴──┴─┴──┴─┴──┴   │        │                              │
│    Fri Sat Sun Mon Tue Wed    │        │    ⏸ PAUSE      ■ STOP       │
│                              │        └──────────────────────────────┘
│  🔥 7 day streak             │
└──────────────────────────────┘
```

| Screen | What you get |
|---|---|
| 🏠 **Home** | Today / week / month / all-time totals, streak, weekly bar chart |
| 🏃 **Live Run** | GPS tracking, live map, stopwatch, pace & speed that read **zero when you stop** |
| 📚 **History** | Every run, newest first — tap for the full route and splits |
| 📄 **Run detail** | Route polyline, 6 metrics, per-kilometre split table, delete |
| 📈 **Statistics** | 7-day and 4-week charts, effort totals |
| 🏆 **Records** | Longest run, fastest 1 km, best week/month, streak dots, badges |

---

## 🔁 How it works

### One run, start to finish

```
 📱 PHONE                                  🖥️ API                    🗄️ NEON
 ────────                                  ──────                    ──────

[START]
   ├─ request location permission
   ├─ clock = now                        ──────────────────────────────────
   └─ Location.watchPositionAsync()           (nothing sent yet)
            │
            │  every 2 s a fix arrives:
            │  { lat, lon, time, altitude, speed, accuracy }
            ▼
      ┌─────────────┐
      │ appendPoint │──► accuracy > 30 m?      ──► discard
      └─────────────┘──► moved < 2 m?          ──► discard (jitter)
            │           new segment?           ──► re-anchor, +0 km
            │           implied > 12 m/s?      ──► discard (teleport)
            │           chip < 1 m/s?          ──► discard (lying still)
            ▼
      distance += haversine(last → now)

      ┌──────────────────────────────────────────┐
      │ 00:12:41      1.284 km                   │  redrawn every tick
      │ PACE NOW 6:12/km   SPEED NOW 9.67 km/h   │
      │ ┌──────────────────────────────────────┐ │
      │ │   ════════╲                         │ │  polyline grows
      │ │            ╲──── 🏃  camera follows  │ │
      │ └──────────────────────────────────────┘ │
      └──────────────────────────────────────────┘

[PAUSE]  →  clock stops, segment++   (the walk to your car is invisible)
[RESUME] →  clock restarts, segment++

[STOP]
   ├─ freeze the clock  (elapsed = now − started − paused)
   ├─ POST /runs  { points[], durationSeconds }
   └──────────────────────────►  validate (zod)
                                  computeRouteStats()   ← server recomputes
                                  computeSplits()       ← per-km slices
                                  caloriesFor()         ← MET × weight
                                       │
                                       ▼
                                INSERT runs
                                INSERT route_points
                                INSERT run_splits
                                       │
                                       ▼
                                 "Run complete 🎉"
```

**The key idea:** the phone uploads *raw GPS points + moving time*. The **server** is
the only place that decides the final numbers — so iOS and Android can never
disagree, and the database password never ships inside an app binary.

### Where each screen gets its data

| Screen | Endpoint | Returns |
|---|---|---|
| 🏠 Home | `GET /stats/dashboard` | today / week / month totals + streak |
| 🏃 Live Run | *(none — everything is local)* | GPS + clock only |
| 📚 History | `GET /runs` | list of saved runs |
| 📄 Detail | `GET /runs/:id` | route polyline + per-km splits |
| 📈 Stats | `GET /stats/chart?days=7` | bar-chart buckets |
| 🏆 Records | `GET /stats/records` | longest run, fastest km, best week |

Only the Live Run screen talks to no one — until you press **STOP**.

---

## 🧰 Tech stack

| Layer | Choice | Why |
|---|---|---|
| App shell | **Expo SDK 57** + **Expo Router** | file-based routing, typed routes |
| Language | **TypeScript** (strict) everywhere | `tsc --noEmit` is green in both projects |
| Maps | **MapLibre RN** + **OpenFreeMap** | free vector tiles — no API key, no account, no usage cap |
| Location | **expo-location** + **expo-task-manager** | foreground *and* background GPS |
| API | **Express 5** | minimal, no framework lock-in |
| ORM | **Drizzle ORM** | SQL-first, generates real migrations |
| Database | **Neon PostgreSQL** | serverless Postgres + `neon-http` (no pool to leak) |
| Validation | **zod** | one schema for every request body |
| Lint | **eslint-config-expo** | 0 errors, 0 warnings |
| Hosting | **Vercel** | API deployment |
| Build | **local Gradle** (Android SDK) | APK without an Expo account |

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  mobile/   Expo app (Expo Router + TypeScript)                       │
│                                                                      │
│   ┌───────────────┐   raw GPS points    ┌──────────────────────┐     │
│   │ useRunTracker │ ──────────────────► │  Live Run screen     │     │
│   │  · watch GPS  │                     │  · stopwatch         │     │
│   │  · stopwatch  │                     │  · distance / pace   │     │
│   │  · segments   │                     │  · live map          │     │
│   └───────┬───────┘                     └──────────────────────┘     │
│           │  POST /runs  { points[], durationSeconds }                │
└───────────┼──────────────────────────────────────────────────────────┘
            │  HTTPS / JSON
┌───────────▼──────────────────────────────────────────────────────────┐
│  api/   Express + Drizzle ORM                                        │
│                                                                      │
│   validate (zod) ──► computeRouteStats ──► computeSplits              │
│                            │                    │                    │
│                            ▼                    ▼                    │
│                      runs  +  route_points  +  run_splits            │
└───────────┬──────────────────────────────────────────────────────────┘
            │  neon-http (one HTTPS round trip per query)
┌───────────▼──────────────────────────────────────────────────────────┐
│  Neon PostgreSQL                                                     │
└──────────────────────────────────────────────────────────────────────┘
```

### Data model

```
profile                    runs                       route_points
┌────────────────────┐     ┌────────────────────┐     ┌────────────────────┐
│ id            uuid │     │ id            uuid  │     │ id          bigserial
│ user_id       text │     │ user_id       text  │     │ run_id        uuid │ ─┐
│ display_name  text │     │ status  run_status  │ ┌──►│ seq           int  │ │
│ weight_kg  float8  │     │ started_at timestamptz   │ segment       int  │ │
│ stride_meters fl8  │     │ ended_at   timestamptz   │ latitude   float8  │ │
│ created_at     tz  │     │ duration_s     int  │◄─ moving time        │ │
└───────┬────────────┘     │ distance_m  float8  │     │ longitude  float8  │ │
        │                  │ avg_speed   float8  │     │ altitude   float8  │ │
        │                  │ max_speed   float8  │     │ speed      float8  │ │
        │                  │ avg_pace_s     int  │     │ accuracy   float8  │ │
        │                  │ calories    float8  │     │ recorded_at    tz  │ │
        │                  │ elev_gain   float8  │     └───────┬────────────┘
        │                  │ steps           int  │             │ ON DELETE CASCADE
        │                  │ note           text  │             │
        │ used for         └───────┬──────────────┘             │
        └── calories               │ 1:n                        │
                          ┌────────▼─────────────┐             │
                          │     run_splits      │◄────────────┘
                          │ run_id / index      │   1-based km number
                          │ distance / duration │
                          │ pace / elevation    │
                          └─────────────────────┘

        ┌──────────────────────────────────────────────────────┐
        │ user_id (text) on runs / profile / goals             │
        │ NULL = written before auth existed → claimable once  │
        └──────────────────────────────────────────────────────┘
```

**The important design decision:** store the raw GPS breadcrumb, *then* derive
everything. If you only store `"8.42 km"` you can never redraw the route or
recompute pace after changing your calorie formula.

### Repository layout

```
runtrack/
├── README.md
├── api/                          # single Vercel function entry
│   └── index.ts                   # re-exports the Express app
├── server/                        # Node + Express + Drizzle + Neon
│   ├── drizzle/                  # generated SQL migrations (committed)
│   ├── scripts/                  # seed, smoke, segment tests
│   └── src/
│       ├── db/                   # client · schema · migrate
│       ├── lib/                  # geo · metrics · stats
│       └── routes/               # runs · stats · profile
└── mobile/                       # Expo app
    └── src/
        ├── app/                  # ← routes (Expo Router)
        │   ├── (tabs)/           #   Home · Run · History · Stats
        │   ├── run/[id].tsx      #   run summary
        │   └── records.tsx       #   PRs + streak + badges
        ├── api/                  # typed fetch client
        ├── components/           # Screen · StatCard · BarChart · RouteMap
        ├── hooks/                # ⭐ useRunTracker · useAsync
        └── lib/                  # geo · formatting · dark map style
```

> **Rule of thumb:** anything under `src/app` is a screen. Everything else is
> plain code you can import anywhere.

---

## 🚀 Getting started

### 1 · Neon database

Create a project at [neon.tech](https://neon.tech) and copy the connection string:

```bash
# api/.env          (chmod 600 — never committed)
DATABASE_URL=postgresql://user:pass@ep-xxxx.aws.neon.tech/neondb?sslmode=require
PORT=4000
CORS_ORIGIN=*
```

### 2 · API

```bash
cd server
npm install
npm run db:generate     # schema.ts  →  drizzle/*.sql
npm run db:migrate      # apply to Neon (safe to re-run)
npm run dev             # http://localhost:4000
npm run seed            # 18 demo runs so the dashboard has something to show
```

```
🏃 RunTrack API listening on http://localhost:4000
   health   GET  /health
   runs     POST /runs, GET /runs, GET /runs/:id
   stats    GET  /stats/dashboard | /stats/chart | /stats/records
   profile  GET  /profile, PUT /profile
```

### 3 · Mobile

```bash
cd mobile
npm install

# the phone must reach your laptop over LAN — localhost resolves to the phone
echo "EXPO_PUBLIC_API_URL=http://<YOUR_LAN_IP>:4000" > .env

npm start               # Metro on port 8083, scan the QR with Expo Go
```

> **Firewall:** your phone must be able to reach the API.
> `sudo ufw allow from <lan-subnet> to any port 4000 proto tcp`

### 4 · Project scripts

| Where | Command | Does |
|---|---|---|
| `server` | `npm run dev` | start the API with reload |
| `server` | `npm run db:migrate` | apply migrations to Neon |
| `server` | `npm run typecheck` | `tsc --noEmit` |
| `mobile` | `npm start` | Metro on port **8083** |
| `mobile` | `npm test` | all four test suites |
| `mobile` | `npm run typecheck` / `npm run lint` | static checks |

---

## 🎯 The six things that make it correct

### 1 · Haversine distance

```
        ┌─── c = 2 · asin( √h )
        │    h = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)
        │
   A ●────────● B        d = R · c        (R = 6 371 008.8 m)
```

~0.5 % error — a few metres per kilometre, far better than GPS itself.

### 2 · A stopwatch that cannot drift

```ts
elapsed = now − startedAt − pausedDuration
```

Not `setInterval(() => s => s + 1)`. If the UI freezes for 3 s the clock is
still correct, because it is **derived from timestamps**, never incremented.

### 3 · Pause = new segment

```
 segment 0              PAUSE              segment 1
 ●─●─●─●   ·  ·  ·  ·  ·  ·  ·   ●─●─●─●
    1.8 km    (400 m gap)           1.8 km

 naive   = 1.8 + 0.4 + 1.8 = 4.0 km  ✗
 segmented = 1.8       + 1.8 = 3.6 km  ✓
```

Distance is **only ever summed between two points of the same segment**, so
the walk back to your car never becomes kilometres.

### 4 · Filtering the four ways GPS lies

| Guard | Value | Catches |
|---|---|---|
| accuracy | `> 30 m` | urban canyon, no sky view |
| min step | `< 2 m` | a phone twitching while you stand still |
| max speed | `> 12 m/s` | multipath teleport (43 km/h = impossible for a human) |
| still | chip `< 1 m/s` **or** implied `< 1 m/s` | phone left on a table |

The still-guard uses **two independent signals** because they fail differently:
Android sends `speed = 0.0` whenever the provider has no speed data (chip rule
goes quiet) while a phone parked indoors only ticks every 7–10 s (tape rule
catches it).

```
Measured against real GPS recorded on a phone lying on a bed:

  naive hop sum      6.2 m     ← what a naïve tracker records
  distance counted   0.0 m     ← what RunTrack records
  live SPEED NOW     0.00 km/h
  live PACE NOW      --:-- /km
```

### 5 · Timezone-correct streaks

`?tz=Asia/Kolkata` → "today" starts at **local** midnight, not UTC. Streaks
walk backwards in *calendar-day-key* space, never in raw milliseconds, so a DST
change cannot desync them.

---

### 6 · Background location — the bug that cost 19 minutes

A field test ran **20 minutes in a park** and recorded **0.06 km**. The
database said exactly why:

```
run started          13:18
GPS fixes received   13:18:18 → 13:18:37        ← 19 SECONDS
points stored        9
distance             59.3 m                     ← 3.12 m/s = 11.2 km/h ✓
then                 nothing, for 19 more minutes
```

The measurements were *correct* — 11.2 km/h is a proper running pace, and the
5-minute **walk** (93 points, 360 m) worked perfectly. So the filters were
blameless. The **stream simply stopped**.

`Location.watchPositionAsync` is a **foreground-only** source. The moment the
screen locks or React Navigation blurs the tab — which is precisely what
happens when you start running — Android stops delivering fixes. The clock is
a timestamp, so it kept ticking; the distance came from points that never
arrived.

```
          before                                after
 ┌──────────────────────┐            ┌──────────────────────────┐
 │ watchPositionAsync   │            │ startLocationUpdatesAsync│
 │ foreground only      │            │ + TaskManager task       │
 │ dies on screen-off   │            │ survives screen-off,     │
 │                      │            │ app blur and unmount     │
 └──────────┬───────────┘            └──────────┬───────────────┘
            │                                   │
            ▼                                   ▼
        routeRef                      ┌─────────────────────┐
     (the only store)                 │ AsyncStorage        │
                                      │ polled ~1×/s, merged│
                                      └─────────────────────┘
```

Two sources, **two different stores** — the task owns AsyncStorage, the UI
owns `routeRef` — so there is no read-modify-write race. Merging is a read,
deduped by timestamp (and by the < 2 m step filter as a second line of
defence).

Which segment a merged fix belongs to is decided by the clock:

```
  ──[ seg 0 ]────✗ PAUSE ✂────[ seg 1 ]────✗ PAUSE ✂────[ seg 2 ]──
     start          end          start         end          start
                       ▲                      ▲
                       └── rangesRef stamps every fix with its segment
```

**What you must grant:** the app asks for *Allow all the time* on START.
Without it the run screen shows:

> ⚠ Background location is off — lock the screen and the GPS stops.

---

## 🔌 API reference

Base URL `http://localhost:4000`

| Method | Path | Query | Returns |
|---|---|---|---|
| `GET` | `/health` | — | `{ ok, uptimeSeconds, runs }` |
| `POST` | `/runs` | — | `{ run, splits, pointsSaved }` |
| `GET` | `/runs` | `limit`, `offset` | `Run[]` |
| `GET` | `/runs/:id` | — | `{ run, points[], splits[] }` |
| `DELETE` | `/runs/:id` | — | `{ ok }` |
| `DELETE` | `/runs` | — | `{ ok, deleted }` — clear all history |
| `GET` | `/stats/dashboard` | `tz` | totals + `streakDays` |
| `GET` | `/stats/chart` | `days`, `tz` | bar-chart buckets |
| `GET` | `/stats/records` | `tz` | personal records |
| `GET` / `PUT` | `/profile` | — | weight & stride (for calories) |

**`POST /runs` point shape**

```jsonc
{
  "lat": 25.5941,          // required  −90…90
  "lon": 85.1376,          // required  −180…180
  "time": 1791454800000,   // required  epoch ms
  "altitude": 53.2,        // optional  metres
  "speed": 2.68,           // optional  m/s
  "accuracy": 6.1,         // optional  metres
  "segment": 0             // optional  bumped on every RESUME
}
```

---

## 🧪 Testing

Four suites, no test framework — plain `tsx` scripts with real assertions.

```bash
cd mobile
npm test                   # runs all four
```

| Suite | Proves |
|---|---|
| `test:scenarios` | stationary → 0 m · shaking → 0 m · pocket running ±1.6 % · GPS glitch −0.1 % |
| `test:bed` | replays **your phone's real GPS from a bed** → counts 0.0 m |
| `test:walk` | house walk is not invented · park laps within 5 % · slow outdoor walk counted |
| `test:live` | polyline grows every tick · camera follows · pause gap excluded |

Plus `api/scripts/smoke.ts` — a full `POST → GET → DELETE` round trip.

**Static checks**

```
$ cd server && npx tsc --noEmit        → exit 0
$ cd mobile && npx tsc --noEmit        → exit 0
$ cd mobile && eslint src --max-warnings=0   → exit 0
$ npx expo-doctor                      → 21/21 checks passed
$ npx expo export --platform android   → bundles
```

---

## 🛠️ Command reference

Everything, in the order you actually need it.

### Clone & install

```bash
git clone https://github.com/amiitdev/runtrack.git
cd runtrack

npm run install:api       # = npm --prefix server install
npm run install:mobile    # = npm --prefix mobile install
```

### Database (Neon)

```bash
cd server

npm run db:generate       # schema.ts  →  drizzle/*.sql   (after editing schema)
npm run db:migrate        # apply migrations to Neon — safe to re-run
npm run db:studio         # open the Drizzle browser UI
```

### Run everything locally

```bash
# terminal 1 — API on http://localhost:4000
npm run api

# terminal 2 — Metro on http://localhost:8083, scan the QR with Expo Go
npm run mobile
```

### Quality gates — run these before every push

```bash
cd server && npm run typecheck          # tsc --noEmit
cd mobile && npm run typecheck          # tsc --noEmit
cd mobile && npm run lint               # eslint, 0 warnings allowed
cd mobile && npm test                   # 4 GPS test suites
cd mobile && npx expo-doctor            # 21 dependency/config checks
cd mobile && npx expo export -p android # prove it bundles
```

### Seed & reset data

```bash
cd server
npx tsx scripts/seed.ts                 # 18 demo runs through the real POST /runs

# wipe all history (profile is kept)
curl -X DELETE https://runtrack-live-amit-kumars-projects-8bcd1587.vercel.app/runs
```

### Test scripts (`cd server`)

| Script | What it proves |
|---|---|
| `npx tsx scripts/seg-test.ts` | a 5 km PAUSE gap is not counted |
| `npx tsx scripts/smoke.ts` | full `POST → GET → DELETE` round trip |
| `cd mobile && npm run test:scenarios` | stationary → 0 m, running → ±1.6 % |
| `cd mobile && npm run test:bed` | replays **your real bed GPS** → 0.0 m |
| `cd mobile && npm run test:walk` | house walk not invented, park laps within 5 % |
| `cd mobile && npm run test:live` | polyline grows, camera follows, resume works |

### Ship a change

```bash
git add -A
git commit -m "what changed and why"
git push origin main        # → Vercel rebuilds (if the repo is linked)
```

---

## 🚢 Deploy to Vercel

Step by step, exactly as it was done here.

### Step 1 — put the code on GitHub

```bash
gh repo create runtrack --public --source . --remote origin --push
# → https://github.com/amiitdev/runtrack
```

Check no secrets travel with it first:

```bash
git ls-files | grep -E "\.env$"      # must print nothing
```

### Step 2 — make the repo Vercel-shaped (4 files)

```
runtrack/
├── api/                      ← Vercel ONLY looks here for functions
│   ├── package.json          ← { "type": "module" }
│   └── index.ts              ← the single function (re-exports the app)
├── server/                   ← the actual Express + Drizzle + Neon code
├── public/index.html         ← static output (Vercel demands one)
├── package.json              ← root scripts + typescript
└── vercel.json               ← install/build/rewrite config
```

**`api/index.ts`** — the entire serverless surface:

```ts
export { default } from '../server/src/app.js';
```

**`vercel.json`**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "installCommand": "npm install && npm --prefix server install",
  "buildCommand": "npm --prefix server run typecheck",
  "outputDirectory": "public",
  "rewrites": [{ "source": "/(.*)", "destination": "/api/index" }]
}
```

**`server/src/server.ts`** stays the local listener; **`server/src/app.ts`**
exports the Express app so both local and Vercel use the same routes.

### Step 3 — create the project and link the repo

```
Vercel dashboard → Add New → Project → import github.com/amiitdev/runtrack
```
…or from a terminal with the Vercel CLI:

```bash
vercel login
vercel link                       # attaches this folder to the project
vercel --prod                     # deploy to production
```

### Step 4 — environment variables

Project → **Settings → Environment Variables** → add both, targets
**Production** + **Preview**:

| Key | Type | Value |
|---|---|---|
| `DATABASE_URL` | sensitive | your Neon connection string |
| `CORS_ORIGIN` | plain | `*` |
| `CLERK_SECRET_KEY` | encrypted | from the Clerk dashboard → API Keys |
| `CLERK_PUBLISHABLE_KEY` | plain | same page (`pk_test_…`) |

Then redeploy. Without `DATABASE_URL` the function throws at import time,
because `server/src/db/client.ts` refuses to start with no connection string.
Without `CLERK_SECRET_KEY`, `clerkMiddleware()` cannot verify session tokens
and every authenticated route returns **401** — which is the correct
behaviour, not a bug.

### The final layout — one project

```
github.com/amiitdev/runtrack  ──push──►  Vercel project "runtrack-live"
                                              │
                                              ├─ git-linked (auto-deploys)
                                              ├─ all four env vars
                                              └─ ✅ 200 /health · 401 /runs
                                                     ▲
        mobile/.env  EXPO_PUBLIC_API_URL  ───────────┘
```

Earlier there were three projects (`runtrack`, `runtrack-api`, `runtrack-live`)
and the GitHub link sat on the broken one. Vercel's connect-repo **reuses
whichever project already owns the link**, so the only way to move it is to
delete that project first — which is what was done.

### Step 5 — verify

```bash
$ curl https://runtrack-live-amit-kumars-projects-8bcd1587.vercel.app/health
{"ok":true,"service":"runtrack-api","uptimeSeconds":26,"runs":0}

$ curl https://runtrack-live-amit-kumars-projects-8bcd1587.vercel.app/stats/dashboard?tz=Asia/Kolkata
{"today":{"distanceMeters":0,...},"streakDays":0,"totalRuns":0}
```

A `POST /runs` here writes straight to Neon — same code path as your phone.

### The four walls we hit

Every one of these was a real failure during the first deploy:

| # | Error | What it really meant | Fix |
|---|---|---|---|
| 1 | `STATIC_BUILD_NO_OUT_DIR` | no `outputDirectory` was set and no `public/` existed | added `public/index.html` (a proper API landing page) |
| 2 | `exceeded_serverless_functions_per_deployment` | Vercel makes **one Lambda per `.ts` under `/api`**, we had 16 — **Hobby plan caps at 12** | moved the whole app to `/server`, left **one** file in `/api` |
| 3 | `ERR_REQUIRE_ESM` | the entry was compiled as CommonJS but the app is ESM | `api/package.json` → `{ "type": "module" }` |
| 4 | `302 → vercel.com/sso-api` | Vercel Authentication was on by default | project → Settings → Deployment Protection → disable |

> **Rule to remember:** `/api` is not your source folder. It is Vercel's
> function directory. Source code belongs somewhere else.

```
  /api                     /server
  ┌──────────────────┐     ┌──────────────────────────┐
  │ index.ts   1 fn  │ ──► │ app.ts   Express routes   │
  │ package.json     │     │ db/      Neon + Drizzle   │
  └──────────────────┘     │ lib/     geo, metrics     │
         ▲                 └──────────────────────────┘
         │ only this becomes a Lambda
         └── 1 function  ✅   (limit is 12)
```

---

## 📱 Build the APK

Two ways. We used **Method A** because it needs no Expo account.

### Method A — local Gradle ✅ used here

Needs: **Java 21** + **Android SDK** (both already on this machine).

```bash
cd mobile

# 1. generate android/ from app.json (permissions, icons, package id)
npx expo prebuild --platform android --no-install

# 2. build the release APK   (~16 min cold, ~12 s when only ABI changes)
cd android
./gradlew assembleRelease

# 3. the artifact
ls -lh app/build/outputs/apk/release/app-release.apk
```

Real output:

```
BUILD SUCCESSFUL in 7m 4s          # cold build with MapLibre
446 actionable tasks: 418 executed, 28 up-to-date
-rw-rw-r-- 128M  .../app-release.apk

$ ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
BUILD SUCCESSFUL in 12s            # repackaging only
-rw-rw-r--  51M  .../app-release.apk
```

Verify it with the Android SDK:

```bash
AAPT=$(ls -d ~/Android/Sdk/build-tools/*/aapt2 | tail -1)
$AAPT dump badging dist/RunTrack-1.0.2.apk | head -3
```
```
package: name='dev.amit.runtrack' versionName='1.0.0'
application-label:'RunTrack'
native-code: 'arm64-v8a'
```

**Install it:** copy the `.apk` to the phone and open it, or with a USB/adb device:

```bash
adb install -r dist/RunTrack-1.0.2.apk
```

> **Why 51 MB and not 128 MB?** MapLibre ships native libraries per CPU
> architecture, and the default ships four — including `x86` / `x86_64`,
> which only exist on emulators. `android/gradle.properties` now pins
> `reactNativeArchitectures=arm64-v8a`, which covers every phone since ~2017
> and more than halves the download. Change that line if you need
> `armeabi-v7a` too (very old devices).

### 🗺️ Why MapLibre + OpenFreeMap instead of Google Maps

The first build closed a couple of seconds after pressing START:

```
tap START
   │  points = 0  →  <View> placeholder              ← no crash
   ▼
~2–6 s later, first GPS fix
   │  points = 1  →  <MapView> mounts                ← Google Maps SDK
   ▼                                                 finds no API key →
   💥 native abort (a Java throw JS cannot catch)  →  app closes
```

The manifest said it plainly — no `com.google.android.geo.API_KEY`, and no
`android.config.googleMaps.apiKey` in `app.json`. Expo Go hides this because
Expo's own APK ships a key; a standalone APK does not.

Instead of making every clone of this repo create a Google Cloud project,
enable billing and manage a usage cap, the app renders with:

| | |
|---|---|
| **Renderer** | [`@maplibre/maplibre-react-native`](https://maplibre.org/maplibre-react-native/) — open-source MapLibre Native |
| **Tiles** | [OpenFreeMap](https://openfreemap.org) — free vector tiles, **no key, no account, no usage cap** |
| **Style** | `https://tiles.openfreemap.org/styles/dark` — background `rgb(12,12,12)`, matches the UI |

```tsx
<Map mapStyle="https://tiles.openfreemap.org/styles/dark">
  <Camera bounds={[west, south, east, north]} />
  <GeoJSONSource id="route" data={lineFeature}>
    <Layer
      type="line"
      layout={{ "line-cap": "round", "line-join": "round" }}
      paint={{ "line-color": "#22D3EE", "line-width": 5 }}
    />
  </GeoJSONSource>
</Map>
```

Coordinates are `[longitude, latitude]` in MapLibre — the **reverse** of the
`{ latitude, longitude }` objects the tracker produces, which is the one
thing to watch when editing `RouteMap.tsx`.

**Requirements**

- MapLibre RN v11 is **New-Architecture only** (Expo SDK 57 defaults to it ✓)
- It is **not part of Expo Go** — you need a standalone build, which is
  exactly what `npx expo prebuild` + `./gradlew assembleRelease` produce
- Android API ≥ 23

> Prefer Google Maps anyway? Add `android.config.googleMaps.apiKey` to
> `app.json`, run `npx expo prebuild -p android` and rebuild — but you would
> be taking on a key, a billing account and a usage cap for no real benefit.
> The `RouteMap` component would need swapping back; `react-native-maps` was
> removed from the project.

### Method B — EAS Build (Expo's cloud)

Uses Expo's build machines, so it needs an Expo account (`eas login`).

```bash
# one-time
npm install -g eas-cli        # or always use: npx eas-cli …
eas login                     # or: npx eas-cli login
eas init                      # link mobile/ to an Expo project
eas build:configure           # writes mobile/eas.json
```

**`mobile/eas.json`** — the bit that makes it emit an APK:

```json
{
  "cli": { "version": ">= 24.0.0" },
  "build": {
    "preview": {
      "android": { "buildType": "apk" },
      "distribution": "internal"
    },
    "production": {
      "android": { "buildType": "app-bundle" }
    }
  },
  "submit": { "production": {} }
}
```

```bash
# APK from Expo's cloud  (~10–15 min, runs in your browser)
npx eas-cli build -p android --profile preview

# APK built on THIS machine instead (no cloud queue)
npx eas-cli build -p android --profile preview --local

# .aab for the Play Store
npx eas-cli build -p android --profile production

# upload a finished build to Play
npx eas-cli submit -p android --latest
```

| | Method A — local Gradle | Method B — EAS |
|---|---|---|
| Expo account | **not needed** | needed (`eas login`) |
| Where it builds | your laptop | Expo's cloud (`--local` = yours) |
| First run | ~16 min (Gradle download) | ~10–15 min queue + build |
| Output | `app-release.apk` | link to `.apk` in the dashboard |
| Works offline | ✅ | ❌ |

### EAS status on this machine

```bash
$ which eas                       # not installed globally
$ npx eas-cli --version
eas-cli/24.12.0 linux-x64 node-v24.19.0

$ npx eas-cli whoami
rocks.amit19@gmail.com
Accounts:
• amit192400 (Role: Owner)
• amit192400s-organization (Role: Owner)
```

So **EAS is ready to use without installing anything** — just prefix with
`npx eas-cli`. The project is not `eas init`'d yet; run `eas init` inside
`mobile/` the first time you want a cloud build.

## 🔐 Authentication — how it works

Sign in with Google. Your runs become yours. Nobody else can read them.

This section is the long version: the architecture, every file that changed,
why Clerk and Neon never touch each other, and the two bugs that ate an
afternoon.

---

### 🔑 The one idea that makes it work

**Clerk owns identity. Neon owns data. They are joined by exactly one string.**

```
┌─────────────────────┐                      ┌──────────────────────────┐
│      Clerk          │                      │     Neon Postgres        │
│  (authentication)   │                      │      (your data)         │
├─────────────────────┤                      ├──────────────────────────┤
│ user_2f8K…9x        │ ──── user_id ──────► │ runs.user_id             │
│ amit@gmail.com      │       (the only      │ profile.user_id          │
│ Google OAuth        │        shared field) │ goals.user_id            │
│ session tokens      │                      │                          │
│ password / email    │  ◄── never sent ───  │  ← Clerk never sees a    │
│ profile photo       │                      │     single GPS point     │
└─────────────────────┘                      └──────────────────────────┘
```

Clerk never receives your runs. Neon never receives your password. The only
thing that crosses the boundary is `user_2f8K…9x` — an opaque string Clerk
hands you and Postgres stores in a `text` column.

That separation is why this is safe *and* why it was cheap to build: the API
needed **one extra `WHERE` clause**, not a user table, a password hasher, a
token signer, or a session store.

#### Why Clerk and not the self-hosted plan the roadmap described

The original plan was argon2 + a hand-rolled JWT. Clerk was chosen instead:

| | Self-hosted JWT | Clerk (what shipped) |
|---|---|---|
| Passwords | you hash, store, reset, rate-limit | Clerk |
| Google OAuth | you build the whole redirect dance | one call: `startSSOFlow` |
| Session refresh | you implement refresh tokens | Clerk |
| Sign-in UI | you build and polish it | prebuilt + themed |
| Token verification | you verify a JWT signature | `clerkMiddleware()` |
| Your attack surface | passwords, tokens, OAuth bugs | a verified session token |

You still wrote the interesting part — **row-level scoping** — which is the
part that actually protects the data.

---

### 🔁 The request lifecycle

Trace one authenticated call end to end.

```
  PHONE (Expo)                    NEON (Postgres)
  ────────────                    ────────────────
  1. Sign in with Google
         │
         ▼
     Clerk SDK  ────────────►  Google OAuth
         │
         │  returns a session token (a short-lived JWT,
         │  signed by Clerk, containing sub=user_2f8K…9x)
         ▼
  2. cached in expo-secure-store   ← Keychain / Keystore, not AsyncStorage
         │
         ▼
  3. every fetch() in api/client.ts
         │
         │   Authorization: Bearer <session token>
         │   Content-Type: application/json
         ▼
  ──────────────────────────────────────────────────────────
  4. Vercel:  clerkMiddleware()
                │  fetches Clerk's JWKS, verifies the signature,
                │  checks expiry, attaches the result to the request
                ▼
              requireAuth()
                │  getAuth(req).userId  ──►  'user_2f8K…9x'
                │  no userId  ──►  401 {"error":"Unauthorized"}
                ▼
  5. route handler
                │
                │   db.select().from(runs)
                │     .where(eq(runs.userId, 'user_2f8K…9x'))
                ▼
  6. Neon returns ONLY that user's rows
```

**Three layers, three jobs:**

| Layer | Code | Job |
|---|---|---|
| Client | `@clerk/expo` | get a session token, keep it fresh |
| Server | `@clerk/express` | verify that token is real and not expired |
| Database | `runs.user_id` | make sure one user's rows can't reach another |

Nothing in layer 1 is trusted. A token you can *present* is not a token you
can *forge* — layer 2 proves it against Clerk's public keys before layer 3
ever runs a query.

---

### 🧱 What changed, file by file

Every file touched while adding auth, in the order it matters.

#### Mobile

| File | What | Why |
|---|---|---|
| `mobile/package.json` | `+ @clerk/expo` | the client SDK |
| `mobile/.env` | `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`<br>`EXPO_PUBLIC_API_URL` | **inlined at build time** — see the bugs section |
| `mobile/src/lib/clerk.ts` | publishable key + `tokenCache` | throws at boot if the key is missing, so a bad build fails loudly instead of silently 401-ing |
| `mobile/src/lib/apiAuth.ts` | `registerTokenGetter()` / `getAuthToken()` | a plain module cannot call a React hook, so the root layout registers Clerk's `getToken` once and the API client calls it |
| `mobile/src/app/_layout.tsx` | `<ClerkProvider>` + `<AuthGate>` | wraps the tree; the gate renders the app, the sign-in screen, or a spinner — exactly one of the three |
| `mobile/src/components/SignInScreen.tsx` | **Continue with Google** | `startSSOFlow({ strategy: 'oauth_google' })` |
| `mobile/src/app/sso-callback.tsx` | deep-link landing | where Chrome sends you back (`runtrack://`) |
| `mobile/src/components/MigrationPrompt.tsx` | one-shot claim sheet | appears once, after the first sign-in |
| `mobile/src/api/client.ts` | attach `Authorization` | **one place, every request** — no chance of a route forgetting it |

#### Server

| File | What | Why |
|---|---|---|
| `server/package.json` | `+ @clerk/express` | |
| `server/src/app.ts` | `app.use(clerkMiddleware())` | mounts verification globally — a route cannot accidentally skip it |
| `server/src/lib/auth.ts` | `requireAuth` + `userId(res)` | the 401 gate and the typed accessor |
| `server/src/routes/migration.ts` | `GET /status`, `POST /claim` | the first-sign-in migration |
| `server/src/db/schema.ts` | `userId` on `runs`, `profile`, `goals` | nullable, with indexes |
| every `routes/*.ts` | `.where(eq(runs.userId, …))` | the actual isolation |

#### The two functions that carry the whole system

```ts
// server/src/lib/auth.ts — 401 unless clerkMiddleware verified a session
export const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.locals.userId = userId;
  next();
};
```

```ts
// mobile/src/lib/apiAuth.ts — how a plain module gets the token
let getTokenFn: (() => Promise<string | null>) | null = null;
export function registerTokenGetter(fn: () => Promise<string | null>) {
  getTokenFn = fn;                       // called once by _layout.tsx
}
export async function getAuthToken(): Promise<string | null> {
  return getTokenFn ? await getTokenFn() : null;
}
```

And the single line in `api/client.ts` that makes every route protected:

```ts
const token = await getAuthToken();
res = await fetch(url, {
  ...init,
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
});
```

---

### 🗄️ The database change

```sql
-- nullable on purpose. More on that below.
alter table runs    add column user_id text;
alter table profile add column user_id text;

create index runs_user_id_idx    on runs    (user_id);
create unique index profile_user_id_idx on profile (user_id);
```

**`text`, not `uuid` and not a foreign key.** Clerk's user id is an opaque
string (`user_2f8K…9x`). It is not a UUID, it is not something Postgres can
validate, and there is no `users` table for a FK to point at. Storing it as
`text` is the honest choice — and it means Clerk owns the identity lifecycle
entirely.

**`nullable`.** Every column had to allow `NULL`, and that is deliberate:
the database already held runs that were written *before* auth existed.
Making the column `NOT NULL` would have forced a decision about those rows
the moment the migration ran. Making it nullable meant the migration was
instant and harmless.

---

### 🧾 First sign-in claims your history

This is the bit that keeps your existing data alive.

Before auth, runs landed in one bucket with no owner — `user_id = NULL`.
The rule: **never delete a run.** Instead, the first account to sign in is
offered them.

```
   first sign-in
        │
        ▼
  GET /migration/status          ← app asks "anything unowned?"
        │
        ├─ unownedRuns: 0  ──►  prompt never appears. You start empty.
        │
        └─ unownedRuns: 6  ──►  MigrationPrompt appears:
                                 "We found 6 runs saved before you signed in.
                                  Link them to your account?"
                                      │
                     ┌────────────────┴────────────────┐
                   Yes                               No later
                     │                                   │
        POST /migration/claim                 rows stay NULL forever
                     │                          (invisible to everyone)
        UPDATE runs SET user_id = 'user_2f8K…9x'
               WHERE user_id IS NULL
                     │
                     └──► 6 runs, 21.85 km, 3876 route points — yours.
                          Idempotent: a second call claims 0.
```

The endpoint, and why it is an `UPDATE` and not a `DELETE`:

```ts
// server/src/routes/migration.ts
const claimedRuns = await db
  .update(runs)
  .set({ userId: uid })
  .where(isNull(runs.userId))          // ← every unowned row, once
  .returning({ id: runs.id });

res.json({ claimedRuns: claimedRuns.length, claimedProfile });
```

The `profile` row gets slightly gentler handling, because the sign-up flow
auto-creates a default one (weight 70 kg, stride 0.78 m). If you already
have a row, the *legacy* row's settings are copied over it rather than
creating a second row you'd never see.

**Later sign-ups get nothing.** If a second account signs in, the prompt
does not appear — those rows are already owned. They see an empty history,
which is correct.

---

### 🐛 The two bugs that cost real time

#### 1 · Google sign-in spun forever

The deep-link landing screen rendered an `ActivityIndicator` **unconditionally**:

```tsx
// before — broken
export default function SSOCallback() {
  return (
    <View style={styles.root}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}
```

When Android kills your process while you are in Chrome — which happens
constantly, and is not a bug in your code — the redirect arrives back with
**no session**. The spinner had no exit condition, so the app hung on it
forever with no way out short of force-stopping it.

```tsx
// after — fixed
const { isLoaded } = useAuth();
if (!isLoaded) return <FullScreenSpinner />;
return <Redirect href="/" />;   // AuthGate then shows app OR sign-in
```

There is no third state. Once Clerk has loaded, bouncing to `/` is always
correct: either you have a session and the app renders, or you don't and the
sign-in screen does.

#### 2 · `EXPO_PUBLIC_*` is baked in at build time

```js
// mobile/.env
EXPO_PUBLIC_API_URL=https://runtrack-live-….vercel.app
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…
```

These look like environment variables. They are not. Metro **inlines them
into the JS bundle** when it compiles, so the string is sitting inside
`index.android.bundle` inside the APK. Changing them on the server, or on
the phone, or in Vercel — does nothing.

```
  .env  ──Metro──►  string literal in the bundle  ──►  APK
                          ▲
                          └── to change the URL you must REBUILD the APK
```

Which is why every URL change is followed by a rebuild, and why shipping
`CLERK_SECRET_KEY` in the app would be catastrophic — and is impossible,
because only `EXPO_PUBLIC_`-prefixed values are inlined, and the secret key
has no such prefix.

---

### ✅ Verified live

Real output against the deployed API:

```bash
$ curl https://runtrack-live-amit-kumars-projects-8bcd1587.vercel.app/health
{"ok":true,"service":"runtrack-api","uptimeSeconds":106,"runs":6}   # 200 · public

$ curl https://runtrack-live-amit-kumars-projects-8bcd1587.vercel.app/runs
{"error":"Unauthorized"}                                             # 401 · as designed

$ curl https://runtrack-live-…/migration/status
{"error":"Unauthorized"}                                             # 401 · as designed
```

And the database, read directly from Neon:

```
runs.user_id column : present (nullable=YES)
runs                : 6 total, 6 owned, 0 unowned (legacy)
distance on file    : 21.85 km over 6 runs since 2026-10-09
route_points        : 3876
profile             : 1 rows, 1 owned
```

`6 owned, 0 unowned` — the claim already ran. Every one of the original runs
now belongs to the account, and no row was deleted to get there.

---

### 📦 APK releases

All builds live on the GitHub Releases page. Grab the latest:

**→ [github.com/amiitdev/runtrack/releases](https://github.com/amiitdev/runtrack/releases)**

| Release | versionName | versionCode | Size | What's in it |
|---|---|---|---|---|
| **[v1.1.0](https://github.com/amiitdev/runtrack/releases/tag/v1.1.0)** · Latest | **1.1.0** | **7** | 53 MB | Auth + the infinite-spinner fix + correct API URL |
| [v1.0.6](https://github.com/amiitdev/runtrack/releases/tag/v1.0.6) | 1.0.6 | 6 | 53 MB | Clerk auth lands — per-user isolation, first-sign-in claim |
| [v1.0.5](https://github.com/amiitdev/runtrack/releases/tag/v1.0.5) | 1.0.5 | 5 | 51 MB | Brand refresh, icon, animated splash. No auth. |
| [v1.0.4](https://github.com/amiitdev/runtrack/releases/tag/v1.0.4) | 1.0.4 | 4 | — | MapLibre + OpenFreeMap, background GPS |

```bash
# install the latest
adb install -r RunTrack-1.1.0.apk
```

**Why every APK is ~51–53 MB.** The build bundles only `arm64-v8a`. MapLibre
ships one native `.so` per ABI — bundling all four pushes the APK past
200 MB for no benefit on a modern phone.

> **v1.0.6 caveat:** that build still contains the infinite-spinner bug on
> the Google redirect screen. Upgrade to v1.1.0 if Google sign-in hangs.

---

## 🔮 Roadmap — beyond that

**V2**

- 🔊 voice announcements — *"You've completed 2 kilometres"*
- 🎯 distance / time goals with a progress ring
- ⚡ pace alerts (slow down / speed up)
- 🌄 elevation graph per run
- 🗺️ route replay — animate the marker along the polyline
- 👟 shoe mileage tracking

**V3**

- ☁️ offline queue: save locally, sync when back online
- ❤️ heart-rate import (HealthKit / Health Connect)
- 🏆 leaderboards, friends, live location sharing

---

## 📚 What this project demonstrates

| Skill | Where it shows up |
|---|---|
| Geospatial maths | `api/src/lib/geo.ts`, `mobile/src/lib/geo.ts` |
| Real-time streaming state | `mobile/src/hooks/useRunTracker.ts` |
| Clock correctness under adverse conditions | timestamp-derived elapsed, not a counter |
| Data modelling | 4 tables, FK cascade, deliberate indexes |
| Migrations as code | Drizzle schema → generated SQL → Neon |
| API design + validation | Express 5 + zod, central error handler |
| Timezone-correct analytics | `startOfLocalDayKey`, streak in day-key space |
| Empirical testing | 4 suites replaying real GPS, incl. your own |
| Mobile UX | dark theme, typed routes, permission flows, maps |
| Engineering hygiene | strict TS, 0-warning ESLint, expo-doctor, exports |
| Auth architecture | Clerk session → `requireAuth` → `WHERE runs.user_id = $1` |
| Zero-downtime migration | nullable `user_id`, first sign-in claims legacy rows |
| OAuth deep links | `runtrack://` scheme, `sso-callback` route, process-death recovery |

---

<div align="made">

**Built by [amiitdev](https://github.com/amiitdev)** · MIT License

</div>
