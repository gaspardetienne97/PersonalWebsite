# Hardware and devices: what the browser already knows how to talk to

Everything here was learned against the owner's physical gear. Treat the byte
sequences and the numeric thresholds as measurements, not as design choices: they
were arrived at by tracing real traffic or by listening to a real instrument, and
changing them means re-testing on hardware.

---

## 1. Akai MPC One+ in Controller Mode

### How the protocol was obtained

The MPC 3 desktop app drives its own pad LEDs over **CoreMIDI**, not over raw
USB. That single finding is what makes the whole feature possible in a browser:
anything MPC 3 does to the pads, a Web MIDI page can do too.

The frames were captured by running a disposable copy of MPC 3 under a
DYLD-interposed shim that hooked `MIDISend` / `MIDISendSysex` plus the libusb
synchronous wrappers, then changing pad colours in the app and reading the log.
Every byte below is a literal capture, not a guess. An earlier guess — a `00/01`
ping/pong handshake and product id `0x3B` — was wrong on both counts.

### Frame shape

```
F0  47  <target>  <product>  <command>  <len-hi>  <len-lo>  <payload...>  F7
```

- `F0` / `F7`: SysEx start and end.
- `47`: Akai manufacturer id.
- target: `00` = this device, `7F` = all-call.
- product: `56` = MPC One+. (Other MPC models presumably differ; keep this as a
  tunable, not a constant baked into the frame builder.)
- length: two bytes, big-endian, 7 bits each (`len >> 7`, `len & 0x7F`).

### The exact frames

**Pad colour** (verified lighting real pads on the One+):

```
F0 47 7F 56 65 00 04 <pad> <R> <G> <B> F7
```

- `65` is the set-pad-colour command.
- `pad` is 0..15 (bank A order, pad A01 = 0).
- R, G, B are 7-bit, 0..127 — channels really do reach `7F`.

**Heartbeat / keep-alive** (MPC 3 repeats this about once per second):

```
F0 47 00 56 52 00 04 41 67 16 00 F7
```

`52` is the session command; the four payload bytes `41 67 16 00` are opaque and
replayed literally.

**Enter controller mode:**

```
F0 47 7F 56 62 00 01 61 F7
```

**Full connect handshake**, in order, exactly as MPC 3 sends it before it starts
driving LEDs. Which subset is strictly required is a hardware question nobody
answered; replaying all of it works, so replay all of it.

```
F0 7E 00 06 01 F7                          (universal identity request)
F0 47 00 56 52 00 04 41 67 16 00 F7        (heartbeat)
F0 47 7F 56 62 00 01 61 F7                 (enter controller mode)
F0 47 7F 56 64 00 03 00 01 01 F7
F0 47 7F 56 64 00 03 01 01 01 F7
F0 47 7F 56 64 00 03 02 00 00 F7
F0 47 7F 56 64 00 03 03 00 00 F7
F0 47 7F 56 63 00 03 00 00 00 F7
F0 47 7F 56 63 00 03 01 00 00 F7
F0 47 7F 56 41 00 00 F7
```

### The rule that matters most

**The MPC One+ only sends pad notes while a host keeps talking to it.** Send the
init handshake once, then resend the heartbeat every 1000 ms on the chosen
output for as long as MIDI is on. Stop the heartbeat and the pads go silent as
an input.

This produced the single worst failure mode in the old build: the heartbeat
originally lived on one page (the Connect diagnostic). Pads worked there and
were dead everywhere else, which reads as "the drill is broken" rather than "the
link died". **The link belongs to the app shell, not to a page.** In the rebuild,
own it at the top level: whenever MIDI is enabled, SysEx is granted, and some
saved device profile is flagged as the controller link, run init + heartbeat for
that output and tear it down on disposal.

Practical details that came out of that:

- The link is keyed to a *saved output port id*, so it survives navigation and
  reload. The user opts in once ("Keep linked"), and the app is the host from
  then on.
- Sending SysEx at all requires the SysEx permission (see §5). Guard on it: if
  SysEx was denied, refuse to send frames starting with `F0` rather than
  throwing.
- Re-run the handshake immediately when the user links, so the LEDs answer
  before the next background sync tick.
- On unlink, send all-pads-off before dropping the heartbeat.

### Which port carries what

The MPC One+ exposes more than one MIDI port, named like `MPC One+ Private` and
`MPC One+ Public`.

- **Private** is the one that carries pad LED control and was confirmed working
  for lighting real pads. Prefer it when auto-selecting an output; fall back to
  any port whose name or manufacturer matches `/mpc|akai/i`, then to the first
  output.
