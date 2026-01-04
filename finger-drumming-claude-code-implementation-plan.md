# Finger Drumming App - Claude Code Implementation Plan

## Overview

This document provides step-by-step implementation instructions optimized for Claude Code. Each task includes:
- **Objective**: What we're building
- **Commands**: Exact commands to run
- **Files to Create**: What code to write
- **Validation**: How to verify it works
- **Tests**: Automated tests to add

---

## Pre-Implementation Checklist

Before starting, ensure you have:
- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm or pnpm installed
- [ ] Chrome browser for testing
- [ ] A MIDI controller (MPC One) for hardware testing
- [ ] Text editor / IDE ready

---

## Phase 1: Project Foundation

### Task 1.1: Initialize SvelteKit Project

**Objective**: Create a new SvelteKit project with TypeScript and static adapter.

**Commands**:
```bash
# Create new project
npx sv create finger-drumming-app

# During prompts, select:
# - SvelteKit minimal
# - TypeScript
# - ESLint + Prettier
# - No additional options needed

cd finger-drumming-app

# Install static adapter
npm install -D @sveltejs/adapter-static

# Install core dependencies
npm install tone @tonejs/midi idb
npm install -D @types/webmidi tailwindcss autoprefixer postcss
```

**Validation**:
```bash
# Should start without errors
npm run dev

# Visit http://localhost:5173 - should see welcome page
```

**Checkpoint**: ✅ Dev server runs, no errors in console

---

### Task 1.2: Configure Static Adapter & Base Path

**Objective**: Configure for static deployment to `/drums` subdirectory.

**File: `svelte.config.js`**
```javascript
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: 'index.html',
      precompress: true
    }),
    paths: {
      base: process.env.NODE_ENV === 'production' ? '/drums' : ''
    },
    alias: {
      $components: 'src/lib/components',
      $stores: 'src/lib/stores',
      $midi: 'src/lib/midi',
      $audio: 'src/lib/audio',
      $validation: 'src/lib/validation',
      $types: 'src/lib/types',
      $themes: 'src/lib/themes',
      $db: 'src/lib/db'
    }
  }
};

export default config;
```

**Validation**:
```bash
# Build should succeed
npm run build

# Check build output exists
ls -la build/
```

**Checkpoint**: ✅ Build completes, `build/` directory contains `index.html`

---

### Task 1.3: Configure Tailwind CSS

**Objective**: Set up Tailwind for styling.

**Commands**:
```bash
npx tailwindcss init -p
```

**File: `tailwind.config.js`**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      colors: {
        // Will be overridden by CSS variables for theming
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'accent': 'var(--accent)',
        'hit-perfect': 'var(--hit-perfect)',
        'hit-good': 'var(--hit-good)',
        'hit-early': 'var(--hit-early)',
        'hit-late': 'var(--hit-late)',
        'hit-miss': 'var(--hit-miss)',
      }
    }
  },
  plugins: []
};
```

**File: `src/app.css`**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  /* Default theme (dark) */
  --bg-primary: #1a1a2e;
  --bg-secondary: #2a2a4a;
  --bg-tertiary: #3a3a5a;
  --text-primary: #ffffff;
  --text-secondary: #b0b0b0;
  --text-muted: #666666;
  --accent: #6366f1;
  --accent-hover: #818cf8;
  --hit-perfect: #00ff88;
  --hit-good: #88ff00;
  --hit-early: #ffaa00;
  --hit-late: #ff8800;
  --hit-miss: #ff0044;
}

body {
  background-color: var(--bg-primary);
  color: var(--text-primary);
  font-family: system-ui, -apple-system, sans-serif;
}
```

**File: `src/routes/+layout.svelte`**
```svelte
<script lang="ts">
  import '../app.css';
</script>

<slot />
```

**Validation**:
```bash
npm run dev
# Page should have dark background (#1a1a2e)
```

**Checkpoint**: ✅ Tailwind working, dark theme visible

---

### Task 1.4: Create Type Definitions

**Objective**: Define TypeScript interfaces for the entire app.

**File: `src/lib/types/midi.ts`**
```typescript
export interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
}

export interface MidiNote {
  note: number;
  velocity: number;
  channel: number;
  timestamp: number;
}

export interface MidiMessage {
  type: 'noteon' | 'noteoff' | 'cc' | 'other';
  note?: number;
  velocity?: number;
  channel: number;
  timestamp: number;
  raw: Uint8Array;
}

export interface PadMapping {
  id: string;
  name: string;
  description: string;
  mapping: Record<number, number>; // pad index -> MIDI note
}

export const GM_DRUM_MAP: Record<number, string> = {
  35: 'Acoustic Bass Drum',
  36: 'Bass Drum 1',
  37: 'Side Stick',
  38: 'Acoustic Snare',
  39: 'Hand Clap',
  40: 'Electric Snare',
  41: 'Low Floor Tom',
  42: 'Closed Hi-Hat',
  43: 'High Floor Tom',
  44: 'Pedal Hi-Hat',
  45: 'Low Tom',
  46: 'Open Hi-Hat',
  47: 'Low-Mid Tom',
  48: 'Hi-Mid Tom',
  49: 'Crash Cymbal 1',
  50: 'High Tom',
  51: 'Ride Cymbal 1',
  52: 'Chinese Cymbal',
  53: 'Ride Bell',
  54: 'Tambourine',
  55: 'Splash Cymbal',
  56: 'Cowbell',
  57: 'Crash Cymbal 2',
  58: 'Vibraslap',
  59: 'Ride Cymbal 2'
};
```

