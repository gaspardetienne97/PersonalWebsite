# Finger Drumming App - Implementation Plan Part 2

## Continued from Part 1

---

### Task 1.8: MIDI File Parser

**Objective**: Parse standard MIDI files into our lesson format.

**File: `src/lib/midi/MidiParser.ts`**
```typescript
import { Midi } from '@tonejs/midi';
import type { Lesson, LessonNote } from '$types';

export interface ParseOptions {
  trackIndex?: number;        // Specific track to use (default: auto-detect drums)
  channel?: number;           // Filter to specific channel (default: 10 for drums)
  quantize?: number;          // Quantize to ms (optional)
}

export interface ParsedMidi {
  name: string;
  tempo: number;
  timeSignature: [number, number];
  duration: number;
  tracks: {
    index: number;
    name: string;
    channel: number;
    noteCount: number;
  }[];
  notes: LessonNote[];
}

export class MidiParser {
  /**
   * Parse MIDI file from ArrayBuffer
   */
  static parse(buffer: ArrayBuffer, options: ParseOptions = {}): ParsedMidi {
    const midi = new Midi(buffer);
    
    // Get tempo
    const tempo = midi.header.tempos.length > 0 
      ? Math.round(midi.header.tempos[0].bpm)
      : 120;
    
    // Get time signature
    const timeSignature: [number, number] = midi.header.timeSignatures.length > 0
      ? [
          midi.header.timeSignatures[0].timeSignature[0],
          midi.header.timeSignatures[0].timeSignature[1]
        ]
      : [4, 4];
    
    // Collect track info
    const tracks = midi.tracks.map((track, index) => ({
      index,
      name: track.name || `Track ${index + 1}`,
      channel: track.channel,
      noteCount: track.notes.length
    }));
    
    // Find drum track(s)
    let targetTracks = midi.tracks;
    
    if (options.trackIndex !== undefined) {
      targetTracks = [midi.tracks[options.trackIndex]];
    } else if (options.channel !== undefined) {
      targetTracks = midi.tracks.filter(t => t.channel === options.channel - 1);
    } else {
      // Auto-detect: prefer channel 10 (drums), otherwise use all
      const drumTracks = midi.tracks.filter(t => t.channel === 9);
      if (drumTracks.length > 0) {
        targetTracks = drumTracks;
      }
    }
    
    // Collect notes
    const notes: LessonNote[] = [];
    
    for (const track of targetTracks) {
      for (const note of track.notes) {
        let timeMs = note.time * 1000;
        
        // Optional quantization
        if (options.quantize) {
          timeMs = Math.round(timeMs / options.quantize) * options.quantize;
        }
        
        notes.push({
          time: Math.round(timeMs),
          note: note.midi,
          velocity: Math.round(note.velocity * 127),
          duration: Math.round(note.duration * 1000)
        });
      }
    }
    
    // Sort by time
    notes.sort((a, b) => a.time - b.time);
    
    // Calculate duration
    const duration = notes.length > 0
      ? notes[notes.length - 1].time + notes[notes.length - 1].duration
      : 0;
    
    return {
      name: midi.name || 'Untitled',
      tempo,
      timeSignature,
      duration,
      tracks,
      notes
    };
  }
  
  /**
   * Load and parse MIDI file from URL
   */
  static async loadFromUrl(url: string, options?: ParseOptions): Promise<ParsedMidi> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load MIDI file: ${response.status}`);
    }
    const buffer = await response.arrayBuffer();
    return this.parse(buffer, options);
  }
  
  /**
   * Load and parse MIDI file from File input
   */
  static async loadFromFile(file: File, options?: ParseOptions): Promise<ParsedMidi> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = () => {
        try {
          const result = this.parse(reader.result as ArrayBuffer, options);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }
  
  /**
   * Convert ParsedMidi to Lesson format
   */
  static toLesson(parsed: ParsedMidi, metadata: Partial<Lesson> = {}): Lesson {
    return {
      id: metadata.id || `imported-${Date.now()}`,
      version: 1,
      title: metadata.title || parsed.name,
      description: metadata.description || 'Imported MIDI file',
      author: metadata.author || 'Unknown',
      difficulty: metadata.difficulty || 'intermediate',
      genre: metadata.genre || 'unknown',
      tags: metadata.tags || ['imported'],
      bpm: parsed.tempo,
      timeSignature: parsed.timeSignature,
      duration: parsed.duration,
      tips: metadata.tips || [],
      notes: parsed.notes,
      ...metadata
    };
  }
}
```

**Test File: `src/lib/midi/MidiParser.test.ts`**
```typescript
import { describe, it, expect } from 'vitest';
import { MidiParser } from './MidiParser';

