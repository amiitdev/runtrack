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
- [Repository layout](#-repository-layout)
- [Getting started](#-getting-started)
- [The five things that make it correct](#-the-five-things-that-make-it-correct)
- [API reference](#-api-reference)
- [Testing](#-testing)
- [Deploying](#-deploying)
- [Roadmap — authentication](#-roadmap--authentication)
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
| Maps | **react-native-maps** | native Google (Android) / Apple (iOS) |
| Location | **expo-location** | `watchPositionAsync`, `BestForNavigation` |
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
profile                      runs                        route_points
┌──────────────────┐        ┌───────────────────┐        ┌───────────────────┐
│ id            uuid│        │ id             uuid│        │ id          bigserial
│ display_name  text│        │ status   run_status│   ┌───►│ run_id        uuid│ ─┐
│ weight_kg  float8  │        │ started_at  timestamptz    │ seq           int  │ │
│ stride_meters fl8  │        │ ended_at    timestamptz    │ segment        int  │ │
│ created_at     tz  │        │ duration_s    int  ◄─ moving time        │ │
└──────────────────┘        │ distance_m  float8  │      │ latitude     float8  │ │
        │                   │ avg_speed   float8  │      │ longitude    float8  │ │
        │                   │ max_speed   float8  │      │ altitude     float8  │ │
        │ used for          │ avg_pace_s    int    │      │ speed        float8  │ │
        └── calories         │ calories    float8  │      │ accuracy     float8  │ │
                             │ elev_gain   float8  │      │ recorded_at    tz    │ │
                             │ steps          int  │      └───────────────────┘   │
                             │ note          text  │          ON DELETE CASCADE ◄─┘
                             └─────────┬───────────┘
                                       │ 1:n
                             ┌─────────▼───────────┐
                             │     run_splits      │
                             │ run_id / index      │  1-based km number
                             │ distance / duration │
                             │ pace / elevation    │
                             └─────────────────────┘
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

## 🎯 The five things that make it correct

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

## 🚢 Deploying

| Target | How |
|---|---|
| **GitHub** | `gh repo create amiitdev/runtrack --public --source . --push` |
| **Vercel (API)** | connect the repo, root directory `api`, production env `DATABASE_URL` |
| **APK** | `cd mobile && npx expo run:android --variant release` — local Gradle, **no Expo account** |

### Building an APK from the terminal

```bash
cd mobile
npx expo prebuild --platform android      # generates android/ from app.json
cd android
./gradlew assembleRelease                 # → android/app/build/outputs/apk/release/app-release.apk
```

Native permissions (background location, iOS usage strings) are all declared in
`app.json` — the `android/` folder is generated, never hand-edited.

---

## 🔐 Roadmap — authentication

The current build is **single-user**: every run lands in one bucket. Here is the
plan for `login / signup / logout` so each account sees only its own data.

### Database changes

```sql
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  password_hash text not null,              -- argon2id, never bcrypt in new code
  display_name  text,
  created_at    timestamptz not null default now()
);

-- every run now belongs to somebody
alter table runs add column user_id uuid not null references users(id) on delete cascade;
create index runs_user_started_idx on runs (user_id, started_at desc);
```

`profile` also gains `user_id` (one row per user: weight → calories).

### API changes

```
POST /auth/signup   { email, password, displayName }
POST /auth/login    { email, password }         → { token, user }
POST /auth/logout                                 → client discards the token
GET  /auth/me                                       → current user

+ every /runs and /stats route gains middleware:

   Authorization: Bearer <jwt>
        │
        ▼
   verifyToken()  ──► req.userId  ──►  WHERE runs.user_id = $userId
```

Row-scoping is **one extra WHERE clause**, which is why `user_id` belongs on
`runs` and not in a join table:

```ts
// today
db.select().from(runs).where(eq(runs.status, 'completed'));

// after auth
db.select().from(runs)
  .where(and(eq(runs.userId, req.userId), eq(runs.status, 'completed')));
```

### Mobile changes

```
mobile/src/
├── context/AuthContext.tsx     # user, token, signIn, signUp, signOut
├── lib/storage.ts              # expo-secure-store for the JWT (never AsyncStorage)
├── api/client.ts               # + Authorization header on every request
└── app/
    ├── (auth)/sign-in.tsx
    ├── (auth)/sign-up.tsx
    └── (tabs)/_layout.tsx      # redirect to (auth) when token missing
```

- Store the JWT in **`expo-secure-store`** (Keychain / Keystore), not `AsyncStorage`.
- Attach `Authorization` in `api/client.ts` — one place, every request.
- `expo-router` guards: a root `useEffect` redirects to `/sign-in` when
  `user === null`, so deep links cannot skip the gate.
- **Logout** = delete the token from SecureStore + clear the context. The server
  keeps stateless JWTs; if you later need instant revocation, add a `revoked_at`
  column or switch to short-lived access + refresh tokens.

### Recommended services

| Approach | Best for |
|---|---|
| **Self-hosted (JWT + argon2)** | full control, matches this codebase, no vendor |
| **Clerk / Auth.js** | minutes instead of days, managed UI, OAuth out of the box |
| **Supabase Auth** | if you ever move off Neon to Supabase |

### Multi-user extras that fall out of this

- `DELETE /runs` only ever touches `req.userId`'s rows
- stats/records queries all gain the same `user_id` predicate
- add Neon **Row Level Security** as a second line of defence
- cloud sync across devices, leaderboards, friends — all become joins on `user_id`

---

## 🔮 Roadmap — beyond that

**V2**

- 🔊 voice announcements — *"You've completed 2 kilometres"*
- 🎯 distance / time goals with a progress ring
- ⚡ pace alerts (slow down / speed up)
- 📍 background tracking (`expo-task-manager` + `expo-background-location`)
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

---

<div align="made">

**Built by [amiitdev](https://github.com/amiitdev)** · MIT License

</div>
