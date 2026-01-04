# Finger Drumming Practice Application - Product Plan

## Executive Summary

Building a web-based finger drumming practice application inspired by **Melodics** and **Quest for Groove**. The application will enable users to practice finger drumming with real-time MIDI input validation, visual feedback, and progressive learning paths.

---

## Research Summary

### Melodics - Key Features Analyzed

| Feature | Implementation Details |
|---------|----------------------|
| **MIDI Device Recognition** | Uses SysEx to identify devices and auto-configure controls |
| **Real-time Feedback** | Green (correct), Orange (early), Red (missed) visual indicators |
| **Lesson Format** | MIDI-based lessons that compare user performance to reference MIDI |
| **Guitar Hero-style UI** | Scrolling note display showing upcoming notes |
| **Timing Analysis** | Measures accuracy across 32-64 measure phrases |
| **Progress Tracking** | Scores, streaks, achievements, levels |
| **Practice Mode** | Loop sections, adjustable BPM, difficulty levels |
| **Device Compatibility** | Works with any MIDI controller, custom remapping available |

### Quest for Groove - Key Differentiators

| Feature | Value Proposition |
|---------|------------------|
| **4x4 Pad Layout System** | Standardized drum mapping for realistic drumming |
| **Curriculum Structure** | Progressive skill-building from basics to advanced |
| **Backing Tracks** | Play along with music, not just click tracks |
| **Sheet Music Integration** | Optional notation for theory learners |
| **Technique Focus** | Moeller technique, ghost notes, dynamics |
| **Velocity Curves** | Emphasis on dynamics and feel, not just timing |

### Critical Technical Insights from Research

1. **Latency is Critical**: Users report issues with latency in Melodics. Buffer size of 64-128 samples recommended
2. **Browser Support**: Chrome/Edge fully support Web MIDI. Safari does NOT (Apple declined implementation citing fingerprinting concerns)
3. **MPC One Controller Mode**: Sends MIDI via USB when in Controller Mode - requires MPC drivers installed
4. **Timestamps**: Web MIDI API provides high-resolution timestamps for accurate timing comparison

---

## Core Feature Requirements

### Phase 1: Foundation (MVP)

#### 1.1 MIDI Controller Connection & Recognition
```
Priority: CRITICAL
Complexity: Medium
```

**Requirements:**
- Enumerate all connected MIDI devices
- Auto-detect Akai MPC One/Live/X and other common controllers
- Display device name, manufacturer, input/output ports
- Handle hot-plug/unplug events
- Store device configuration preferences
- Support custom MIDI mapping for non-standard layouts
- Fallback message for Safari/Firefox users

**Technical Approach:**
```typescript
// Web MIDI API flow
navigator.requestMIDIAccess({ sysex: true })
  .then(onMIDISuccess)
  .catch(onMIDIFailure);
```

#### 1.2 Real-time MIDI Input Processing
```
Priority: CRITICAL
Complexity: High
```

**Requirements:**
- Capture Note On/Off events with velocity
- Sub-10ms processing latency target
- High-resolution timestamp recording (performance.now())
- MIDI message parsing (Note, CC, etc.)
- Support for drum channel (Channel 10) and custom mappings
- Visual pad activation feedback

**Latency Mitigation Strategies:**
1. Use Web Workers for MIDI processing
2. Minimize DOM updates during performance
3. Use requestAnimationFrame for visual updates
4. Pre-load all audio samples
5. Use AudioWorklet for audio playback

#### 1.3 Track Loading & Playback Engine
```
Priority: CRITICAL
Complexity: High
```

**Requirements:**
- Parse Standard MIDI File (.mid) format
- Parse JSON-based lesson format (custom)
- Tempo/BPM handling with time signature support
- Transport controls (play, pause, stop, loop)
- Visual metronome with count-in option
- Adjustable playback speed (50%-150%)
- Section looping (A-B repeat)

#### 1.4 Performance Validation Engine
```
Priority: CRITICAL
Complexity: High
```

**Requirements:**
- Compare user input against reference MIDI
- Configurable timing tolerance window (e.g., ±50ms)
- Configurable note matching (exact vs. any drum hit)
- Real-time accuracy calculation
- Track statistics: hits, misses, early, late
- Velocity accuracy scoring (optional)

**Scoring Algorithm:**
```typescript
interface NoteValidation {
  expected: MIDINote;
  actual: MIDINote | null;
  timingOffset: number; // ms difference
  status: 'hit' | 'early' | 'late' | 'miss';
  velocityAccuracy: number; // 0-100%
}
```

### Phase 2: User Experience

#### 2.1 Visual Note Display (Guitar Hero Style)
```
Priority: HIGH
Complexity: Medium
```