// Note: For full testing, you'd need actual MIDI file fixtures
describe('MidiParser', () => {
  describe('toLesson', () => {
    it('should convert parsed MIDI to lesson format', () => {
      const parsed = {
        name: 'Test Track',
        tempo: 120,
        timeSignature: [4, 4] as [number, number],
        duration: 10000,
        tracks: [],
        notes: [
          { time: 0, note: 36, velocity: 100, duration: 100 }
        ]
      };
      
      const lesson = MidiParser.toLesson(parsed, {
        title: 'Custom Title',
        difficulty: 'beginner'
      });
      
      expect(lesson.title).toBe('Custom Title');
      expect(lesson.difficulty).toBe('beginner');
      expect(lesson.bpm).toBe(120);
      expect(lesson.notes.length).toBe(1);
    });
  });
});
```

**Validation**:
```bash
npm run test:run
npm run check
```

**Manual Test**: Create a test page to load MIDI files.

**File: `src/routes/test/midi-parser/+page.svelte`**
```svelte
<script lang="ts">
  import { MidiParser } from '$midi/MidiParser';
  import type { ParsedMidi } from '$midi/MidiParser';
  
  let parsed: ParsedMidi | null = null;
  let error: string | null = null;
  
  async function handleFile(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    try {
      error = null;
      parsed = await MidiParser.loadFromFile(file);
    } catch (e) {
      error = String(e);
      parsed = null;
    }
  }
</script>