**File: `src/lib/types/lesson.ts`**
```typescript
export interface LessonNote {
  time: number;        // ms from start
  note: number;        // MIDI note number
  velocity: number;    // 0-127
  duration: number;    // ms
  hand?: 'L' | 'R';    // optional hand indicator
}

export interface LessonSection {
  name: string;
  startTime: number;
  endTime: number;
}

export interface Lesson {
  id: string;
  version: number;
  title: string;
  description: string;
  author: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  genre: string;
  tags: string[];
  bpm: number;
  timeSignature: [number, number];
  duration: number;
  backingTrackUrl?: string;
  padMappingOverride?: Record<number, number>;
  tips: string[];
  notes: LessonNote[];
  sections?: LessonSection[];
}

export interface LessonMeta {
  id: string;
  title: string;
  difficulty: Lesson['difficulty'];
  genre: string;
  duration: number;
  bpm: number;
}
```

**File: `src/lib/types/score.ts`**
```typescript
export type HitStatus = 'perfect' | 'good' | 'early' | 'late' | 'miss';

export interface NoteResult {
  expectedTime: number;
  expectedNote: number;
  expectedVelocity: number;
  actualTime: number | null;
  actualNote: number | null;
  actualVelocity: number | null;
  timingOffset: number;
  velocityDiff: number;
  status: HitStatus;
  points: number;
}

export interface TimingWindows {
  perfect: number;  // ms
  good: number;     // ms
  miss: number;     // ms
}

export interface VelocitySettings {
  enabled: boolean;
  tolerance: number;  // 0-127
  weight: number;     // 0-1 (percentage of score)
}

export interface SessionScore {
  totalNotes: number;
  notesPlayed: number;
  perfectHits: number;
  goodHits: number;
  earlyHits: number;
  lateHits: number;
  misses: number;
  accuracy: number;
  averageTiming: number;
  currentStreak: number;
  maxStreak: number;
  grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  totalPoints: number;
  maxPoints: number;
}

export const DEFAULT_TIMING_WINDOWS: TimingWindows = {
  perfect: 25,
  good: 50,
  miss: 100
};

export const DEFAULT_VELOCITY_SETTINGS: VelocitySettings = {
  enabled: false,
  tolerance: 20,
  weight: 0.3
};

export function calculateGrade(accuracy: number): SessionScore['grade'] {
  if (accuracy >= 95) return 'S';
  if (accuracy >= 85) return 'A';
  if (accuracy >= 75) return 'B';
  if (accuracy >= 65) return 'C';
  if (accuracy >= 50) return 'D';
  return 'F';
}
```

**File: `src/lib/types/theme.ts`**
```typescript
export interface ThemeColors {
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  hitPerfect: string;
  hitGood: string;
  hitEarly: string;
  hitLate: string;
  hitMiss: string;
  padColors: string[];
}

export interface ThemeEffects {
  glowEnabled: boolean;
  gradientBackground: boolean;
  animationIntensity: 'none' | 'reduced' | 'full';
}

export interface Theme {
  id: string;
  name: string;
  colors: ThemeColors;
  effects: ThemeEffects;
}

export type ThemeId = 'dark' | 'vibrant' | 'minimal';
```

**File: `src/lib/types/settings.ts`**
```typescript
import type { TimingWindows, VelocitySettings } from './score';
import type { ThemeId } from './theme';

export interface PracticeModeSettings {
  noFail: boolean;
  waitMode: boolean;
  waitModeTimeout: number | null;  // ms, null = infinite
}

export interface MetronomeSettings {
  enabled: boolean;
  volume: number;           // 0-100
  accentBeat1: boolean;
  subdivision: 1 | 2 | 4;   // quarter, 8th, 16th
  sound: 'click' | 'woodblock' | 'beep';
}

export interface CountInSettings {
  enabled: boolean;
  bars: 0 | 1 | 2 | 4;
  audible: boolean;
  visual: boolean;
}

export interface AppSettings {
  // Display
  theme: ThemeId;
  reduceAnimations: boolean;
  
  // MIDI
  midiDeviceId: string | null;
  padMappingId: string;
  customPadMapping: Record<number, number> | null;
  
  // Scoring
  timingWindows: TimingWindows;
  velocitySettings: VelocitySettings;
  
  // Practice
  practiceMode: PracticeModeSettings;
  metronome: MetronomeSettings;
  countIn: CountInSettings;
  
  // Audio
  masterVolume: number;     // 0-100
  drumVolume: number;       // 0-100
  backingVolume: number;    // 0-100
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  reduceAnimations: false,
  midiDeviceId: null,
  padMappingId: 'gm',
  customPadMapping: null,
  timingWindows: { perfect: 25, good: 50, miss: 100 },
  velocitySettings: { enabled: false, tolerance: 20, weight: 0.3 },
  practiceMode: { noFail: true, waitMode: false, waitModeTimeout: null },
  metronome: { enabled: false, volume: 50, accentBeat1: true, subdivision: 1, sound: 'click' },
  countIn: { enabled: true, bars: 1, audible: true, visual: true },
  masterVolume: 80,
  drumVolume: 100,
  backingVolume: 70
};
```

