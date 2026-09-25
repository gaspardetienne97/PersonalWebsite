# 02 — Information Architecture

The new structure: **4 hubs + a utilities drawer**, intent-based, with every current feature relocated (none removed).

## Top-level navigation

```
SIDEBAR (desktop, sticky)            HEADER (persistent)
  ▸ Practice      /music             [ ⌘K search ]  🔥streak · XP · Lv
      Today | Drills | Paths         [ instrument switcher ] [ enable audio ]
  ▸ Library       /music/library
      Songs | Reference | Import     TRANSPORT BAR (persistent, bottom) — unchanged role
  ▸ Create        /music/create
      Beat | Piano roll | Recorder
  ▸ Progress      /music/progress
      Skill tree | Journal | Achievements
  ──────────────
  utilities drawer:
   Connect · Tuner · Settings · Guide
```

- **Desktop:** sidebar with 4 primary entries + a utilities group pinned at the bottom (Connect/Tuner/Settings/Guide), like the current bottom block.
- **Mobile:** bottom tab bar = **Practice · Library · Create · Progress** (4); utilities reached from a header "•••"/sheet.
- **⌘K command palette** (new): jump to any drill, song, tool, or "Start Today's plan." Desktop-first affordance; also a header search button on mobile.
- **Header chip:** streak · XP · level (read from `ProgressEngine`); replaces the old Home dashboard's stats.
- **Active-state logic:** replace the current O(n²) most-specific-match scan. Because **every** route starts with `/music`, Practice cannot be a bare prefix — it is active on an **exact** `/music` match **or** on the drill/path subroutes that belong to it (the allowlist: `/music/play/*`, `/music/learn/*` while those URLs still exist, plus the Practice tab routes). The other hubs match by **explicit prefix** — `/music/library`, `/music/create`, `/music/progress` — and utilities by theirs (`/music/connect`, `/music/tuner`, `/music/settings`, `/music/guide`). Tabs are in-page, not separate nav items.

---

## Hub specs

### Practice — `/music` (lands on Today)
The forward-looking "do" surface. Folds in the old Home, Coach, and Daily Routine.

- **Today** (default): the adaptive plan. The weak-spot-driven session (`buildDailyRoutinePlan` over `practiceNext`) as an ordered list with one **Start** that launches drills back-to-back (the Daily Routine runner). A **"Why this plan"** insights panel (from the Coach engine). Resume-in-progress. This is the landing screen.
- **Drills**: a filterable index of every drill. Filters: **skill** (Ear · Rhythm · Harmony · Reading · Technique) and **instrument**. Each card launches the drill (drills keep their routes). Includes **Free Play** (the old Practice Lab capture) and **Jam/Improv** as entries. Search + ⌘K.
- **Paths**: Guided curricula — the **Jazz Path** and the ear-training/reading learning-path cards. Progress-driven step completion (unchanged engine).

### Library — `/music/library`
Repertoire + reference. "One content object, many containers."

- **Songs**: the song library (imported MIDI/MusicXML). Selecting a song → **Song Studio** score-practice (`/music/songs/[id]`, unchanged engine) — a practice surface launched from Library.
- **Reference**: ONE chord/scale reference. The Theory Library **absorbs** the Jazz "Chords & Scales" tab. A chord/scale here is the same object that a Harmony drill previews. Jazz licks/repertoire lists live here too.
- **Import**: file import + **Transcribe** (audio→MIDI) — both produce a canonical `Score` saved to Songs, so they belong together.

### Create — `/music/create`
One creation surface (BandLab dual-surface model).