- The **control / flood port** is the other side of the same problem: in
  Controller Mode one of the MPC's input ports emits a constant stream of
  controller traffic that is not musical input. Left alone it swamps note
  handling.

### Ignore vs Remove

Two different user actions, and conflating them caused confusion:

- **Ignore** keeps the port bound and still emits *raw* events (so diagnostics
  keep showing bytes arriving), but drops its *normalized note* events before
  they reach exercise listeners. This is what silences the MPC control port.
- **Remove** deletes the saved device profile entirely: the instrument
  assignment, the alias, the pad map, the offset, the controller-link flag. The
  device then behaves like an unknown port again.

Keep both. Ignore is the everyday fix; remove is cleanup.

### Pad note maps

Canonical bank A, the layout the app draws and grades against:

| Pad | A01 | A02 | A03 | A04 | A05 | A06 | A07 | A08 | A09 | A10 | A11 | A12 | A13 | A14 | A15 | A16 |
|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|-----|
| MIDI| 36  | 37  | 38  | 39  | 40  | 41  | 42  | 43  | 44  | 45  | 46  | 47  | 48  | 49  | 50  | 51  |

Four banks exist: A 36–51, B 52–67, C 68–83, D 84–99. Pad index from a bank-A
note is simply `note − 36`.

What the hardware actually sends depends on the drum program loaded:

- **Chromatic from 36 (C1)** — newer firmware default, equals the canonical map.
- **Akai Classic MPC map** — the legacy default drum program. Pad order
  A01..A16 sends:
  `37, 36, 42, 82, 40, 38, 46, 44, 48, 47, 45, 43, 49, 55, 51, 53`
  (so A01 = 37, A02 = 36, A03 = 42, A06 = 38, and A04 = 82 is well outside bank A).
- **Chromatic from 37** — `37..52`.
- **Custom / learned** — whatever a "press each pad in order" learn flow
  captured. A learned map beats both presets.

**Translate at the input boundary, once.** A saved 16-entry pad map is applied
the moment an event enters the app: a note found at index *i* of the map becomes
`36 + i`; notes not in the map (other banks, keyboard notes) pass through
unchanged. Everything downstream — drills, grids, grading, LED feedback — speaks
canonical bank A only. Doing this per-exercise instead is how the old design
almost went wrong.

### Device profiles (the boundary object)

One saved record per MIDI port id, all fields optional except the id:

- `alias` — friendly name the user typed.
- `instrument` — which instrument this port plays. **This wins over
  name-based detection**, always.
- `channel` — fixed MIDI channel 1..16 when the device uses one.
- `ignored` — drop this port's note events (see Ignore vs Remove).
- `padNotes` — the 16-entry hardware pad map above. Validation: exactly 16
  entries, all integers 0..127, all distinct, or the map is rejected.
- `inputOffsetMs` — per-device latency in whole ms, positive meaning this
  device's notes arrive late. Overrides the global MIDI offset. Sanity bound:
  |offset| ≤ 500 ms, otherwise it is bad data and discarded.
- `controllerLink` — this port is the MPC output to keep in Controller Mode.

Applying a profile to an event is a pure function: swap the instrument if the
profile names one, rewrite the MIDI note through the pad map, leave everything
else alone. Unknown devices pass through untouched.

Alongside the per-device profiles, two per-instrument preferences are saved: the
preferred input source (`midi` / `audio` / `onscreen` / `click`) and the
preferred on-screen fallback surface (`keyboard` / `guitar` / `ukulele` / `mpc`;
default is guitar→guitar, ukulele→ukulele, mpc→mpc, everything else→keyboard).

### Pad LED colours in practice

- Assigned-sample pads glow green `{r: 0, g: 110, b: 60}`; empty pads sit dim at
  `{r: 12, g: 12, b: 20}`.
- "Fire" red, captured from the MPC's own colour picker, is `{r: 0x3F, g: 0, b: 0}`.
- A full-hue sweep across the 16 pads (HSV hue = pad/16, S=V=1, scaled to 0..127)
  is the fastest way to read physical pad-index order off the hardware — light
  the rainbow, look at the unit, and you know which pad is index 0.

### The diagnostic flow that worked

A single small panel, driven entirely by user gestures, is what made this
debuggable:

1. Pick a MIDI output from a plain list showing name and manufacturer, defaulting
   to the first MPC/Akai match.