**File: `src/lib/types/index.ts`**
```typescript
export * from './midi';
export * from './lesson';
export * from './score';
export * from './theme';
export * from './settings';
```

**Validation**:
```bash
# TypeScript should compile without errors
npm run check
```

**Checkpoint**: ✅ All types defined, `npm run check` passes

---

### Task 1.5: Create Svelte Stores

**Objective**: Set up reactive state management.

**File: `src/lib/stores/settingsStore.ts`**
```typescript
import { writable, derived } from 'svelte/store';
import type { AppSettings } from '$types';
import { DEFAULT_SETTINGS } from '$types';

const STORAGE_KEY = 'finger-drumming-settings';

function loadSettings(): AppSettings {
  if (typeof localStorage === 'undefined') return DEFAULT_SETTINGS;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
    }
  } catch (e) {
    console.error('Failed to load settings:', e);
  }
  return DEFAULT_SETTINGS;
}

function createSettingsStore() {
  const { subscribe, set, update } = writable<AppSettings>(loadSettings());
  
  return {
    subscribe,
    set: (value: AppSettings) => {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      }
      set(value);
    },
    update: (updater: (settings: AppSettings) => AppSettings) => {
      update(current => {
        const updated = updater(current);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
        }
        return updated;
      });
    },
    reset: () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(STORAGE_KEY);
      }
      set(DEFAULT_SETTINGS);
    }
  };
}

export const settings = createSettingsStore();

// Derived stores for easy access
export const theme = derived(settings, $s => $s.theme);
export const timingWindows = derived(settings, $s => $s.timingWindows);
export const velocitySettings = derived(settings, $s => $s.velocitySettings);
```

**File: `src/lib/stores/midiStore.ts`**
```typescript
import { writable, derived } from 'svelte/store';
import type { MidiDevice, MidiNote } from '$types';

export interface MidiState {
  isSupported: boolean;
  isConnected: boolean;
  devices: MidiDevice[];
  activeInputId: string | null;
  lastNote: MidiNote | null;
  error: string | null;
}

const initialState: MidiState = {
  isSupported: false,
  isConnected: false,
  devices: [],
  activeInputId: null,
  lastNote: null,
  error: null
};

export const midiState = writable<MidiState>(initialState);

export const activeDevice = derived(midiState, $state => {
  if (!$state.activeInputId) return null;
  return $state.devices.find(d => d.id === $state.activeInputId) || null;
});

export const inputDevices = derived(midiState, $state => 
  $state.devices.filter(d => d.type === 'input')
);
```

**File: `src/lib/stores/sessionStore.ts`**
```typescript
import { writable, derived } from 'svelte/store';
import type { Lesson, NoteResult, SessionScore } from '$types';
import { calculateGrade } from '$types';

export interface SessionState {
  // Lesson
  lesson: Lesson | null;
  isLoaded: boolean;
  
  // Playback
  isPlaying: boolean;
  isPaused: boolean;
  currentTime: number;      // ms
  tempo: number;            // BPM (can differ from lesson.bpm)
  tempoMultiplier: number;  // 0.5 - 1.5
  
  // Loop
  loopEnabled: boolean;
  loopStart: number | null;
  loopEnd: number | null;
  
  // Part filter
  partsEnabled: {
    kick: boolean;
    snare: boolean;
    hihat: boolean;
    toms: boolean;
    cymbals: boolean;
    percussion: boolean;
  };
  
  // Results
  results: NoteResult[];
  currentNoteIndex: number;
}

const initialState: SessionState = {
  lesson: null,
  isLoaded: false,
  isPlaying: false,
  isPaused: false,
  currentTime: 0,
  tempo: 120,
  tempoMultiplier: 1.0,
  loopEnabled: false,
  loopStart: null,
  loopEnd: null,
  partsEnabled: {
    kick: true,
    snare: true,
    hihat: true,
    toms: true,
    cymbals: true,
    percussion: true
  },
  results: [],
  currentNoteIndex: 0
};

export const session = writable<SessionState>(initialState);

export const score = derived(session, ($session): SessionScore => {
  const results = $session.results;
  const totalNotes = $session.lesson?.notes.length || 0;
  
  if (results.length === 0) {
    return {
      totalNotes,
      notesPlayed: 0,
      perfectHits: 0,
      goodHits: 0,
      earlyHits: 0,
      lateHits: 0,
      misses: 0,
      accuracy: 0,
      averageTiming: 0,
      currentStreak: 0,
      maxStreak: 0,
      grade: 'F',
      totalPoints: 0,
      maxPoints: totalNotes * 100
    };
  }
  
  const counts = { perfect: 0, good: 0, early: 0, late: 0, miss: 0 };
  let totalTiming = 0;
  let timingCount = 0;
  let totalPoints = 0;
  let currentStreak = 0;
  let maxStreak = 0;
  
  for (const result of results) {
    counts[result.status]++;
    totalPoints += result.points;
    
    if (result.status !== 'miss' && result.timingOffset !== Infinity) {
      totalTiming += result.timingOffset;
      timingCount++;
    }
    
    if (result.status === 'perfect' || result.status === 'good') {
      currentStreak++;
      maxStreak = Math.max(maxStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  }
  
  const maxPoints = results.length * 100;
  const accuracy = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
  
  return {
    totalNotes,
    notesPlayed: results.length,
    perfectHits: counts.perfect,
    goodHits: counts.good,
    earlyHits: counts.early,
    lateHits: counts.late,
    misses: counts.miss,
    accuracy,
    averageTiming: timingCount > 0 ? Math.round(totalTiming / timingCount) : 0,
    currentStreak,
    maxStreak,
    grade: calculateGrade(accuracy),
    totalPoints,
    maxPoints
  };
});

export const progress = derived(session, $session => {
  if (!$session.lesson) return 0;
  return Math.round(($session.currentNoteIndex / $session.lesson.notes.length) * 100);
});
```