**Requirements:**
- Scrolling note highway (vertical or horizontal)
- Color-coded pads matching controller layout
- Timing indicator line
- Real-time hit/miss visual feedback
- Note size based on velocity (optional)
- Support for different pad layouts (4x4, 8x8)

**Implementation Options:**
1. Canvas 2D (recommended for performance)
2. SVG (better for static elements)
3. WebGL (for 3D effects, overkill for MVP)

#### 2.2 Audio Playback System
```
Priority: HIGH
Complexity: Medium
```

**Requirements:**
- Play backing track audio (MP3/WAV)
- Trigger drum samples on user input
- Low-latency sample playback
- Volume mixing (backing track vs. drums)
- Metronome click option

**Tech Stack:**
- Tone.js for audio scheduling and syncing
- WebAudioFont for GM drum sounds
- Or: Custom sample loading with Web Audio API

#### 2.3 Progress & Statistics Dashboard
```
Priority: MEDIUM
Complexity: Low
```

**Requirements:**
- Session accuracy score
- Historical progress charts
- Practice time tracking
- Streaks and achievements
- Per-lesson performance history

### Phase 3: Content & Advanced Features

#### 3.1 Lesson/Track Management
```
Priority: MEDIUM
Complexity: Medium
```

**Requirements:**
- Upload custom MIDI files
- Browse lesson library
- Difficulty categorization
- Genre/style filtering
- Favorites/playlists

#### 3.2 Audio-to-MIDI Conversion (Bonus Feature)
```
Priority: LOW (Complex)
Complexity: VERY HIGH
```

**Technical Approaches:**
1. **Client-side ML**: Use TensorFlow.js with pre-trained model
2. **Server-side Processing**: Send audio to backend, use Spleeter for stem separation + onset detection
3. **External API**: Integrate with services like Spotify's Audio Analysis API or use cloud ML

**Recommended Stack:**
- **Drum Separation**: Spleeter (Python) or Demucs for isolating drums
- **Onset Detection**: librosa or madmom (Python)
- **Transcription**: Magenta's Onsets and Frames model

**MVP Alternative**: Allow users to upload MIDI files directly, defer audio conversion to later phase

#### 3.3 Multiplayer/Social Features
```
Priority: LOW
Complexity: High
```

**Future Considerations:**
- Share scores/recordings
- Challenges between users
- Leaderboards
- Community lesson sharing

---

## Recommended Tech Stack

### Frontend
| Technology | Purpose | Rationale |
|------------|---------|-----------|
| **SvelteKit** | Framework | Fast, reactive, excellent for real-time UI, smaller bundle |
| **TypeScript** | Language | Type safety for complex MIDI/audio logic |
| **Tailwind CSS** | Styling | Rapid UI development, consistent design |
| **Canvas API** | Note Display | Best performance for scrolling graphics |

### Audio/MIDI Libraries
| Library | Purpose |
|---------|---------|
| **WebMidi.js v3** or **MIDIVal** | High-level MIDI abstraction with TypeScript support |
| **Tone.js** | Audio scheduling, transport, effects |
| **@tonejs/midi** | MIDI file parsing |
| **WebAudioFont** | GM drum sample playback |

### Backend (Optional for MVP)
| Technology | Purpose |
|------------|---------|
| **SvelteKit API Routes** | Simple backend endpoints |
| **SQLite/Turso** | Lightweight database for progress |
| **Supabase** | Auth + Database if needed |

### Audio Processing (Phase 3)
| Technology | Purpose |
|------------|---------|
| **Python + FastAPI** | Backend for audio processing |
| **Spleeter/Demucs** | Audio stem separation |
| **Madmom** | Beat/onset detection |
| **TensorFlow.js** | Optional client-side ML |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Browser (Chrome/Edge)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │  MIDI Input  │    │  Audio       │    │  UI/Visual   │       │
│  │  Service     │    │  Engine      │    │  Renderer    │       │
│  │  (WebMidi.js)│    │  (Tone.js)   │    │  (Canvas)    │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              Svelte Stores (Reactive State)          │       │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │       │
│  │  │ Device  │ │ Session │ │ Track   │ │ Score   │   │       │
│  │  │ Store   │ │ Store   │ │ Store   │ │ Store   │   │       │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘   │       │
│  └─────────────────────────────────────────────────────┘       │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────────────────────────────────┐       │
│  │              Validation Engine                        │       │
│  │  - Note matching    - Timing analysis                │       │
│  │  - Score calculation - Statistics                    │       │
│  └─────────────────────────────────────────────────────┘       │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Hardware Layer                               │
│  ┌────────────────┐                                             │
│  │  Akai MPC One  │◄──── USB ────► Computer                     │
│  │  (Controller   │                                             │
│  │   Mode)        │                                             │
│  └────────────────┘                                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## File/Folder Structure