2. **Keep linked (init + heartbeat)** — replays the handshake now and saves the
   link so the app shell keeps it alive on every page. **Unlink** sends all-off
   and clears it.
3. **Light pad 1 red** — one frame, the cheapest possible proof the output is
   the right one.
4. **Test rainbow** — all 16 pads, proves index order.
5. **All off**.
6. Show the **last outbound frame** and the **last inbound SysEx frame** as hex.
   Seeing inbound bytes at all is how you learn the device is answering.
7. State line that explains the current blocker in words: SysEx missing,
   not linked, or linked and holding.

Failure modes this surfaces, in the order they were actually hit:

- Pads silent on every route except the one page that owned the heartbeat.
- MIDI simply not enabled after a fresh page load (see §5) — nothing works and
  nothing says why.
- Wrong output chosen (Public instead of Private): frames send, LEDs do nothing.
- SysEx denied: frames are silently refused.
- Control port flooding note handling until it is ignored.

---

## 2. Roland Aerophone AE-10 / AE-20

The owner physically has the instrument, which makes it the verifier for all
fingering data.

### MIDI behaviour

- Detected by port identity containing `aerophone`, or `roland` together with a
  model number matching `ae-<digits>`.
- **Breath is CC 2.** Every breath-driven exercise listens for control-change
  messages on controller 2 and treats the 0..127 value (normalized to 0..1) as
  the breath curve.
- **Bite is pitch bend** (14-bit, centred at 8192, normalized to −1..+1).
- Aftertouch arrives as either channel pressure (`0xD0`) or polyphonic key
  pressure (`0xA0`); both normalize to a 0..1 pressure.
- It is a monophonic wind controller: exercises that need chords degrade to
  arpeggios rather than being offered.

### Breath-driven exercise parameters that worked

- **Long tone**: default target G4 (MIDI 67), hold 5000 ms (floor 500 ms),
  breath CC 2. Pass bar: steadiness ≥ 0.8 and the right pitch held the full
  duration. Score = steadiness × 0.7 + (pitch correct ? 0.2 : 0) + progress × 0.1.
- **Steadiness metric**: `1 − 4 × stdev(breath values)`, clamped to 0..1, needing
  at least two samples. The ×4 is the tuning knob — it makes a real wind player's
  natural wobble land around 0.8 rather than 0.99.
- **Swell**: 6000 ms (floor 1000 ms), low level 0.2, peak level 0.9, peak forced
  to be at least low + 0.1.
- **Articulation**: 8 notes at 90 BPM, styles staccato and legato, graded on
  sounding fraction of the beat — staccato target 0.35, legato target 0.95.
  Score = pitch accuracy × 0.5 + articulation × 0.5; correct needs every pitch
  right and articulation ≥ 0.7.
- **Interval landing**: drone C4 (60), hold 3000 ms, breath CC 2. Score =
  (pitch correct ? 0.45 : 0) + steadiness × 0.45 + progress × 0.1; correct needs
  steadiness ≥ 0.75.
- Live traces keep the last 64 samples — enough for a stage-sized sparkline.
  Attack offset in cents comes from the detected frequency when audio is the
  source, and is a whole multiple of 100 when MIDI is (MIDI cannot express
  fractions of a semitone).

### Fingering data and how it was verified