- **Mode toggle: Beat grid ⇄ Piano roll** — the merged Studio (16-step sequencer) and Piano Roll, sharing one persistent transport and one snap grid.
- **Sample kit** panel (Studio's kit loading + MPC export) available in Beat mode.
- **Recorder**: ONE recording primitive (MIDI + optional audio take) — the unified path used by Create, Free Play, and Jam. Take list, compare, export.
- Export MIDI / WAV from either mode.

### Progress — `/music/progress`
Purely retrospective now (Coach/Routine moved to Practice/Today).

- **Skill tree** (mastery rings, capability coverage, weak spots).
- **Journal** (the practice journal: heatmap, history, goals, manual entry — the old `/music/track`).
- **Achievements** + streak calendar + challenge board.

### Utilities drawer
Always-available tools, not part of the practice flow.

- **Connect**: MIDI/audio device connection + per-instrument source/surface prefs + MPC pad-LED diagnostic + **the instrument hub** (on-screen keyboard, live MIDI log) moved here from Home.
- **Tuner**: merged **Tuner + Intonation + Drone** (TonalEnergy model) — cents meter, in-tune % history, drone on the same screen.
- **Settings**, **Guide**.

---

## Old → new route map (every current feature)

| Current route | New home | Notes |
|---|---|---|
| `/music` (Home dashboard) | **Removed** → `/music` = Practice/Today | Stats → header chip; instrument hub → Connect; interval demo dropped |
| `/music/routine` | Practice ▸ Today | Becomes "Start Today's plan" runner |
| `/music/coach` | Practice ▸ Today | Becomes the "Why this plan" insights panel |
| `/music/learn` (hub) | **Removed** | Replaced by Practice ▸ Drills + Paths |
| `/music/learn/path` (Jazz Path) | Practice ▸ Paths | — |
| `/music/learn/ear` | Practice ▸ Drills (Ear) | URL may stay; leaves nav |
| `/music/learn/reading` | Practice ▸ Drills (Reading) | — |
| `/music/learn/rhythm` | Practice ▸ Drills (Rhythm) | — |
| `/music/learn/theory` (Chord/Scale Library) | Library ▸ Reference | Absorbs jazz chords&scales |
| `/music/learn/jazz` (Jazz reference) | Library ▸ Reference | Licks/repertoire → Library; voicings tab → links to the graded drill |
| `/music/learn/aerophone` | Practice ▸ Drills (Technique · Aerophone) | **Merge** with articulation into one Aerophone surface |
| `/music/play` (Practice Lab) | Practice ▸ Drills · **Free Play** | Free-capture entry |
| `/music/play/scales` | Practice ▸ Drills (Technique) | — |
| `/music/play/spider` | Practice ▸ Drills (Technique) | — |
| `/music/play/two-hand` | Practice ▸ Drills (Technique) | — |
| `/music/play/mpc` | Practice ▸ Drills (Technique) | — |
| `/music/play/chord-perfect` | Practice ▸ Drills (Harmony) | — |
| `/music/play/chord-progression` | Practice ▸ Drills (Harmony) | — |
| `/music/play/voicings` | Practice ▸ Drills (Harmony) | Jazz voicings reference becomes this drill's preview |
| `/music/play/articulation` | Practice ▸ Drills (Technique · Aerophone) | **Merged** with `/learn/aerophone` |
| `/music/jam` | Practice ▸ Drills · **Jam/Improv** | — |
| `/music/tuner` | Utilities ▸ **Tuner** | **Merged** with intonation+drone |
| `/music/intonation` | Utilities ▸ **Tuner** | **Merged** |
| `/music/songs`, `/songs/[id]` | Library ▸ Songs (Song Studio) | Unchanged engines |
| `/music/import` | Library ▸ Import | — |
| `/music/transcribe` | Library ▸ Import | Same "produce a Score" intent |
| `/music/studio` (sequencer) | Create ▸ **Beat** mode | **Merged** into one editor |
| `/music/piano-roll` | Create ▸ **Piano roll** mode | **Merged** |
| `/music/recording` | Create ▸ **Recorder** | One recording primitive |
| `/music/track` (Journal) | Progress ▸ Journal | — |
| `/music/progress` (Skill tree) | Progress ▸ Skill tree | — |
| `/music/connect` | Utilities ▸ Connect | Gains the instrument hub |
| `/music/settings` | Utilities ▸ Settings | — |
| `/music/guide` | Utilities ▸ Guide | — |

> **Note on the one removed item:** the `/music` (Home) row drops the *interval-answer demo* — a demo widget, not a catalogued feature (see [README](README.md)). Every other row relocates; nothing in the feature catalog is lost.

**URL strategy:** keep existing drill/song URLs working (they're deep-linkable and ⌘K targets); add redirects for removed hubs (`/music/learn` → Practice/Drills, `/music/coach` & `/music/routine` → Practice/Today, `/music/intonation` → `/music/tuner`, `/music/piano-roll` → Create). Don't break bookmarks.

**Net surface change:** ~35 routes/nav entries → **4 hubs + ~3 utilities**, with ~7 page merges (Coach+Routine→Today, Tuner+Intonation, Studio+PianoRoll, 3 recorders→1, Theory+Jazz-ref, aerophone learn+articulation, Home removed).