<div class="p-8 max-w-4xl mx-auto">
  <h1 class="text-2xl font-bold mb-6">MIDI Parser Test</h1>
  
  <div class="mb-6">
    <input 
      type="file" 
      accept=".mid,.midi"
      on:change={handleFile}
      class="bg-bg-secondary p-2 rounded"
    />
  </div>
  
  {#if error}
    <div class="bg-red-900/50 border border-red-500 p-4 rounded mb-6">
      <p class="text-red-200">{error}</p>
    </div>
  {/if}
  
  {#if parsed}
    <div class="space-y-4">
      <div class="bg-bg-secondary p-4 rounded">
        <h2 class="font-semibold mb-2">File Info</h2>
        <p>Name: {parsed.name}</p>
        <p>Tempo: {parsed.tempo} BPM</p>
        <p>Time Signature: {parsed.timeSignature[0]}/{parsed.timeSignature[1]}</p>
        <p>Duration: {(parsed.duration / 1000).toFixed(1)}s</p>
        <p>Total Notes: {parsed.notes.length}</p>
      </div>
      
      <div class="bg-bg-secondary p-4 rounded">
        <h2 class="font-semibold mb-2">Tracks</h2>
        {#each parsed.tracks as track}
          <p>Track {track.index}: {track.name} (Ch: {track.channel + 1}, Notes: {track.noteCount})</p>
        {/each}
      </div>
      
      <div class="bg-bg-secondary p-4 rounded">
        <h2 class="font-semibold mb-2">First 20 Notes</h2>
        <div class="font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
          {#each parsed.notes.slice(0, 20) as note}
            <div>
              Time: {note.time}ms | Note: {note.note} | Vel: {note.velocity} | Dur: {note.duration}ms
            </div>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>
```

**Manual Validation**:
1. Go to `http://localhost:5173/test/midi-parser`
2. Load a .mid file
3. Verify file info, tracks, and notes display correctly

**Checkpoint**: ✅ MIDI files parse correctly

---

### Task 1.9: Audio Engine

**Objective**: Set up Tone.js for sample playback and transport.

**File: `src/lib/audio/AudioEngine.ts`**
```typescript
import * as Tone from 'tone';

export interface DrumSample {
  note: number;
  name: string;
  url: string;
}

export interface AudioEngineState {
  isInitialized: boolean;
  isPlaying: boolean;
  currentTime: number;
  tempo: number;
}

class AudioEngine {
  private sampler: Tone.Sampler | null = null;
  private metronome: Tone.Synth | null = null;
  private metronomePart: Tone.Part | null = null;
  private isInitialized = false;
  private samples: Map<number, Tone.Player> = new Map();
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Start audio context (requires user gesture)
    await Tone.start();
    
    // Create metronome synth
    this.metronome = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: {
        attack: 0.001,
        decay: 0.1,
        sustain: 0,
        release: 0.1
      }
    }).toDestination();
    
    this.isInitialized = true;
    console.log('Audio engine initialized');
  }
  
  /**
   * Load drum samples from URL map
   */
  async loadSamples(samples: DrumSample[]): Promise<void> {
    await this.initialize();
    
    // Clear existing
    this.samples.forEach(p => p.dispose());
    this.samples.clear();
    
    // Load new samples
    const loadPromises = samples.map(async (sample) => {
      const player = new Tone.Player(sample.url).toDestination();
      await Tone.loaded();
      this.samples.set(sample.note, player);
    });
    
    await Promise.all(loadPromises);
    console.log(`Loaded ${samples.length} drum samples`);
  }
  
  /**
   * Trigger a drum sample
   */
  triggerDrum(note: number, velocity: number = 100, time?: number): void {
    const player = this.samples.get(note);
    if (!player) {
      console.warn(`No sample loaded for note ${note}`);
      return;
    }
    
    // Normalize velocity to 0-1
    const normalizedVelocity = Math.min(1, Math.max(0, velocity / 127));
    player.volume.value = Tone.gainToDb(normalizedVelocity);
    
    if (player.loaded) {
      player.start(time);
    }
  }
  
  /**
   * Play metronome click
   */
  playClick(accent: boolean = false, time?: number): void {
    if (!this.metronome) return;
    
    const freq = accent ? 1000 : 800;
    const velocity = accent ? 0.5 : 0.3;
    
    this.metronome.triggerAttackRelease(freq, '32n', time, velocity);
  }
  
  /**
   * Start metronome at given tempo
   */
  startMetronome(bpm: number, timeSignature: [number, number] = [4, 4]): void {
    this.stopMetronome();
    
    Tone.getTransport().bpm.value = bpm;
    
    const [beats] = timeSignature;
    const events: { time: string; accent: boolean }[] = [];
    
    for (let i = 0; i < beats; i++) {
      events.push({
        time: `0:${i}:0`,
        accent: i === 0
      });
    }
    
    this.metronomePart = new Tone.Part((time, event) => {
      this.playClick(event.accent, time);
    }, events);
    
    this.metronomePart.loop = true;
    this.metronomePart.loopEnd = '1m';
    this.metronomePart.start(0);
    
    Tone.getTransport().start();
  }
  
  /**
   * Stop metronome
   */
  stopMetronome(): void {
    if (this.metronomePart) {
      this.metronomePart.stop();
      this.metronomePart.dispose();
      this.metronomePart = null;
    }
    Tone.getTransport().stop();
  }
  
  /**
   * Set master volume (0-100)
   */
  setMasterVolume(volume: number): void {
    const db = volume === 0 ? -Infinity : Tone.gainToDb(volume / 100);
    Tone.getDestination().volume.value = db;
  }
  
  /**
   * Get current transport time in seconds
   */
  getCurrentTime(): number {
    return Tone.getTransport().seconds;
  }
  
  /**
   * Set transport tempo
   */
  setTempo(bpm: number): void {
    Tone.getTransport().bpm.value = bpm;
  }
  
  /**
   * Dispose all resources
   */
  dispose(): void {
    this.stopMetronome();
    this.sampler?.dispose();
    this.metronome?.dispose();
    this.samples.forEach(p => p.dispose());
    this.samples.clear();
    this.isInitialized = false;
  }
}

// Singleton
export const audioEngine = new AudioEngine();
```

**File: `src/lib/audio/index.ts`**
```typescript
export * from './AudioEngine';
```

**Test Page: `src/routes/test/audio/+page.svelte`**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { audioEngine } from '$audio/AudioEngine';
  
  let isInitialized = false;
  let metronomeRunning = false;
  let bpm = 120;
  
  async function init() {
    await audioEngine.initialize();
    
    // Load some test samples (you'd replace these with real URLs)
    // For now, we'll just test the metronome
    isInitialized = true;
  }
  
  function toggleMetronome() {
    if (metronomeRunning) {
      audioEngine.stopMetronome();
    } else {
      audioEngine.startMetronome(bpm);
    }
    metronomeRunning = !metronomeRunning;
  }
  
  function testClick() {
    audioEngine.playClick(true);
  }
</script>

<div class="p-8 max-w-md mx-auto">
  <h1 class="text-2xl font-bold mb-6">Audio Engine Test</h1>
  
  {#if !isInitialized}
    <button 
      class="bg-accent px-4 py-2 rounded"
      on:click={init}
    >
      Initialize Audio (Click to Start)
    </button>
  {:else}
    <div class="space-y-4">
      <p class="text-hit-perfect">✓ Audio initialized</p>
      
      <div class="bg-bg-secondary p-4 rounded">
        <h2 class="font-semibold mb-2">Metronome</h2>
        
        <div class="flex items-center gap-4 mb-4">
          <label>
            BPM:
            <input 
              type="number" 
              bind:value={bpm}
              min="40"
              max="240"
              class="bg-bg-tertiary px-2 py-1 rounded w-20 ml-2"
            />
          </label>
        </div>
        
        <div class="flex gap-2">
          <button 
            class="bg-accent px-4 py-2 rounded"
            on:click={toggleMetronome}
          >
            {metronomeRunning ? 'Stop' : 'Start'} Metronome
          </button>
          
          <button 
            class="bg-bg-tertiary px-4 py-2 rounded"
            on:click={testClick}
          >
            Single Click
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>
```

**Manual Validation**:
1. Go to `http://localhost:5173/test/audio`
2. Click "Initialize Audio"
3. Click "Single Click" - should hear a beep
4. Start metronome - should hear steady clicks at BPM
5. Adjust BPM and restart - tempo should change

**Checkpoint**: ✅ Audio engine works, metronome plays

---

### Task 1.10: Note Highway Component

**Objective**: Create the Canvas-based scrolling note display.

**File: `src/lib/components/NoteHighway.svelte`**
```svelte
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { LessonNote, NoteResult, HitStatus } from '$types';
  import { settings } from '$stores';
  
  // Props
  export let notes: LessonNote[] = [];
  export let currentTime: number = 0;
  export let lookAhead: number = 2000;
  export let results: Map<number, NoteResult> = new Map();
  export let partsEnabled = {
    kick: true,
    snare: true,
    hihat: true,
    toms: true,
    cymbals: true,
    percussion: true
  };
  
  // Canvas
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  let animationFrame: number;
  let width = 800;
  let height = 500;
  
  // Constants
  const HIT_LINE_Y_RATIO = 0.85;
  const PAD_SIZE = 50;
  const PAD_GAP = 8;
  const COLUMNS = 4;
  
  // Color mapping for feedback
  const statusColors: Record<HitStatus, string> = {
    perfect: '#00ff88',
    good: '#88ff00',
    early: '#ffaa00',
    late: '#ff8800',
    miss: '#ff0044'
  };
  
  // Default pad colors
  const padColors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
    '#BB8FCE', '#85C1E9', '#F8B500', '#00CED1',
    '#FF69B4', '#7FFFD4', '#FFD700', '#00FA9A'
  ];
  
  // Note to column mapping (simplified - maps note to column 0-3)
  function getNoteColumn(note: number): number {
    // Group drums by type
    if ([35, 36].includes(note)) return 0;        // Kicks
    if ([38, 40, 37, 39].includes(note)) return 1; // Snares/claps
    if ([42, 44, 46].includes(note)) return 2;    // Hi-hats
    return 3;                                      // Everything else (toms, cymbals)
  }
  
  // Note to color mapping
  function getNoteColor(note: number): string {
    const col = getNoteColumn(note);
    return padColors[col];
  }
  
  // Check if note is in enabled parts
  function isNoteEnabled(note: number): boolean {
    if ([35, 36].includes(note)) return partsEnabled.kick;
    if ([38, 40, 37, 39].includes(note)) return partsEnabled.snare;
    if ([42, 44, 46].includes(note)) return partsEnabled.hihat;
    if ([41, 43, 45, 47, 48, 50].includes(note)) return partsEnabled.toms;
    if ([49, 51, 52, 53, 55, 57, 59].includes(note)) return partsEnabled.cymbals;
    return partsEnabled.percussion;
  }
  
  onMount(() => {
    ctx = canvas.getContext('2d')!;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    startRenderLoop();
  });
  
  onDestroy(() => {
    window.removeEventListener('resize', resizeCanvas);
    if (animationFrame) {
      cancelAnimationFrame(animationFrame);
    }
  });
  
  function resizeCanvas() {
    const container = canvas.parentElement;
    if (container) {
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = width;
      canvas.height = height;
    }
  }
  
  function startRenderLoop() {
    function render() {
      draw();
      animationFrame = requestAnimationFrame(render);
    }
    render();
  }
  
  function draw() {
    if (!ctx) return;
    
    const hitLineY = height * HIT_LINE_Y_RATIO;
    const laneWidth = (PAD_SIZE + PAD_GAP);
    const startX = (width - COLUMNS * laneWidth) / 2;
    
    // Clear
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);
    
    // Draw lane lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= COLUMNS; i++) {
      ctx.beginPath();
      ctx.moveTo(startX + i * laneWidth - PAD_GAP/2, 0);
      ctx.lineTo(startX + i * laneWidth - PAD_GAP/2, height);
      ctx.stroke();
    }
    
    // Draw hit line
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX - 20, hitLineY);
    ctx.lineTo(startX + COLUMNS * laneWidth + 20, hitLineY);
    ctx.stroke();
    
    // Draw hit zone glow
    const gradient = ctx.createLinearGradient(0, hitLineY - 30, 0, hitLineY + 30);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0)');
    gradient.addColorStop(0.5, 'rgba(99, 102, 241, 0.3)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(startX - 20, hitLineY - 30, COLUMNS * laneWidth + 40, 60);
    
    // Draw notes
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      const relativeTime = note.time - currentTime;
      
      // Skip notes outside visible range
      if (relativeTime < -500 || relativeTime > lookAhead) continue;
      
      // Check if note is in enabled parts
      const enabled = isNoteEnabled(note.note);
      
      // Calculate position
      const progress = 1 - (relativeTime / lookAhead);
      const y = progress * hitLineY;
      const col = getNoteColumn(note.note);
      const x = startX + col * laneWidth;
      
      // Get result if exists
      const result = results.get(i);
      
      // Draw note
      drawNote(x, y, note, enabled, result);
    }
    
    // Draw column indicators at hit line
    for (let i = 0; i < COLUMNS; i++) {
      const x = startX + i * laneWidth;
      ctx.fillStyle = `${padColors[i]}40`;
      ctx.beginPath();
      ctx.arc(x + PAD_SIZE/2, hitLineY, PAD_SIZE/2 + 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  function drawNote(
    x: number, 
    y: number, 
    note: LessonNote,
    enabled: boolean,
    result?: NoteResult
  ) {
    const size = PAD_SIZE;
    const noteHeight = 15 + (note.velocity / 127) * 15;
    
    // Determine color
    let color = getNoteColor(note.note);
    let alpha = enabled ? 'cc' : '44';
    
    if (result) {
      color = statusColors[result.status];
      alpha = 'ff';
    }
    
    // Draw note rectangle
    ctx.fillStyle = color + alpha;
    ctx.beginPath();
    roundRect(ctx, x, y - noteHeight/2, size, noteHeight, 4);
    ctx.fill();
    
    // Draw border
    ctx.strokeStyle = color;
    ctx.lineWidth = enabled ? 2 : 1;
    ctx.stroke();
    
    // Draw glow for recent hits
    if (result && result.status !== 'miss') {
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }
  
  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number, y: number,
    w: number, h: number,
    r: number
  ) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
  }
</script>

<div class="w-full h-full min-h-[400px]">
  <canvas 
    bind:this={canvas}
    class="w-full h-full rounded-lg"
  />
</div>
```

**Test Page: `src/routes/test/highway/+page.svelte`**
```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import NoteHighway from '$components/NoteHighway.svelte';
  import type { LessonNote, NoteResult } from '$types';
  
  // Generate test notes
  const testNotes: LessonNote[] = [];
  for (let i = 0; i < 32; i++) {
    // Kick on 1 and 3
    testNotes.push({ time: i * 500, note: 36, velocity: 100, duration: 50 });
    // Snare on 2 and 4
    testNotes.push({ time: i * 500 + 250, note: 38, velocity: 80, duration: 50 });
    // Hi-hat on every 8th
    testNotes.push({ time: i * 500, note: 42, velocity: 60, duration: 50 });
    testNotes.push({ time: i * 500 + 125, note: 42, velocity: 40, duration: 50 });
    testNotes.push({ time: i * 500 + 250, note: 42, velocity: 60, duration: 50 });
    testNotes.push({ time: i * 500 + 375, note: 42, velocity: 40, duration: 50 });
  }
  
  let currentTime = 0;
  let isPlaying = false;
  let results: Map<number, NoteResult> = new Map();
  let startTimestamp = 0;
  let animationFrame: number;
  
  function togglePlayback() {
    if (isPlaying) {
      cancelAnimationFrame(animationFrame);
      isPlaying = false;
    } else {
      startTimestamp = performance.now() - currentTime;
      isPlaying = true;
      update();
    }
  }
  
  function update() {
    currentTime = performance.now() - startTimestamp;
    
    if (currentTime >= testNotes[testNotes.length - 1].time + 2000) {
      isPlaying = false;
      return;
    }
    
    animationFrame = requestAnimationFrame(update);
  }
  
  function reset() {
    cancelAnimationFrame(animationFrame);
    isPlaying = false;
    currentTime = 0;
    results.clear();
    results = results;
  }
  
  // Simulate some hits
  function simulateHit(status: 'perfect' | 'good' | 'miss') {
    const noteIndex = Math.floor(currentTime / 125);
    if (noteIndex < testNotes.length && !results.has(noteIndex)) {
      results.set(noteIndex, {
        expectedTime: testNotes[noteIndex].time,
        expectedNote: testNotes[noteIndex].note,
        expectedVelocity: testNotes[noteIndex].velocity,
        actualTime: currentTime,
        actualNote: testNotes[noteIndex].note,
        actualVelocity: 100,
        timingOffset: 0,
        velocityDiff: 0,
        status,
        points: status === 'perfect' ? 100 : status === 'good' ? 80 : 0
      });
      results = results;
    }
  }
</script>

<div class="p-8">
  <h1 class="text-2xl font-bold mb-4">Note Highway Test</h1>
  
  <div class="mb-4 flex gap-2">
    <button 
      class="bg-accent px-4 py-2 rounded"
      on:click={togglePlayback}
    >
      {isPlaying ? 'Pause' : 'Play'}
    </button>
    <button 
      class="bg-bg-secondary px-4 py-2 rounded"
      on:click={reset}
    >
      Reset
    </button>
    <button 
      class="bg-hit-perfect text-black px-4 py-2 rounded"
      on:click={() => simulateHit('perfect')}
    >
      Simulate Perfect
    </button>
    <button 
      class="bg-hit-good text-black px-4 py-2 rounded"
      on:click={() => simulateHit('good')}
    >
      Simulate Good
    </button>
    <button 
      class="bg-hit-miss px-4 py-2 rounded"
      on:click={() => simulateHit('miss')}
    >
      Simulate Miss
    </button>
  </div>
  
  <p class="mb-4">Time: {(currentTime / 1000).toFixed(2)}s</p>
  
  <div class="bg-bg-secondary rounded-lg h-[500px]">
    <NoteHighway 
      notes={testNotes}
      {currentTime}
      lookAhead={2000}
      {results}
    />
  </div>
</div>
```

**Manual Validation**:
1. Go to `http://localhost:5173/test/highway`
2. Click "Play" - notes should scroll down
3. Click "Simulate Perfect/Good/Miss" - notes should change color
4. Verify smooth animation

**Checkpoint**: ✅ Note highway renders and animates

---

## Remaining Tasks Quick Reference

### Phase 1 Completion
- **Task 1.11**: Main Practice Page (integrate all components)

### Phase 2: Features
| Task | Component | Est. Time |
|------|-----------|-----------|
| 2.1 | Tempo slider | 2 hours |
| 2.2 | A-B loop | 3 hours |
| 2.3 | Count-in | 2 hours |
| 2.4 | Part isolation | 2 hours |
| 2.5 | No-fail mode | 1 hour |
| 2.6 | Wait mode | 3 hours |
| 2.7 | Metronome overlay | 2 hours |
| 2.8 | Theme system | 4 hours |
| 2.9 | PWA setup | 3 hours |
| 2.10 | IndexedDB | 4 hours |
| 2.11 | Starter lessons | 6 hours |
| 2.12 | Audio-to-MIDI | 8+ hours |

### Phase 3: Polish
| Task | Component | Est. Time |
|------|-----------|-----------|
| 3.1 | Animations | 4 hours |
| 3.2 | Settings UI | 4 hours |
| 3.3 | Progress dashboard | 4 hours |
| 3.4 | Final testing | 6 hours |
| 3.5 | Build & deploy | 2 hours |

---

## Test Commands Cheat Sheet

```bash
# Run all tests
npm run test:run

# Watch mode
npm run test

# Type checking
npm run check

# Dev server
npm run dev

# Build
npm run build

# Preview build
npm run preview
```

---

## Manual Testing Checklist

### After Each Task
- [ ] `npm run check` passes
- [ ] `npm run test:run` passes
- [ ] Component renders without console errors
- [ ] Feature works as expected in browser

### Before Phase Completion
- [ ] All tasks in phase complete
- [ ] Integration test with real MIDI controller
- [ ] Test in Chrome and Edge
- [ ] No memory leaks (check DevTools Performance tab)

---

*Part 2 of Implementation Plan*
*Continue with "Implement Task X.X" commands*