**File: `src/lib/stores/index.ts`**
```typescript
export * from './settingsStore';
export * from './midiStore';
export * from './sessionStore';
```

**Validation**:
```bash
npm run check
# No TypeScript errors
```

**Test**: Create a simple test page to verify stores work.

**File: `src/routes/+page.svelte`**
```svelte
<script lang="ts">
  import { settings, midiState, session, score } from '$stores';
</script>

<div class="p-8">
  <h1 class="text-2xl font-bold mb-4">Store Test</h1>
  
  <div class="space-y-4">
    <div class="bg-bg-secondary p-4 rounded">
      <h2 class="font-semibold">Settings</h2>
      <pre class="text-xs mt-2">{JSON.stringify($settings, null, 2)}</pre>
    </div>
    
    <div class="bg-bg-secondary p-4 rounded">
      <h2 class="font-semibold">MIDI State</h2>
      <pre class="text-xs mt-2">{JSON.stringify($midiState, null, 2)}</pre>
    </div>
    
    <div class="bg-bg-secondary p-4 rounded">
      <h2 class="font-semibold">Score</h2>
      <pre class="text-xs mt-2">{JSON.stringify($score, null, 2)}</pre>
    </div>
  </div>
</div>
```

**Validation**:
```bash
npm run dev
# Page should display store state as JSON
# Check browser console for errors
```

**Checkpoint**: ✅ Stores created, test page shows data

---

## Phase 1 Continued: MIDI System

### Task 1.6: Implement MIDI Service

**Objective**: Create the core MIDI connection and message handling service.

**File: `src/lib/midi/MidiService.ts`**
```typescript
import { midiState } from '$stores';
import type { MidiDevice, MidiNote, MidiMessage } from '$types';

class MidiService {
  private midiAccess: MIDIAccess | null = null;
  private activeInput: MIDIInput | null = null;
  private noteHandlers: Set<(note: MidiNote) => void> = new Set();
  private noteOffHandlers: Set<(note: MidiNote) => void> = new Set();
  
  async initialize(): Promise<boolean> {
    // Check for Web MIDI support
    if (!navigator.requestMIDIAccess) {
      midiState.update(s => ({
        ...s,
        isSupported: false,
        error: this.getUnsupportedMessage()
      }));
      return false;
    }
    
    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      
      midiState.update(s => ({
        ...s,
        isSupported: true,
        isConnected: true,
        error: null
      }));
      
      // Listen for device changes
      this.midiAccess.onstatechange = this.handleStateChange.bind(this);
      
      // Initial device enumeration
      this.refreshDevices();
      
      return true;
    } catch (err) {
      midiState.update(s => ({
        ...s,
        isSupported: true,
        isConnected: false,
        error: `MIDI access denied: ${err}`
      }));
      return false;
    }
  }
  
  private getUnsupportedMessage(): string {
    const ua = navigator.userAgent;
    if (ua.includes('Firefox')) {
      return 'Firefox requires Web MIDI to be enabled. Go to about:config and set dom.webmidi.enabled to true.';
    }
    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      return 'Safari does not support Web MIDI. Please use Chrome or Edge.';
    }
    return 'Web MIDI is not supported in this browser. Please use Chrome or Edge.';
  }
  
  private refreshDevices(): void {
    if (!this.midiAccess) return;
    
    const devices: MidiDevice[] = [];
    
    this.midiAccess.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || 'Unknown',
        type: 'input',
        state: input.state as 'connected' | 'disconnected'
      });
    });
    
    this.midiAccess.outputs.forEach((output) => {
      devices.push({
        id: output.id,
        name: output.name || 'Unknown Device',
        manufacturer: output.manufacturer || 'Unknown',
        type: 'output',
        state: output.state as 'connected' | 'disconnected'
      });
    });
    
    midiState.update(s => ({ ...s, devices }));
  }
  
  private handleStateChange(event: MIDIConnectionEvent): void {
    console.log('MIDI device change:', event.port?.name, event.port?.state);
    this.refreshDevices();
    
    // Handle disconnection of active device
    if (this.activeInput?.id === event.port?.id && event.port?.state === 'disconnected') {
      this.disconnect();
    }
  }
  
  selectInput(deviceId: string): boolean {
    if (!this.midiAccess) return false;
    
    // Disconnect current
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
    }
    
    const input = this.midiAccess.inputs.get(deviceId);
    if (!input) {
      console.error('Input device not found:', deviceId);
      return false;
    }
    
    this.activeInput = input;
    this.activeInput.onmidimessage = this.handleMidiMessage.bind(this);
    
    midiState.update(s => ({ ...s, activeInputId: deviceId }));
    console.log('Connected to MIDI device:', input.name);
    
    return true;
  }
  
  disconnect(): void {
    if (this.activeInput) {
      this.activeInput.onmidimessage = null;
      this.activeInput = null;
    }
    midiState.update(s => ({ ...s, activeInputId: null, lastNote: null }));
  }
  
  private handleMidiMessage(event: MIDIMessageEvent): void {
    if (!event.data || event.data.length < 3) return;
    
    const [status, note, velocity] = event.data;
    const channel = (status & 0x0F) + 1;
    const command = status & 0xF0;
    
    const midiNote: MidiNote = {
      note,
      velocity,
      channel,
      timestamp: event.timeStamp
    };
    
    // Note On with velocity > 0
    if (command === 0x90 && velocity > 0) {
      midiState.update(s => ({ ...s, lastNote: midiNote }));
      this.noteHandlers.forEach(handler => handler(midiNote));
    }
    // Note Off (or Note On with velocity 0)
    else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
      this.noteOffHandlers.forEach(handler => handler(midiNote));
    }
  }
  
  onNoteOn(handler: (note: MidiNote) => void): () => void {
    this.noteHandlers.add(handler);
    return () => this.noteHandlers.delete(handler);
  }
  
  onNoteOff(handler: (note: MidiNote) => void): () => void {
    this.noteOffHandlers.add(handler);
    return () => this.noteOffHandlers.delete(handler);
  }
  
  getDevices(): MidiDevice[] {
    const devices: MidiDevice[] = [];
    midiState.subscribe(s => devices.push(...s.devices))();
    return devices;
  }
}

// Singleton export
export const midiService = new MidiService();
```