```
finger-drumming-app/
├── src/
│   ├── lib/
│   │   ├── midi/
│   │   │   ├── MidiService.ts        # Web MIDI API wrapper
│   │   │   ├── MidiParser.ts         # MIDI file parsing
│   │   │   ├── DeviceManager.ts      # Device detection/config
│   │   │   └── MidiMapping.ts        # Pad-to-note mapping
│   │   ├── audio/
│   │   │   ├── AudioEngine.ts        # Tone.js wrapper
│   │   │   ├── SamplePlayer.ts       # Drum sample playback
│   │   │   ├── Metronome.ts          # Click track
│   │   │   └── Transport.ts          # Play/pause/tempo
│   │   ├── validation/
│   │   │   ├── ValidationEngine.ts   # Core scoring logic
│   │   │   ├── TimingAnalyzer.ts     # Timing accuracy
│   │   │   └── ScoreCalculator.ts    # Points/grades
│   │   ├── stores/
│   │   │   ├── deviceStore.ts        # Connected devices
│   │   │   ├── sessionStore.ts       # Current practice session
│   │   │   ├── trackStore.ts         # Loaded track/lesson
│   │   │   └── settingsStore.ts      # User preferences
│   │   ├── components/
│   │   │   ├── NoteHighway.svelte    # Scrolling note display
│   │   │   ├── PadGrid.svelte        # Visual pad representation
│   │   │   ├── TransportBar.svelte   # Play/pause/tempo controls
│   │   │   ├── ScoreDisplay.svelte   # Real-time score
│   │   │   ├── DeviceSelector.svelte # MIDI device picker
│   │   │   └── SettingsPanel.svelte  # Configuration
│   │   └── types/
│   │       ├── midi.ts               # MIDI-related types
│   │       ├── lesson.ts             # Lesson/track types
│   │       └── score.ts              # Scoring types
│   ├── routes/
│   │   ├── +page.svelte              # Home/dashboard
│   │   ├── practice/
│   │   │   └── +page.svelte          # Main practice view
│   │   ├── library/
│   │   │   └── +page.svelte          # Track/lesson browser
│   │   ├── progress/
│   │   │   └── +page.svelte          # Statistics/history
│   │   └── settings/
│   │       └── +page.svelte          # App settings
│   └── app.html
├── static/
│   ├── samples/                      # Drum samples
│   └── lessons/                      # Built-in lessons
├── package.json
├── svelte.config.js
├── tailwind.config.js
└── tsconfig.json
```

---

## Implementation Phases & Timeline

### Phase 1: MVP Foundation (4-6 weeks)

**Week 1-2: MIDI Infrastructure**
- [ ] Set up SvelteKit project with TypeScript
- [ ] Implement Web MIDI API connection
- [ ] Build device detection and selection UI
- [ ] Create MIDI message parser
- [ ] Implement Akai MPC One profile/mapping

**Week 3-4: Track System & Validation**
- [ ] Build MIDI file parser
- [ ] Create track loading system
- [ ] Implement validation engine
- [ ] Build basic scoring algorithm
- [ ] Add transport controls (play/pause/tempo)

**Week 5-6: Visual & Audio Feedback**
- [ ] Create Canvas-based note highway
- [ ] Implement hit/miss visual feedback
- [ ] Integrate Tone.js for audio
- [ ] Add drum sample playback
- [ ] Build basic metronome

### Phase 2: Polish & Features (4 weeks)

**Week 7-8: User Experience**
- [ ] Improve note highway animations
- [ ] Add practice mode features (loop, slow down)
- [ ] Build settings panel (mapping, sensitivity)
- [ ] Add keyboard fallback for testing
- [ ] Implement session statistics

**Week 9-10: Content & Progress**
- [ ] Create lesson file format
- [ ] Build lesson browser UI
- [ ] Implement progress tracking
- [ ] Add achievements/streaks
- [ ] Create 5-10 starter lessons

### Phase 3: Advanced Features (4+ weeks)

**Week 11-12: Audio-to-MIDI (Optional)**
- [ ] Research and prototype approach
- [ ] Implement backend processing service
- [ ] Build upload and processing UI
- [ ] Test with various audio sources

**Ongoing: Refinement**
- [ ] Performance optimization
- [ ] Additional device profiles
- [ ] Community features
- [ ] Mobile responsive design

---

## Key Technical Challenges & Solutions

### 1. Latency Management

