# Roland Aerophone: hardware, MIDI, Roland's apps, practice (2026-10-13)

Local reference for the Aerophone practice build. Primary sources are Roland's own PDFs (downloaded and read in full for the AE-10, AE-20, AE-30, AE-05, AE-01) and Roland's support knowledge base. Anything marked "inferred" is my reading of a diagram or a combination of sources; anything marked "unverified" needs a test on the owner's unit.

Roland PDFs used (all on static.roland.com):

- AE-10 Owner's Manual: <https://static.roland.com/assets/media/pdf/AE-10_eng03_W.pdf>
- AE-10 Ver.2.20 and Ver.3.10 change notices: <https://static.roland.com/assets/media/pdf/AE-10_add_change_multi01_W.pdf>, <https://static.roland.com/assets/media/pdf/AE-10_add_change310_eng01_W.pdf>
- AE-10 MIDI Implementation (v1.01, Dec 2021): <https://static.roland.com/assets/media/pdf/AE-10_MIDI_Imple_eng02_W.pdf>
- AE-20 Owner's Manual: <https://static.roland.com/assets/media/pdf/AE-20_eng02_W.pdf>
- AE-30/AE-20 Parameter Guide: <https://static.roland.com/assets/media/pdf/AE-30_AE-20_Parameter_Guide_eng07_W.pdf>
- AE-30/AE-20 MIDI Implementation (v3.00, Mar 2023): <https://static.roland.com/assets/media/pdf/AE-30_AE-20_MIDI_imple_eng06_W.pdf>
- AE-30 Owner's Manual: <https://static.roland.com/assets/media/pdf/AE-30_eng04_W.pdf>
- AE-05 (GO) Owner's Manual: <https://static.roland.com/assets/media/pdf/AE-05_eng05_W.pdf>
- AE-01 (mini) Owner's Manual and chart: <https://static.roland.com/assets/media/pdf/AE-01_eng05_W.pdf>, <https://static.roland.com/assets/media/pdf/AE-01_Finger_Chart_multi01_W.pdf>

Support articles are cited by URL `https://support.roland.com/hc/en-us/articles/<id>` (the site blocks scripted fetches; the same text is served by `https://support.roland.com/api/v2/help_center/en-us/articles/<id>.json`).

---

## 1. Hardware per model

### Key names (AE-10, AE-20, AE-30 share one naming scheme)

From the "Pressing the Performance Keys" diagrams (AE-10 manual p.4, AE-20 manual p.6). Roland's names in bold, the sax equivalent after it. The sax-equivalent column for C1/C2/C4/C3 is inferred from the fingering charts (D5 uses C1 alone, Eb5 adds C2, F5 adds C4, an E5 alternate uses C3), consistent with standard sax palm and side keys.

| Roland name | Hand | Sax equivalent |
|---|---|---|
| **1, 2, 3** | LH index, middle, ring | B, A, G main keys |
| **4, 5, 6** | RH index, middle, ring | F, E, D main keys |
| **X** | LH index, above key 1 | front F (front key) |
| **P** | LH index, between 1 and 2 | bis Bb |
| **C1, C2, C4** | LH palm (side keys) | palm D, palm Eb, palm F (inferred) |
| **G#, C#, B, Bb** | LH pinky table | G#, low C#, low B, low Bb |
| **C3, Tc, Ta** | RH side keys | side E (high E), side C, side Bb (inferred from names and charts) |
| **Tf** | RH, between 5 and 6 | alternate (fork) F# |
| **Eb, C** | RH pinky | low Eb, low C |
| **C5** | RH, between 4 and 5 | high F# key (AE-20 and AE-30 only) |
| **+2, +1, -1, -2** | LH thumb, around the thumb rest | octave keys (buttons, not rollers) |