**Validation**:
```bash
npm run check
```

**Test Component**: Create a MIDI test page.

**File: `src/routes/test/midi/+page.svelte`**
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { midiService } from '$midi/MidiService';
  import { midiState, activeDevice, inputDevices } from '$stores';
  import type { MidiNote } from '$types';
  
  let lastNotes: MidiNote[] = [];
  let unsubscribe: (() => void) | null = null;
  
  onMount(async () => {
    await midiService.initialize();
    
    unsubscribe = midiService.onNoteOn((note) => {
      lastNotes = [note, ...lastNotes.slice(0, 9)];
    });
  });
  
  onDestroy(() => {
    unsubscribe?.();
  });
  
  function selectDevice(id: string) {
    midiService.selectInput(id);
  }
</script>

<div class="p-8 max-w-2xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">MIDI Test</h1>
  
  {#if $midiState.error}
    <div class="bg-red-900/50 border border-red-500 p-4 rounded mb-6">
      <p class="text-red-200">{$midiState.error}</p>
    </div>
  {/if}
  
  {#if $midiState.isSupported}
    <div class="bg-bg-secondary p-4 rounded mb-6">
      <h2 class="font-semibold mb-2">Status</h2>
      <p>Connected: {$midiState.isConnected ? '✅' : '❌'}</p>
      <p>Active Device: {$activeDevice?.name || 'None'}</p>
    </div>
    
    <div class="bg-bg-secondary p-4 rounded mb-6">
      <h2 class="font-semibold mb-2">Available Inputs</h2>
      {#if $inputDevices.length === 0}
        <p class="text-text-secondary">No MIDI devices detected. Connect a device and refresh.</p>
      {:else}
        <div class="space-y-2">
          {#each $inputDevices as device}
            <button
              class="w-full text-left p-2 rounded {$midiState.activeInputId === device.id ? 'bg-accent' : 'bg-bg-tertiary hover:bg-bg-tertiary/80'}"
              on:click={() => selectDevice(device.id)}
            >
              <span class="font-medium">{device.name}</span>
              <span class="text-text-secondary text-sm ml-2">({device.manufacturer})</span>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    
    <div class="bg-bg-secondary p-4 rounded">
      <h2 class="font-semibold mb-2">Recent Notes</h2>
      {#if lastNotes.length === 0}
        <p class="text-text-secondary">Hit a pad to see MIDI data...</p>
      {:else}
        <div class="space-y-1 font-mono text-sm">
          {#each lastNotes as note, i}
            <div class="flex gap-4 {i === 0 ? 'text-hit-perfect' : 'text-text-secondary'}">
              <span>Note: {note.note}</span>
              <span>Vel: {note.velocity}</span>
              <span>Ch: {note.channel}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <p>Web MIDI not supported</p>
  {/if}
</div>
```

**Manual Validation**:
1. Open Chrome at `http://localhost:5173/test/midi`
2. Connect MPC One via USB
3. Put MPC One in Controller Mode
4. Device should appear in list
5. Select device, hit pads
6. Note data should appear in "Recent Notes"

**Checkpoint**: ✅ MIDI device connects, notes captured

---

### Task 1.7: Implement Validation Engine

**Objective**: Create the core scoring/validation logic.

**File: `src/lib/validation/ValidationEngine.ts`**
```typescript
import type { 
  LessonNote, 
  MidiNote, 
  NoteResult, 
  HitStatus,
  TimingWindows, 
  VelocitySettings,
  SessionScore 
} from '$types';
import { DEFAULT_TIMING_WINDOWS, DEFAULT_VELOCITY_SETTINGS, calculateGrade } from '$types';

export class ValidationEngine {
  private notes: LessonNote[] = [];
  private results: Map<number, NoteResult> = new Map(); // key = note index
  private currentIndex: number = 0;
  private startTime: number = 0;
  private timingWindows: TimingWindows;
  private velocitySettings: VelocitySettings;
  
  // Streak tracking
  private streak: number = 0;
  private maxStreak: number = 0;
  
  constructor(
    timingWindows: TimingWindows = DEFAULT_TIMING_WINDOWS,
    velocitySettings: VelocitySettings = DEFAULT_VELOCITY_SETTINGS
  ) {
    this.timingWindows = timingWindows;
    this.velocitySettings = velocitySettings;
  }
  
  loadNotes(notes: LessonNote[]): void {
    this.notes = [...notes].sort((a, b) => a.time - b.time);
    this.reset();
  }
  
  reset(): void {
    this.results.clear();
    this.currentIndex = 0;
    this.streak = 0;
    this.maxStreak = 0;
    this.startTime = 0;
  }
  
  start(): void {
    this.startTime = performance.now();
  }
  
  setStartTime(time: number): void {
    this.startTime = time;
  }
  
  updateConfig(
    timingWindows?: TimingWindows,
    velocitySettings?: VelocitySettings
  ): void {
    if (timingWindows) this.timingWindows = timingWindows;
    if (velocitySettings) this.velocitySettings = velocitySettings;
  }
  
  /**
   * Process a user's note hit
   */
  processNote(userNote: MidiNote, currentTime?: number): NoteResult | null {
    const relativeTime = (currentTime ?? userNote.timestamp) - this.startTime;
    
    // Find best matching expected note
    let bestMatch: { note: LessonNote; index: number; offset: number } | null = null;
    
    for (let i = this.currentIndex; i < this.notes.length; i++) {
      const expected = this.notes[i];
      const timeDiff = relativeTime - expected.time;
      
      // Stop if we're looking too far ahead
      if (timeDiff < -this.timingWindows.miss) break;
      
      // Skip notes that are too old
      if (timeDiff > this.timingWindows.miss) {
        continue;
      }
      
      // Skip if already matched
      if (this.results.has(i)) continue;
      
      // Check note match
      if (expected.note === userNote.note) {
        const absOffset = Math.abs(timeDiff);
        
        if (!bestMatch || absOffset < Math.abs(bestMatch.offset)) {
          bestMatch = { note: expected, index: i, offset: timeDiff };
        }
      }
    }
    
    if (!bestMatch) {
      // Wrong note or wrong time
      return null;
    }
    
    // Calculate status
    const absOffset = Math.abs(bestMatch.offset);
    let status: HitStatus;
    let points: number;
    
    if (absOffset <= this.timingWindows.perfect) {
      status = 'perfect';
      points = 100;
    } else if (absOffset <= this.timingWindows.good) {
      status = 'good';
      points = 80;
    } else if (bestMatch.offset < 0) {
      status = 'early';
      points = 50;
    } else {
      status = 'late';
      points = 50;
    }
    
    // Apply velocity scoring if enabled
    let velocityDiff = 0;
    if (this.velocitySettings.enabled) {
      velocityDiff = Math.abs(userNote.velocity - bestMatch.note.velocity);
      const velocityScore = Math.max(0, 100 - (velocityDiff / this.velocitySettings.tolerance) * 100);
      
      points = points * (1 - this.velocitySettings.weight) + 
               velocityScore * this.velocitySettings.weight;
      points = Math.round(points);
    }
    
    // Create result
    const result: NoteResult = {
      expectedTime: bestMatch.note.time,
      expectedNote: bestMatch.note.note,
      expectedVelocity: bestMatch.note.velocity,
      actualTime: relativeTime,
      actualNote: userNote.note,
      actualVelocity: userNote.velocity,
      timingOffset: bestMatch.offset,
      velocityDiff,
      status,
      points
    };
    
    // Store result
    this.results.set(bestMatch.index, result);
    
    // Update streak
    if (status === 'perfect' || status === 'good') {
      this.streak++;
      this.maxStreak = Math.max(this.maxStreak, this.streak);
    } else {
      this.streak = 0;
    }
    
    // Advance current index
    while (this.currentIndex < this.notes.length && this.results.has(this.currentIndex)) {
      this.currentIndex++;
    }
    
    return result;
  }
  
  /**
   * Check for missed notes based on current time
   */
  checkMissedNotes(currentTime: number): NoteResult[] {
    const relativeTime = currentTime - this.startTime;
    const missedResults: NoteResult[] = [];
    
    while (this.currentIndex < this.notes.length) {
      const expected = this.notes[this.currentIndex];
      
      // If note is past the miss window and not yet matched
      if (expected.time + this.timingWindows.miss < relativeTime && !this.results.has(this.currentIndex)) {
        const result: NoteResult = {
          expectedTime: expected.time,
          expectedNote: expected.note,
          expectedVelocity: expected.velocity,
          actualTime: null,
          actualNote: null,
          actualVelocity: null,
          timingOffset: Infinity,
          velocityDiff: 0,
          status: 'miss',
          points: 0
        };
        
        this.results.set(this.currentIndex, result);
        missedResults.push(result);
        this.streak = 0;
        this.currentIndex++;
      } else {
        break;
      }
    }
    
    return missedResults;
  }
  
  /**
   * Get all results
   */
  getResults(): NoteResult[] {
    return Array.from(this.results.values());
  }
  
  /**
   * Get result for specific note index
   */
  getResult(index: number): NoteResult | undefined {
    return this.results.get(index);
  }
  
  /**
   * Get current score
   */
  getScore(): SessionScore {
    const results = this.getResults();
    const totalNotes = this.notes.length;
    
    if (results.length === 0) {
      return {
        totalNotes,
        notesPlayed: 0,
        perfectHits: 0,
        goodHits: 0,
        earlyHits: 0,
        lateHits: 0,
        misses: 0,
        accuracy: 0,
        averageTiming: 0,
        currentStreak: this.streak,
        maxStreak: this.maxStreak,
        grade: 'F',
        totalPoints: 0,
        maxPoints: totalNotes * 100
      };
    }
    
    const counts = { perfect: 0, good: 0, early: 0, late: 0, miss: 0 };
    let totalTiming = 0;
    let timingCount = 0;
    let totalPoints = 0;
    
    for (const result of results) {
      counts[result.status]++;
      totalPoints += result.points;
      
      if (result.status !== 'miss') {
        totalTiming += result.timingOffset;
        timingCount++;
      }
    }
    
    const maxPoints = results.length * 100;
    const accuracy = maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
    
    return {
      totalNotes,
      notesPlayed: results.length,
      perfectHits: counts.perfect,
      goodHits: counts.good,
      earlyHits: counts.early,
      lateHits: counts.late,
      misses: counts.miss,
      accuracy,
      averageTiming: timingCount > 0 ? Math.round(totalTiming / timingCount) : 0,
      currentStreak: this.streak,
      maxStreak: this.maxStreak,
      grade: calculateGrade(accuracy),
      totalPoints,
      maxPoints
    };
  }
  
  /**
   * Get progress (0-100)
   */
  getProgress(): number {
    if (this.notes.length === 0) return 0;
    return Math.round((this.currentIndex / this.notes.length) * 100);
  }
  
  /**
   * Check if all notes have been processed
   */
  isComplete(): boolean {
    return this.currentIndex >= this.notes.length;
  }
}
```

**File: `src/lib/validation/index.ts`**
```typescript
export * from './ValidationEngine';
```

**Test File: `src/lib/validation/ValidationEngine.test.ts`**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { ValidationEngine } from './ValidationEngine';
import type { LessonNote, MidiNote } from '$types';

describe('ValidationEngine', () => {
  let engine: ValidationEngine;
  
  const testNotes: LessonNote[] = [
    { time: 0, note: 36, velocity: 100, duration: 100 },
    { time: 500, note: 38, velocity: 80, duration: 100 },
    { time: 1000, note: 36, velocity: 100, duration: 100 },
    { time: 1500, note: 38, velocity: 80, duration: 100 },
  ];
  
  beforeEach(() => {
    engine = new ValidationEngine(
      { perfect: 25, good: 50, miss: 100 },
      { enabled: false, tolerance: 20, weight: 0.3 }
    );
    engine.loadNotes(testNotes);
    engine.setStartTime(0);
  });
  
  describe('processNote', () => {
    it('should score a perfect hit', () => {
      const userNote: MidiNote = { note: 36, velocity: 100, channel: 10, timestamp: 10 };
      const result = engine.processNote(userNote, 10);
      
      expect(result).not.toBeNull();
      expect(result!.status).toBe('perfect');
      expect(result!.points).toBe(100);
    });
    
    it('should score a good hit', () => {
      const userNote: MidiNote = { note: 36, velocity: 100, channel: 10, timestamp: 40 };
      const result = engine.processNote(userNote, 40);
      
      expect(result).not.toBeNull();
      expect(result!.status).toBe('good');
      expect(result!.points).toBe(80);
    });
    
    it('should score an early hit', () => {
      const userNote: MidiNote = { note: 38, velocity: 80, channel: 10, timestamp: 430 };
      const result = engine.processNote(userNote, 430);
      
      expect(result).not.toBeNull();
      expect(result!.status).toBe('early');
      expect(result!.points).toBe(50);
    });
    
    it('should score a late hit', () => {
      const userNote: MidiNote = { note: 36, velocity: 100, channel: 10, timestamp: 80 };
      const result = engine.processNote(userNote, 80);
      
      expect(result).not.toBeNull();
      expect(result!.status).toBe('late');
      expect(result!.points).toBe(50);
    });
    
    it('should return null for wrong note', () => {
      const userNote: MidiNote = { note: 42, velocity: 100, channel: 10, timestamp: 10 };
      const result = engine.processNote(userNote, 10);
      
      expect(result).toBeNull();
    });
    
    it('should return null for note outside window', () => {
      const userNote: MidiNote = { note: 36, velocity: 100, channel: 10, timestamp: 200 };
      const result = engine.processNote(userNote, 200);
      
      expect(result).toBeNull();
    });
  });
  
  describe('checkMissedNotes', () => {
    it('should mark notes as missed after window passes', () => {
      const missed = engine.checkMissedNotes(150);
      
      expect(missed.length).toBe(1);
      expect(missed[0].status).toBe('miss');
      expect(missed[0].expectedNote).toBe(36);
    });
  });
  
  describe('getScore', () => {
    it('should calculate score correctly', () => {
      // Hit first two notes perfectly
      engine.processNote({ note: 36, velocity: 100, channel: 10, timestamp: 5 }, 5);
      engine.processNote({ note: 38, velocity: 80, channel: 10, timestamp: 505 }, 505);
      
      const score = engine.getScore();
      
      expect(score.notesPlayed).toBe(2);
      expect(score.perfectHits).toBe(2);
      expect(score.accuracy).toBe(100);
      expect(score.currentStreak).toBe(2);
    });
  });
  
  describe('streak tracking', () => {
    it('should track streaks correctly', () => {
      engine.processNote({ note: 36, velocity: 100, channel: 10, timestamp: 5 }, 5);
      expect(engine.getScore().currentStreak).toBe(1);
      
      engine.processNote({ note: 38, velocity: 80, channel: 10, timestamp: 505 }, 505);
      expect(engine.getScore().currentStreak).toBe(2);
      
      // Miss a note
      engine.checkMissedNotes(1200);
      expect(engine.getScore().currentStreak).toBe(0);
      expect(engine.getScore().maxStreak).toBe(2);
    });
  });
});
```

**Commands**:
```bash
# Install vitest
npm install -D vitest

# Add test script to package.json
# "test": "vitest",
# "test:run": "vitest run"

# Run tests
npm run test:run
```

**Validation**:
```bash
npm run test:run
# All tests should pass
```

**Checkpoint**: ✅ ValidationEngine implemented, all tests pass

---

## Testing Plan Summary

### Unit Tests (Vitest)

| Component | Test File | Coverage |
|-----------|-----------|----------|
| ValidationEngine | `ValidationEngine.test.ts` | Scoring, timing, streaks |
| MidiParser | `MidiParser.test.ts` | File parsing, edge cases |
| ScoreCalculator | `score.test.ts` | Grade calculation |
| Stores | `stores.test.ts` | Persistence, updates |

### Integration Tests

| Test | Description | How to Run |
|------|-------------|------------|
| MIDI → Validation | Full note capture + scoring | Manual with controller |
| Lesson Loading | Load → Play → Score | Automated + manual |
| PWA Offline | Install → Disconnect → Use | Manual |

### Manual Test Checklist

#### MIDI System
- [ ] Device appears in list when connected
- [ ] Device disappears when disconnected
- [ ] Notes captured with correct values
- [ ] Latency feels acceptable (<20ms perceived)
- [ ] Multiple devices can be switched

#### Practice Flow
- [ ] Lesson loads correctly
- [ ] Notes scroll at correct speed
- [ ] Hits register with correct timing
- [ ] Score updates in real-time
- [ ] Session completes properly

#### Practice Modes
- [ ] Tempo slider works (50%-150%)
- [ ] A-B loop sets and loops correctly
- [ ] Count-in plays before start
- [ ] Part isolation filters notes
- [ ] No-fail mode continues on miss
- [ ] Wait mode pauses on each note
- [ ] Metronome plays in time

#### PWA / Offline
- [ ] Install prompt appears
- [ ] App installs to desktop/home screen
- [ ] Works offline after first load
- [ ] Lessons cached and playable offline
- [ ] Settings persist across sessions

#### Cross-Browser
- [ ] Chrome: Full functionality
- [ ] Edge: Full functionality
- [ ] Firefox (with flag): Basic MIDI works

---

## Remaining Implementation Tasks

I'll continue with detailed tasks for:

### Phase 1 Remaining
- Task 1.8: MIDI File Parser
- Task 1.9: Audio Engine (Tone.js)
- Task 1.10: Note Highway Canvas Component
- Task 1.11: Basic Practice Page

### Phase 2
- Task 2.1: Tempo Adjustment
- Task 2.2: A-B Loop
- Task 2.3: Count-In
- Task 2.4: Part Isolation
- Task 2.5: No-Fail Mode
- Task 2.6: Wait Mode
- Task 2.7: Metronome
- Task 2.8: Theme System
- Task 2.9: PWA Configuration
- Task 2.10: IndexedDB Storage
- Task 2.11: Create Starter Lessons
- Task 2.12: Audio-to-MIDI Conversion

### Phase 3
- Task 3.1: Polish & Animations
- Task 3.2: Settings UI
- Task 3.3: Progress Dashboard
- Task 3.4: Final Testing
- Task 3.5: Build & Deploy

---

## Quick Reference: Key Commands

```bash
# Development
npm run dev              # Start dev server
npm run check            # TypeScript check
npm run test:run         # Run all tests
npm run test             # Watch mode tests

# Building
npm run build            # Production build
npm run preview          # Preview build locally

# Deployment
# Copy build/ contents to your /drums directory
```

---

## Next Steps

To continue implementation, ask Claude Code to:

1. **"Implement Task 1.8: MIDI File Parser"**
2. **"Implement Task 1.9: Audio Engine"**
3. **"Implement the Note Highway component"**

Or request the complete implementation of any specific task.

---

*Document Version: 1.0*
*Optimized for Claude Code execution*