**Challenge:** User expects immediate feedback when hitting a pad.

**Solutions:**
- Use `AudioWorklet` instead of `ScriptProcessorNode`
- Pre-buffer audio samples during app initialization
- Separate MIDI processing from UI rendering (Web Workers)
- Use `requestAnimationFrame` for visual updates
- Minimize Svelte reactivity overhead in hot paths

### 2. Timing Accuracy

**Challenge:** Comparing user input timing to reference track.

**Solutions:**
- Use `event.timeStamp` from MIDI events (high-resolution)
- Sync to `performance.now()` for audio scheduling
- Account for audio output latency with calibration option
- Store timing data in Int32Array for efficiency

### 3. Cross-Browser Compatibility

**Challenge:** Safari doesn't support Web MIDI API.

**Solutions:**
- Display clear browser requirement message
- Consider WebMIDI polyfill (Jazz-Plugin) as fallback
- Provide keyboard input mode for basic testing
- Target PWA for desktop app-like experience

### 4. MPC One Specific Integration

**Challenge:** MPC One requires Controller Mode and drivers.

**Solutions:**
- Document setup requirements clearly
- Test with MPC One in Controller Mode
- Support standard GM drum mapping
- Allow custom pad-to-note remapping
- Use SysEx to detect MPC-specific features (if applicable)

---

## Clarifying Questions for You

Before diving into implementation, I'd like to understand your requirements better:

### Scope & Priority
1. **Target Users**: Is this for personal use, or do you plan to offer it to others? (Affects polish level, auth needs)

2. **Browser Requirement**: Are you okay with Chrome/Edge only, or do you need Safari support (would require workarounds)?

3. **Offline Capability**: Should this work offline as a PWA, or always online?

### Content & Lessons
4. **Lesson Format**: Do you want to create your own lessons, import from Melodics, or both?

5. **Backing Tracks**: Should users be able to play along to audio backing tracks, or just MIDI/metronome?

6. **Audio-to-MIDI Priority**: How important is the audio conversion feature? (It's complex - could be Phase 3)

### Technical Preferences
7. **Database/Auth**: Do you need user accounts and cloud-saved progress, or is local storage sufficient?

8. **Deployment**: Where do you plan to host this? (Vercel, self-hosted, Electron desktop app?)

9. **Existing Assets**: Do you have MIDI files or lessons ready, or starting from scratch?

### Device Support
10. **Controller Priority**: Besides MPC One, which other controllers should we prioritize? (Maschine, Launchpad, etc.)

11. **Pad Layout**: Do you prefer the 4x4 Quest for Groove layout, or standard GM drum mapping?

### Features
12. **Velocity Scoring**: Should velocity/dynamics accuracy be scored, or just timing?

13. **Visual Style**: Preference for the interface? (Dark/light, minimalist, colorful like Melodics)

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Latency issues | Medium | High | Audio worklet, worker threads, calibration |
| Browser compatibility | Medium | Medium | Clear requirements, polyfills |
| MIDI device variations | Medium | Medium | Extensive mapping system, user testing |
| Audio-to-MIDI complexity | High | Low | Defer to later phase, use existing tools |
| Performance on long sessions | Low | Medium | Efficient data structures, memory management |

---

## Recommended Next Steps

1. **Answer clarifying questions** above to refine scope
2. **Set up development environment** with SvelteKit + TypeScript
3. **Create MIDI connection proof-of-concept** with your MPC One
4. **Test latency** with simple pad-to-sound feedback
5. **Design lesson file format** based on your content plans
6. **Build minimal validation engine** prototype
7. **Iterate on visual note display** based on feel

---

## Appendix: Useful Resources

### Libraries & Documentation
- [Web MIDI API Spec](https://webaudio.github.io/web-midi-api/)
- [WebMidi.js Documentation](https://webmidijs.org/)
- [MIDIVal Library](https://midival.github.io/)
- [Tone.js](https://tonejs.github.io/)
- [@tonejs/midi](https://github.com/Tonejs/Midi)
- [SvelteKit Docs](https://kit.svelte.dev/)

### Inspiration & Reference
- [Melodics](https://melodics.com/)
- [Quest for Groove](https://questforgroove.com/)
- [Funklet - Interactive Drum Sequencer](https://funklet.com/)
- [Web Audio Drum Machine](https://webaudiodemos.appspot.com/MIDIDrums/index.html)

### Audio Processing (Phase 3)
- [Spleeter](https://github.com/deezer/spleeter)
- [Magenta Onsets & Frames](https://github.com/magenta/magenta)
- [Librosa (Python)](https://librosa.org/)

---

*Document Version: 1.0*  
*Created: January 2025*