Sax fingering mode, written pitch. Full table in `data/aerophone-fingerings.json`.
Range charted: MIDI 58 (Bb3) to 78 (F#/Gb5).

The verification status is part of the data and must survive the rebuild:

- **Verified against manual charts and live use on the owner's unit:** C4, D4,
  E4, F4, G4, A4, B4, C#5, D5, Eb5.
- **Still to confirm:** the low pinkies (Bb3, B3, C#4), Eb4, the long F#
  (F#4 and F#5), G#4, the bis Bb4, and the C5 side-C.
- The six main tone keys (`k1`..`k6`) plus the octave key are reliable
  throughout. The side and pinky keys around the register break (C5 / C#5) are
  best-effort.

Key registry (27 ids): six main tone keys `k1`..`k6` (LH index/middle/ring, then
RH index/middle/ring); left-hand side and pinky keys `bisBb`, `gsharp`,
`lowCsharp`, `lowB`, `lowBb`; right-hand side and pinky keys `sideE`, `sideC`,
`sideBb`, `eb`, `lowC`; four left palm crescents `palm1`..`palm4` plus `front`;
and six reserved black keys `blackL1`..`blackL3`, `blackR1`..`blackR3` that no
current fingering uses but that the drawing can highlight.

---

## 3. Piano over MIDI, guitar over microphone

These are the two everyday paths and they behave differently enough that the
rebuild should not pretend they are one thing.

**Piano over MIDI.** Note-on/note-off with real velocity, exact timestamps, and
confidence 1.0 by definition. Velocity 0 on a note-on means note-off. Channel is
`(status & 0x0F) + 1`. A fixed channel can be pinned per device so a multi-timbral
board does not spray events.

**Guitar over microphone.** Monophonic pitch detection only — no polyphonic
transcription in real time. Confidence is the detector's clarity, clamped 0..1,
defaulting to 0.7 when absent. On-screen input sits at 0.8 confidence and answer
buttons at 0.6, so a real acoustic attack usually outranks a tap but a noisy
frame does not.

Source arbitration: any non-click event that is not a note-off makes its source
the active one; a MIDI note-off can never steal the active source back from
on-screen. Recent MIDI activity is remembered for 1500 ms, so switching the
selected instrument does not immediately drop a live MIDI session.

---

## 4. Microphone pitch detection: the settings that finally worked on low strings

Detector: **McLeod Pitch Method** (normalized square-difference function plus
key-maximum peak picking), which yields a 0..1 clarity figure for free. Pure
math over a `Float32Array`; the browser layer only feeds it buffers.

### The numbers, and why each one is what it is

- **Clarity threshold 0.85** (MPM's classic value is 0.9). This is the
  peak-pick ratio: a key maximum counts only if it reaches this fraction of the
  strongest maximum. At 0.9 the "first peak within k of the tallest" rule flips
  to a sub-multiple lag (2T, 3T) whenever in-band interference lifts a long-lag
  maximum to within 10% of the true period's. Two real sources do exactly that:
  mains hum (50/60 Hz sits inside the 50 Hz floor) and a neighbouring string
  still ringing a fourth away, whose common period lands at 3T. Both measured
  around 0.90 on the synthetic fixtures — right on the cutoff — so the tuner read
  an octave or a twelfth low on low strings.
  **0.85 is the largest step that still reports zero octave-up frames** when the
  fundamental is weak (NSDF at T/2 reaches 0.66 there). **0.8 starts picking T/2,
  i.e. it flips octaves the other way.** So 0.85 is a measured optimum with a
  cliff on each side, not a round number.
- **40 Hz second-order high-pass** (RBJ biquad, Q = 1/√2), run per sample on the
  audio thread before framing. A DC offset from a cheap preamp and sub-50 Hz
  rumble (HVAC, handling noise) add a slowly varying term to the autocorrelation
  that tilts the NSDF peak toward shorter lags: readings come back a few cents
  sharp and roughly half the frames on low strings fall under the clarity floor.
  40 Hz sits below the 50 Hz lowest reportable note, so it costs nothing musical.
  Two consumers share this filter (the tuner and chord recognition), so moving
  the cutoff moves both.
  Practical detail: the poles sit at radius ≈0.9963, so on digital silence the
  filter state decays into denormals and stays there at 10–100× the FP cost on
  the audio thread. Flush |y| < 1e-20 to zero rather than trusting the host to
  set flush-to-zero.
  Second practical detail: `sampleRate` is a global in the AudioWorklet scope; a
  test harness without one turns every coefficient, and then every sample
  permanently, into NaN. Fall back to 48000.
- **Frame size 2048** (~46 ms at 44.1 kHz) — fine enough for a tuner, posted from
  the worklet to the main thread so the frame cadence comes from the audio clock
  rather than a timer.
- **Wide window 4096**, used as a second pass **only** when the first estimate is
  unusable or below **130 Hz**. Below 130 Hz a 2048-sample frame holds too few
  periods to be steady (low E2 gets about 3.5). The wide pass buys roughly 4
  cents less frame-to-frame jitter and recovers frames a single window loses to
  noise. Notes above 130 Hz never pay the extra pass, so their latency is
  unchanged. The wide result may *improve* a reading but must never delete one
  the single frame already earned — on a transition (new pluck, string change)
  half the wide window is the previous signal and its clarity can fall below the
  floor.
- **Detector band:** 50 Hz to 1500 Hz. Below −60 dBFS-ish (RMS < 1e-3) return no
  pitch rather than locking onto noise.
- **Tuner clarity floor 0.6**, separate from the peak-pick ratio: below it the
  tuner returns nothing so the UI can hold the last good reading instead of
  flickering.
- **Stale reading timeout 1500 ms** — after that the held reading is cleared and
  the display goes quiet.
- **Tolerances:** tuner in-tune window ±5 cents; the intonation/drone trainer
  uses ±10 cents over a rolling 10-second window.
- **getUserMedia constraints:** echo cancellation off, auto gain control off,
  noise suppression off. All three destroy pitch content.
- Connect the mic source to the worklet **only**, never to the destination, or
  you get feedback.

### Chord / note gating from audio

For "is the chord I am waiting for sounding right now", a separate hard gate
runs on the same note-energy bank: band E2–E6 (MIDI 40–88), signal floor 0.01
RMS, SNR ratio 2.5 over an adaptive noise floor, noise-floor smoothing 0.9,
3 consecutive stable frames, presence ratio 0.25, harmonic margin 0.9, match
margin 1.4. Piano partials at +12, +19, +24 semitones are treated as harmonics;
a target must out-shout confusers at −24, −12, −1, +1, +12, +24 to prove its own
octave. A match only fires after a re-arm boundary (silence, or a frame where the
target was not fully sounding), so a sustained chord cannot re-trigger.

Chord analysis window: 600 ms of audio, resampled to 22.05 kHz mono.

---

## 5. Web MIDI and audio permission lifecycle

- Feature detection is `"requestMIDIAccess" in navigator`. When it is absent, say
  so plainly: Web MIDI is unavailable in this browser, use Chromium or on-screen
  input.
- **Always try SysEx first**, then fall back: request access with `sysex: true`;
  if that rejects, record the reason and re-request with `sysex: false` so the
  user still gets plain MIDI. Track `enabled` and `sysexEnabled` as two separate
  flags, because half the MPC features need the second one.
- **MIDI is not enabled on a fresh page load.** The browser may remember the
  permission, but the app still has to call enable, and if it does not, every
  device list is empty and every drill looks broken. Remember "MIDI was enabled
  in this browser before" and re-open it on load; otherwise the user has to
  re-click a button they already clicked, with no explanation.
- Subscribe to `connected`, `disconnected` and `portschanged` and rebind inputs
  on each; hot-plugging is normal.
- Two subscription levels are needed: **raw** byte events (diagnostics, and they
  keep flowing even for ignored ports) and **normalized** note events (everything
  else, filtered by the ignore list).
- **Audio needs a user gesture.** The audio context cannot start without one;
  refuse to load samples before it and say why.
- Microphone permission denial surfaces as `NotAllowedError`; distinguish it
  from a generic failure so the message can tell the user to unblock the mic.

---

## 6. Timing: three clocks, and which one wins

There are three independent clocks and mixing them is the classic bug:

1. **Audio context time** (seconds, raw).
2. **Scheduling time** = audio time + Tone's look-ahead. Everything scheduled is
   scheduled against this.
3. **`performance.now()`** (monotonic ms), which is what input events carry and
   what scoring uses.

Rules that came out of this:

- **Never schedule audio with `setTimeout` / `setInterval` /
  `requestAnimationFrame`.** Use the transport's look-ahead.
- **Lights must follow the audio, not the call.** Tone schedules a look-ahead
  ahead of the call, so a demo's visual highlight has to start at the instant
  beat 0 *actually sounds*, not at the instant the play call was made. Sample all
  three clocks in the same call — raw audio time, scheduling time, and
  `performance.now()` — and project the scheduled start onto the performance
  clock; then the visual timers are offset by `startedAt − now()`.
- Pattern notes are handed to the voice **1 second** ahead of their start, topped
  up every **100 ms**, rather than all at once: a long score otherwise allocates
  a buffer source per note up front, and a sampler release stops every source it
  holds for that pitch, so any mid-preview retrigger silences queued notes.
- A same-time drum pad retrigger gets a 1 ms forward nudge.
- `AudioContext.outputLatency` (buffer plus the OS/device path) and
  `baseLatency` (what the browser's own graph adds) are read and shown as
  **diagnostics only**. They are never applied to scoring, because clicks are
  already scheduled against the audio clock. Safari reports 0 for
  `outputLatency`, so treat a zero or missing value as "not reported".

---

## 7. Offset calibration (tap-along)

The user taps along with a metronome; the app estimates how late their input
arrives and subtracts it from incoming timestamps at the router, once, so no
scorer downstream has to know about it.

**Sign convention: positive = late.** The input arrives after the event it
answers. The router subtracts it.

Procedure and gates:

- Metronome at **90 BPM** — slow enough to tap accurately.
- **20 clicks** in a run.
- **Drop the first 4** (warm-up: the first few taps are spent finding the beat).
- At least **14 of the remaining 16** clicks must be answered by a tap, or the
  run is rejected with "tap once on every click".
- **Median** of the tap-minus-click differences is the offset, rounded to whole ms.
- **Interquartile spread must be ≤ 30 ms**, or the run is rejected as too loose
  for a median to mean anything. IQR uses the exclusive method (the median splits
  the halves).
- Each click claims the **nearest tap no earlier click has taken**, so a flam or a
  double onset cannot answer the same click twice.
- A tap may reach at most **half a beat** (±333 ms at 90 BPM) — beyond that a
  periodic grid genuinely cannot tell a late tap from an early one, and that is
  the hard usable range of the method.
- **Coarse median first, outlier window around that.** Take a rough median over
  the half-beat reach, then keep only taps within **±200 ms of that coarse
  median**. This is what lets a 250 ms Bluetooth round trip read as 250 ms instead
  of as twenty missed taps.
- Saved offsets: a global audio offset, a global MIDI offset, and a per-device
  MIDI offset that overrides the global one. Bound each to ±500 ms.

Be honest in the UI: this is an *estimate*, not a hardware measurement. It
contains the player's reaction time and the output path as well as the input
round trip.

---

## 8. Sample kit export to the MPC

Two delivery paths from the same generated file list:

- **Directory** via the File System Access API, when the page is in a secure
  context and `showDirectoryPicker` exists. Writes straight onto the MPC's SD
  card or a mounted folder.
- **ZIP** otherwise, named `<KitName>-mpc.zip`, containing one top-level folder
  `<KitName>/`.

Layout inside the kit folder:

```
<KitName>/
  <KitName>.xpm
  Samples/
    036-kick.wav
    038-snare.wav
    042-closed-hat.wav
    ...
```

- Folder and program name: the kit name normalized — NFKD, diacritics stripped,
  every run of non-alphanumerics collapsed to `-`, trimmed, capped at 64 chars,
  falling back to `Kit`.
- Sample file name: the pad's MIDI note **zero-padded to 3 digits**, a hyphen,
  then the safe-normalized original stem, then the original extension. Duplicate
  stems get `-2`, `-3`, … appended.
- Allowed sample extensions: wav, wave, aif, aiff, flac, mp3, ogg, oga. Anything
  else is refused with a message naming the file.
- The program references samples as `Samples/<baseName>` **without extension**.

The `.xpm` is a generated MPC Standalone 3.x Drum Program, file version 2.1, not
a copied fixture:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<MPCVObject>
  <Version>
    <File_Version>2.1</File_Version>
    <Application>MPC-V</Application>
    <Application_Version>3.0</Application_Version>
    <Platform>Standalone</Platform>
  </Version>
  <Program type="Drum">
    <ProgramName>...</ProgramName>
    <Program_Polyphony>0</Program_Polyphony>
    <Instruments>
      <Instrument number="1">
        <Name>...</Name>
        <MidiNote>36</MidiNote>
        <MuteGroup>0</MuteGroup>
        <Layers>
          <Layer number="1">
            <Active>True</Active>
            <VelStart>0</VelStart>
            <VelEnd>127</VelEnd>
            <SampleName>Samples/036-kick</SampleName>
          </Layer>
          <Layer number="2"><Active>False</Active><SampleName></SampleName></Layer>
          ...
        </Layers>
      </Instrument>
      ...
    </Instruments>
  </Program>
</MPCVObject>
```

- Exactly **128 `<Instrument>` elements**, numbered 1..128, MIDI note
  `35 + number` clamped to 127 (so instrument 1 = note 36 = pad A01).
- Exactly **4 `<Layer>` elements** per instrument; unused layers are
  `Active=False` with an empty sample name.
- Velocity layers are stored normalized 0..1 in the app and written as 0..127.
- `MuteGroup` carries the pad's choke group (1..16), 0 meaning none.

Auto-mapping from filenames onto bank A, first match wins, more specific tokens
first: high tom→48, mid tom→45, low tom→41, any tom→45, kick/bassdrum/bd/808→36,
snare/sd→38, clap→39, sidestick/rimshot/rim/stick→37, open hat/hho→46,
closed hat/hhc→42, any hat/hh→42, crash→49, ride→51, perc→40.

Rendered audio export (for bouncing patterns rather than kits) is a 16-bit
little-endian PCM WAV at 44.1 kHz, rendered offline with `OfflineAudioContext`
plus a 0.5 s tail so the last sample rings out. Synth fallback voices are
triangle oscillators with a 5 ms attack and a 160 ms default length.