Roland's manuals say to press the side keys (C1 to C4, Tc, Ta) with the inside or ball of the hand. Roland's support article on wrong notes lists exactly these as the usual culprits (octave keys pressed by the thumb, side keys by the palm, X / P / C5 by a finger) ([KB 5009239860251](https://support.roland.com/hc/en-us/articles/5009239860251)).

Key counts (Roland comparison table, [KB 4414721295643](https://support.roland.com/hc/en-us/articles/4414721295643)): AE-30 22 keys, AE-20 22 keys, AE-10 21 keys; all have 4 octave keys (+2, +1, -1, -2) and a "saxophone compatible" layout. The one key difference is the **high F# key (C5)**, present on AE-20/AE-30, absent on AE-10 ([KB 360054882212](https://support.roland.com/hc/en-us/articles/360054882212)). Count check against the AE-20 diagram: 1-6 (6) + X, P (2) + C1, C2, C3, C4, C5 (5) + Tc, Ta, Tf (3) + G#, C#, B, Bb (4) + Eb, C (2) = 22.

Note for the rebuild: the previous key registry (`context/data/aerophone-fingerings.json`) had `palm1..palm4` plus `front` and no Tf or C5. Roland has three left palm keys (C1, C2, C4) plus X, and the four crescents drawn at the upper left of Roland's own app illustration are the thumb octave keys (+2/+1 above the thumb rest, -1/-2 below), not palm keys (inferred from the Lesson app screenshots below compared with the manual's octave-key diagram; high confidence). The "black keys" in the old registry do not correspond to any Roland key name I found.

### Per model

**AE-10 / AE-10G (the AE-10G is the graphite colour).**
- 21 keys as above, no C5. Octave keys switchable OCT1 / OCT2 / OCT3 (AE-10 manual p.8): OCT1 is sax-like (both upper keys give +1; the lower keys extend the bottom to written A3 and Ab3, per the "Oct Key: OCT 1" box in the chart, which misprints Ab3 as "G#2"); OCT2 is +2/+1/-1/-2; OCT3 is +3/+1/-1/-3 with two keys pressed together for ±2.
- **Thumb controller** (right thumb, a small joystick): up/down = bend up/down, left/right = assignable, factory "Portamento" and "Growl" on sax tones; Left/Right can send CC 1-31, 33-95 or harmony (manual p.4 and p.8).
- Breath sensor in the mouthpiece; **bite sensor** on the reed. Bite modes after Ver.3.10: OFF, SAX (relaxing the bite lowers pitch), EWND (cyclic bite gives vibrato), AUTO (vibrato when you bite hard) ([3.10 notice](https://static.roland.com/assets/media/pdf/AE-10_add_change310_eng01_W.pdf)).
- [TONE] button, menu with LCD, speakers, PHONES/OUTPUT, USB (type B) "class compliant" MIDI ([KB 115005729946](https://support.roland.com/hc/en-us/articles/115005729946)). **No Bluetooth** in the AE-10 manual (I found no mention). Editing app: Aerophone Editor over USB (iOS needs a camera adapter; Android OTG) ([Roland](https://www.roland.com/us/products/aerophone_editor/)).

**AE-20 / AE-20W (2022).**
- 22 keys including C5 (high F#). Same key positions and spacing as the AE-30; shorter neck and bottom section (632 mm vs 867 mm tall, 1,100 g vs 1,140 g) ([KB 4414507338139](https://support.roland.com/hc/en-us/articles/4414507338139)).
- Octave keys: Oct2 (+2/+1/-1/-2), Oct3 (±3, two together for ±2), Sax1 (sax mode, upper key only +1), Sax2 (baritone mode: upper +1, lower key reaches low A) (Parameter Guide p.7).
- **Thumb lever** (right thumb): pitch bend up/down by default, assignable (manual p.5). **S1 / S2** buttons, assignable. Side keys X, C1 to C5, Tc, Ta can each be given extra functions in Assign / MIDI settings (Parameter Guide p.11-13).
- Bite: Bite Ctrl Mode Off / Sax / E-Wind, Bite Center (Auto or 1-70, or set by pressing +2 and -2 together while biting normally), E-Wind sensitivity 1-10, Bite Calibration (manual p.14). Taking more mouthpiece into the mouth makes bite control less responsive (manual p.6).
- Breath: Breath Curve L5..L1, M, H1..H5 (11 steps, M default), Breath Adjust 1-50 (threshold before sound starts) (Parameter Guide p.3-4).
- Other: Key Delay 0-10 (debounce for multi-key changes), Key Function (disable a key, or make it shift ±1 or ±2 semitones), Hold Mode (Off / Breath / **Key**: Key makes the keys sound without blowing, Roland suggests it for fingering practice, [KB 5008391478683](https://support.roland.com/hc/en-us/articles/5008391478683)), User Fingering (up to 36 custom fingerings), [MIDI CONTROL] switch, OLED, speakers, USB-C (MIDI and audio), Bluetooth 4.2 (A2DP audio in, GATT MIDI).
- What the AE-20 changed vs AE-10 (Roland): the high F# key, Flute and Clarinet fingering modes, OLED, ZEN-Core engine, 600 user scenes, Roland Cloud Sound Packs, Bluetooth ([KB 4414721295643](https://support.roland.com/hc/en-us/articles/4414721295643)). User reports (single sources, low confidence): octave keys sit higher toward the thumb tip; palm keys moved inward; quieter keys; slightly heavier and longer; adjustable right thumb rest ([Thomann AE-20 reviews](https://www.thomann.cz/roland_aerophone_ae_20_reviews.htm)). **There are no octave rollers on any Aerophone**; the octave keys are buttons ([Patchman FAQ](https://www.patchmanmusic.com/WindControllerFAQ.html)).

**AE-30 Aerophone Pro.** AE-20 keys and layout plus a right-thumb **thumb pad** (pressure), **motion sensor** (tilt / elevation, can do vibrato), [TRANSPOSE] knob, 5-pin MIDI IN and OUT, longer body (AE-30 manual p.4-5, Parameter Guide p.5).

**AE-05 Aerophone GO.** Sax-style 21-key front (the manual's diagram shows X, 1, P, 2, 3, C1, C2, C4, G#, C#, B, Bb, C3, Tc, Ta, 4, 5, Tf, 6, Eb, C; no C5). Octave keys are only +1 / -1. A **thumb button** bends up or down (direction fixed per tone). Bite sensor with an on/off switch. On-board settings are entered with side keys: Breath Curve (C3: L2, L1, M, H1, H2), Reverb (Tc), Fingering Type (Ta: Sax, Recorder, E-Wind). Bluetooth 4.2 A2DP + GATT MIDI; USB is for power and, on Android, a wired app connection (AE-05 manual p.2-9). The app also edits fingerings, including a Trumpet mode, and stores 6 alternative fingering layouts ([KB 4408647254811](https://support.roland.com/hc/en-us/articles/4408647254811)).

**AE-01 Aerophone mini.** Not sax-shaped: recorder-based "C D E F G A B C" fingering on numbered keys 1-7 plus a [♯] key and a [♭] key (the ♭ key is described in the chart as raising by a major second for trills; text is confusing, low confidence), octave UP / DOWN for the left thumb, transpose -5 to +6 set from the keys. Fingering charts are given for Recorder and Trumpet. **No bite sensor** ([Patchman FAQ](https://www.patchmanmusic.com/WindControllerFAQ.html); the manual mentions no bite control). Bluetooth 4.2 A2DP + GATT MIDI (AE-01 manual p.10-12 and specs).

**Aerophone Brisa** (newer, flute-style) exists with its own modes (Brisa, Flute, Trumpet, Left, Right) and app; out of scope here ([KB 41097746281243](https://support.roland.com/hc/en-us/articles/41097746281243)).

---

## 2. Fingering modes, octaves, range, transposition

Modes (Roland comparison, [KB 4414721295643](https://support.roland.com/hc/en-us/articles/4414721295643); Parameter Guide p.8; AE-10 manual p.10):

| Mode | AE-10 | AE-20/30 | How it works |
|---|---|---|---|
| Sax | SAX1 (with altissimo) / SAX2 (without) | Sax (altissimo supported, [KB 29575779757083](https://support.roland.com/hc/en-us/articles/29575779757083)) | Standard sax fingering; octave by thumb keys |
| Recorder | RECO | Recorder | Recorder fingering, range extended by the "table key"; **side keys disabled** so stray palm presses do nothing |
| E-Wind (Roland's EWI-style mode) | EWND | E-Wind | 1-6 + C give C D E F G A B C; Tc, G#, C# raise a semitone; Ta, Tf, Eb, B lower a semitone; Bb lowers a whole tone |
| Trumpet | TRPT | Trumpet | RH keys 4, 5, 6 act as valves 1, 2, 3 |
| Left Hand / Right Hand | LEFT / RIGH | Left Hand / Right Hand | One-hand fingerings |
| Flute | no | Flute | Flute fingering; X, C1, C2, C3 raise a semitone; P, B, C4, Tc, Ta lower; Bb lowers a whole tone. Chart C4 to C6 |
| Clarinet | no | Clarinet | Clarinet fingering; C1 raises, P and C5 lower. Chart E3 to A6. **The octave keys are used for fingering in this mode, so they may not shift octave** ([KB 5008488803611](https://support.roland.com/hc/en-us/articles/5008488803611)) |
| User | up to 10 custom fingerings (AE-10) | User Fingering, up to 36 | Transpose and octave shift are ignored in User mode |

There is no mode literally called "EWI"; E-Wind is the closest.

**Octaves.** On every model the register comes only from the thumb octave keys, never from breath. Blowing harder changes volume and timbre only; Roland even notes harmonics are produced "simply by pressing the performance keys, without having to adjust your breath" (AE-10 manual p.4). How the thumb keys behave depends on the Octave Key setting above (OCT1/Sax1 behaves like a sax octave key).

**Sax-mode written range.** The charts (AE-10 p.13-15, Parameter Guide p.71, AE-20 manual p.22) name notes as they sound at Transpose 0 with no octave key: written Bb3 (MIDI 58) up to F#5 (78), where Bb3..C#5 are the low register and D5..F#5 are the palm-key notes. The +1 octave key adds 12, giving a sax-like written Bb3 to F#6. Altissimo fingerings on the AE-10 chart continue G5..C6 (so up to about C7 with the octave key; inferred). OCT1 / Sax2 add written A3 and Ab3 below. OCT2/OCT3 extend ±2 or ±3 octaves. The AE-20 user fingering table accepts notes C3 to C7 (MIDI 48-96) (MIDI Implementation, [Fingering] block). The previous build charted 58-78, which is exactly the no-octave-key chart.

**Transposition and MIDI note numbers.**
- AE-10: Transpose -5..+6 and Octave -3..+3 are **per tone**. At Transpose 0 the "C" fingering sounds C. Factory values: alto sax tone Transpose +3 and Octave -1; soprano -2 and 0; baritone Octave -2 (AE-10 manual p.7).
- AE-20/AE-30: System Transpose -5 (G) to +6 (F#), or Scene Transpose if Transpose Mode = Scene; Scene Octave Shift -3..+3 (Parameter Guide p.3, p.10).
- Roland states that changing the transpose setting **also transposes the note numbers sent over USB-MIDI** on the AE-20 ([KB 4414507233179](https://support.roland.com/hc/en-us/articles/4414507233179)) and on the AE-30 ([KB 360055302711](https://support.roland.com/hc/en-us/articles/360055302711)). So MIDI notes are concert (sounding) pitch: note = chart note + transpose (+ 12 × octave shift, inferred; unverified whether octave shift reaches MIDI out). Worked example (inferred): fingering written C4 on the AE-10 alto preset sends 60 + 3 − 12 = 51 (Eb3), which is correct concert pitch for alto sax.
- For the AE-10 I found no Roland statement either way; unverified.
- Roland's Lesson app reads the transpose and shows "0(C)" in its header, and says it "reflects any transposition or fingering adjustments you make on the instrument" ([Roland](https://www.roland.com/us/products/aerophone_lesson/features/)).

---

## 3. MIDI implementation for a practice app

**Breath.** CC 2 ("Breath Type") is the default on the AE-10: BreaOut1 default **CC.2**, BreaOut2 OFF; options OFF, CC1-31, CC33-95, BEND, AFT.T, TONE (AE-10 manual p.10). On the AE-20/AE-30 the breath controller has up to 8 MIDI OUT slots, each OFF, CC 1-31, CC 33-95, Bend Up/Down or After Touch, with input/output min-max and 12 curves (Parameter Guide p.12-13). I did not find the AE-20 factory default printed; Roland's own troubleshooting says external synths get no sound unless "breath control and expression messages" are transmitted (AE-20 manual p.19), and Sweetwater's quickstart says synth patches must be set to CC 2 ([Sweetwater](https://www.sweetwater.com/sweetcare/articles/roland-aerophone-ae-20-and-ae-30-quickstart-guide/), via search summary). Treat CC 2 as likely default, CC 11 as possible, and **make it configurable**; verify on the unit. Both CC 2 and CC 11 appear in the transmit lists of both implementations.

**Bite.** AE-10: BiteOut1 default BEND (after Ver.3.10 split into BND.S, sax-style downward bend, and BND.E, E-Wind vibrato), BiteOut2 OFF, options include CCs and AFT.T, with Min/Max per slot ([3.10 notice](https://static.roland.com/assets/media/pdf/AE-10_add_change310_eng01_W.pdf)). One AE-10 owner measured that BND.S bends only downward and covers a very small reed travel ([gonzos.net](https://gonzos.net/projects/aerophone-ae-10-with-external-synth/)). AE-20/AE-30: Bite Down (4 slots) and Bite Up (4 slots) map to Bend Down/Up, CC, or aftertouch. So "bite arrives as pitch bend" is the factory behaviour but not guaranteed.

**Pitch bend, aftertouch.** Pitch bend 14-bit (−8192..+8191) is transmitted. Aftertouch is **channel pressure only** on AE-20/AE-30 (Key's aftertouch "x" in the implementation chart); the AE-10 implementation also lists only Channel Pressure under transmission. Polyphonic pressure should never arrive.

**Velocity.** AE-20/AE-30: MIDI Velocity = "Tongued" (velocity from the strength of the tongued attack) or Fixed 1-127, settable per system and per scene ("REAL") (Parameter Guide p.7 and p.28). AE-10: one owner measured that the note-on is sent when CC 2 crosses a trigger value and the velocity equals the CC 2 value at the attack peak, with note-off when CC 2 drops back below the trigger; holding very soft breath near the trigger causes rapid note-on/off "stammering" (firmware 3.11; [gonzos.net](https://gonzos.net/projects/aerophone-ae-10-with-external-synth/), single source). Patchman: wind-controller velocity is set only at the start of each note, so dynamics after the attack live in the breath CC ([Patchman FAQ](https://www.patchmanmusic.com/WindControllerFAQ.html)).

**Other transmitted traffic.**
- Active Sensing (0xFE) about every 250 ms on AE-20/AE-30 (MIDI Implementation p.8): filter it.
- Program change / bank select on scene change if enabled; Volume, Pan, Mod, Reverb, Chorus, RPN coarse/fine/bend range snapshots on scene select if set (Parameter Guide p.28).
- MIDI Speed 1-15 ms sets the output interval in MIDI Control mode (Parameter Guide p.7): expect breath CC at that rate, not continuous.
- Transmit channel 1-16 (AE-10 "MIDI Ch", AE-20 "Tx Channel"); AE-20 receives on fixed channels 1-5 ([KB 5009556342939](https://support.roland.com/hc/en-us/articles/5009556342939)).
- Identity Reply: Roland 41H, family 7D 03, member 00 (AE-30), 01 (AE-20), 02 (AE-20SC). AE-10 SysEx model ID 00 00 00 2F; AE-20/AE-30 00 00 00 7D. Useful for model detection instead of port-name sniffing.

**[MIDI CONTROL] switch (AE-20/AE-30).** With it on, the controllers (breath, bite, S1, S2 and so on) follow the MIDI settings instead of the internal Assign settings; "MIDI Ctrl Sound" Off mutes the internal engine ([KB 5009151421595](https://support.roland.com/hc/en-us/articles/5009151421595); [KB 4414513906459](https://support.roland.com/hc/en-us/articles/4414513906459), via search summary). Whether notes and breath CCs are sent over USB with the switch **off** is not documented that I found; unverified. Tell the user to switch it on.

**Live key state over SysEx (AE-20/AE-30).** The Setup block has a **"Fingering Status"** value (28 bits, nibbled, address 00 10 00 08) and a "Fingering Status Switch" (00 10 00 10), plus "Transmit Edit Data" (00 10 00 07); Fingering Mode, Octave Key mode, Breath Curve, Breath Adjust, Bite mode are readable in System Common (MIDI Implementation p.13-15). This is almost certainly how Roland's apps show which keys are physically pressed. **The bit-to-key mapping is not published**; it would need reverse engineering on the owner's unit (send DT1 to turn the switch on, watch DT1 traffic while pressing single keys). Unverified that it works over USB rather than only Bluetooth. Not available on the AE-10 implementation.

**USB.** AE-10: class compliant. AE-20/AE-30: "USB Driver" = Generic (OS driver, **MIDI only**) or Vendor (Roland driver, MIDI and audio) (Parameter Guide p.7). Web MIDI works with Generic.

**Bluetooth MIDI.** AE-20, AE-30, AE-05, AE-01 all list GATT (BLE MIDI); the AE-10 has none. But Roland says the AE-20 does **not** support MIDI to a computer over Bluetooth, only audio from the computer ([KB 4414513873947](https://support.roland.com/hc/en-us/articles/4414513873947)), and the AE-30 Bluetooth is "for smartphones and tablets only" ([KB 9981147573147](https://support.roland.com/hc/en-us/articles/9981147573147)). The BLE MIDI link is paired from inside Roland's apps, not the phone's Bluetooth menu (AE-20 manual p.19). A browser app should treat **USB as the supported path** and BLE as experimental (macOS can sometimes expose BLE MIDI devices through Audio MIDI Setup, untested with an Aerophone).

---

## 4. Roland's companion apps

| App | Instruments | What it is |
|---|---|---|
| **Aerophone Lesson** | AE-20, AE-30 (v1.10+) only | Lesson / practice app (detail below) |
| Aerophone Pro Editor | AE-20, AE-30 | Scene and sound editor, remote control over BLE; system settings partly ([KB 4414836528923](https://support.roland.com/hc/en-us/articles/4414836528923)) |
| Aerophone Editor | AE-10 | Tone editor over USB ([Roland](https://www.roland.com/us/products/aerophone_editor/)) |
| Aerophone GO Plus | AE-05 | 50+ extra sounds played on the phone, 11 practice songs with on-screen fingering, guide melody, tempo, fingering accuracy and medals, play-along player (tempo, key, A/B repeat, center cancel), metronome, fingering / bite / breath settings ([Roland](https://www.roland.com/us/products/aerophone_go_plus/)) |
| Aerophone GO Ensemble | AE-05 (and AE-01 per KB title) | Up to seven players mixed on one phone, 19 sounds ([Roland Australia](https://rolandcorp.com.au/blog/aerophone-go-a-students-perspective)) |
| Aerophone mini Plus | AE-01 | 50+ sounds, 11 tutorial songs, interactive fingering display, tempo, fingering tracked as you play ([Roland](https://www.roland.com/us/products/aerophone_mini_plus/)) |
| Roland Cloud / Zenbeats | AE-20 (Sound Packs), AE-30 (also Wave Expansions) | Sound downloads; Zenbeats/Zentracker are general DAW apps Roland mentions alongside, no Aerophone-specific practice feature found ([AE-20 page](https://www.roland.com/id/products/aerophone_ae-20/)) |

**The owner's AE-10 has no Roland lesson app.** Aerophone Lesson lists only the AE-20 and AE-30 ([App Store](https://apps.apple.com/us/app/aerophone-lesson/id1574150293)).

### Aerophone Lesson in detail

Sources: Roland product and feature pages ([product](https://www.roland.com/us/products/aerophone_lesson/), [features](https://www.roland.com/us/products/aerophone_lesson/features/)), the seven gallery screenshots on that page (I viewed them; filenames `aerophone_lesson_{fingering,song,select_song,reward,scale,player,how_to_hold}_gal.jpg` under `static.roland.com/assets/images/products/gallery/`), the song list ([KB 4414721094811](https://support.roland.com/hc/en-us/articles/4414721094811)), and the App Store listing. iOS and Android ([Google Play id jp.co.roland.ae20lesson](https://play.google.com/store/apps/details?id=jp.co.roland.ae20lesson)), free, Bluetooth only.

- **Layout.** Portrait phone UI, four bottom tabs: **Fingering, Player, Lesson, CONNECT**. A grey status strip on every screen shows the transpose and device, e.g. "0(C) | AE-20". App Store reviewers report the tab bar only appears in portrait; landscape on iPad hides the navigation ([App Store reviews](https://apps.apple.com/us/app/aerophone-lesson/id1574150293)).
- **Onboarding.** "Before the lesson" carousel of seven short videos (attach the moisture band, neck strap, hold the instrument, mouthpiece, performance keys, clean the mouthpiece, water basin) with Back / Next and "Do not show this screen next time" ([Roland RTV quick start](https://www.roland.com/us/rtv/quick_start/ae-20_ae-30_lesson_quick_start/?lang=en-US)).
- **Fingering tab (live).** A large flat line drawing of the instrument's front, light grey outline on off-white, shown from the player's view: main keys as circles, X and P as small rounded shapes, the pinky table as a cluster of rounded rectangles, right side keys as three stacked trapezoids on the left edge, palm keys as squares on the right edge, and the four thumb octave keys drawn as crescents sticking out at the upper left. **Pressed keys fill solid orange** in real time; unpressed keys stay outlined. To the right: a card with the resulting note name in large type (e.g. "G4") over a one-note treble staff, then "Fingering Mode: Sax", "Transpose: 0(C)", and buttons for Fingering Chart, Tips and Settings. Roland: "When you press a key on Aerophone, the app shows you the corresponding musical note", and it follows the instrument's transpose and fingering changes. Roland's support calls this "fingering check mode" and recommends it for finding accidental key presses ([KB 5009239860251](https://support.roland.com/hc/en-us/articles/5009239860251)).
- **Breath.** "a colorful animation is displayed to help you learn to control your breath pressure" ([Roland](https://www.roland.com/us/products/aerophone_lesson/)). No screenshot shows it; I could not verify how it looks or whether it is a meter, a target, or decoration.
- **Lesson tab.** Two segments: **Fingering practice** (12 items) and **Repertoire** (11 songs). Fingering practice, in order: G A B; E F G; C D E; C D E F G; G A B C; C major scale; octave key practice (G A B C D); F major; G major; Bb major; D major; Eb major. Described as "flash card style". The scale screen shows the target note (e.g. "F4") with its staff, the instrument drawing with the required keys filled orange and **labelled with the finger to use** ("Index finger", "Middle finger", "Ring finger"), a ">" button, and a bottom bar with SPEED (100%), metronome (OFF) and volume.
- **Repertoire songs.** Twinkle Twinkle, Goin' Home, Grandfather's Clock, Amazing Grace, Jupiter, Träumerei, Je Te Veux, Bolero, Little Brown Jug, Pictures at an Exhibition, Csárdás; each listed with its duration (0:53 to 3:05) and the best medal earned. Song screen: two short staves at the top (the current bar in black with a green tick above each note played correctly and the current note in red; the next bar previewed above it in grey with letter names), the instrument drawing below showing the **target** fingering in orange, a pause button, and a bottom bar with SPEED %, metronome, guide melody on/off ("G" speaker) and volume. Roland: songs come "with a guide melody and fingering display" and need no notation reading.
- **Scoring.** Fingering is "tracked and scored". The end screen shows a medal ("Won a gold medal!"), a score ("100pt"), confetti, and Try Again / Select Song. The song list shows gold and a blue (lower tier) medal; the tier thresholds are not published. Scoring appears to be about **correct notes/fingerings**, not timing or breath (inferred; no source describes timing or dynamics scoring).
- **Player tab.** Load a file from the phone's library, Karaoke mode (vocal/lead cancel), A-B repeat, volume, speed and key sliders; audio plays through the Aerophone over Bluetooth audio.
- **Not present (as far as any source shows):** tuner, games, timing judgements, breath scoring, progress history, level system beyond the list order, notation for the user's own music.
- **Reception.** 1.8/5 from 4 ratings on the US App Store; complaints are about the landscape layout, the player not loading library songs, and the app working only for videos on one iPad. Last update 1.0.8 in April 2023 ([App Store](https://apps.apple.com/us/app/aerophone-lesson/id1574150293)).

---

## 5. Wind-controller practice material and pitfalls

Exercises used by teachers and makers:
- **Long tones** on one note, start short and lengthen, keep the level steady; add crescendo and decrescendo on the same note ([Akai EWI Solo guide](https://cdn.inmusicbrands.com/akai/ewisolo/EWI-Solo-User-Guide-v1_6.pdf), [Sax School Online](https://saxschoolonline.com/articles/ewi-tips-its-all-about-the-w/)).
- **Dynamic range**: "the biggest dynamic difference possible from barely audible, to lifting the roof off", as smooth as possible ([Sax School Online](https://saxschoolonline.com/articles/ewi-tips-its-all-about-the-w/)).
- **Articulation**: short notes with an identical attack at every volume (keep tongue movement small), then legato tonguing with the smallest gap between notes (same source).
- **Fingering drills and scales by key**: Roland's own order is 3-note groups, 5-note group, C major, an octave-key exercise, then F, G, Bb, D, Eb major ([KB 4414721094811](https://support.roland.com/hc/en-us/articles/4414721094811)). Fingering practice without blowing is possible with Hold Mode = Key ([KB 5008391478683](https://support.roland.com/hc/en-us/articles/5008391478683)).
- **Vibrato with the bite** (E-Wind mode) or a lever; on the Aerophone a held bite holds the bend, unlike the EWI where pitch returns to centre ([Patchman FAQ](https://www.patchmanmusic.com/WindControllerFAQ.html)).

Pitfalls specific to wind controllers and the Aerophone:
- **Breath curve too light** gives loud sound from small breaths and no room for quiet playing; one long-term AE-20 player settled on L3 with Breath Adjust at its factory 20 ([shuko-music-blog](https://shuko-music-blog.com/en/ae-20/operation/45-my-ae20-settings.html)). Beginners are pointed to the light curves by Roland itself (Parameter Guide p.3).
- **Threshold stammer**: soft playing right at the note-on trigger produces repeated note on/off ([gonzos.net](https://gonzos.net/projects/aerophone-ae-10-with-external-synth/)).
- **Bite in Sax mode makes the pitch flat** if the bite is loose, and can build a biting habit; Off or E-Wind suggested for beginners ([shuko-music-blog](https://shuko-music-blog.com/en/ae-20/operation/45-my-ae20-settings.html)); mouthpiece depth changes bite response (AE-20 manual p.6); recalibrate if bite misbehaves (manual p.14); Akai: "do not bite too hard" ([EWI Solo guide](https://cdn.inmusicbrands.com/akai/ewisolo/EWI-Solo-User-Guide-v1_6.pdf)).
- **Accidental keys**: palm on side keys, thumb on octave keys, finger on X / P / C5. Roland's fixes: slow down, check in Recorder mode (side keys disabled), use the Lesson app's live key view, disable unused keys with Key Function, raise Key Delay ([KB 5009239860251](https://support.roland.com/hc/en-us/articles/5009239860251), [KB 5007231266587](https://support.roland.com/hc/en-us/articles/5007231266587)).
- **Octave key system** takes months to get used to on any wind controller ([Patchman FAQ](https://www.patchmanmusic.com/WindControllerFAQ.html)). "Overblowing" does not exist: pitch register is set only by the thumb keys, so sax players who overblow get louder, not higher.
- **Clarinet mode repurposes the octave keys** ([KB 5008488803611](https://support.roland.com/hc/en-us/articles/5008488803611)).
- **Synths ignore breath unless programmed for it**, and velocity alone cannot make a note louder after the attack ([Patchman FAQ](https://www.patchmanmusic.com/WindControllerFAQ.html)).

---

## 6. Recommendations for the web app

Borrow from Roland:
1. The **live instrument view**: one front-view drawing using Roland's key names, keys filled when pressed, beside the sounding note on a staff and the current mode and transpose. Draw the octave keys as crescents and include C5 / Tf; give AE-10 users a 21-key drawing (hide C5).
2. **Target-fingering display with finger labels** for scales, and the next bar previewed during songs.
3. Roland's **graded order**: 3-note groups, 5 notes, C major, octave key, then F, G, Bb, D, Eb major.
4. Practice aids Roland has: speed %, metronome, guide melody toggle, A-B repeat, simple medals.
5. A short **first-run setup** (hold, mouthpiece, band) and a "check your keys" screen for accidental presses.

Do better:
1. **Support the AE-10** over USB. Roland's lesson app doesn't, and the owner may have one.
2. **Score timing and breath**, not only fingering: note-on timing windows, breath steadiness on long tones, swell shape, articulation length. The breath is right there in CC 2 and Roland only animates it.
3. **Show breath as a real meter with a target band** and a history trace (long-tone steadiness, crescendo shape), plus the threshold line so stammering near the trigger is visible.
4. **Calibration instead of assumptions**: ask the player to finger a known note (e.g. written G4, no octave key) and derive the transpose/octave offset from the received note number; auto-learn which CC carries breath (watch which controller moves when they blow) and the breath range (silent floor, comfortable forte); detect model via Identity Request.
5. **Transposing-instrument aware**: show written pitch for sax players while scoring on concert MIDI notes, with Bb / Eb / C presets.
6. **Diagnose wrong notes**: when the received note is a known side-key or octave-key neighbour of the target, say which key was probably pressed (e.g. "C3 side key by the palm"); on AE-20 add exact key state later if the Fingering Status SysEx can be decoded.
7. Teach the **octave keys and register break** explicitly (Bb4 / B4 / C5 / C#5 / D5 crossings) and bite vibrato as its own drill, which Roland's list does not.
8. Work in **landscape and on desktop**, the two places reviewers say Roland's app fails.
9. Keep progress history and adaptive difficulty; Roland's app has neither.

Things to verify on the owner's unit before building on them: model (AE-10 vs AE-20); which CC carries breath by default; whether bite comes as pitch bend; velocity behaviour; whether octave shift (not only transpose) changes MIDI note numbers; on an AE-20, whether MIDI flows over USB with [MIDI CONTROL] off, and the Fingering Status SysEx.
