# EQ and frequency ear training: research (2026-10-12)

Local reference for the "Studio ears" activity. Some sources were not accessible (AES papers, Harman manual, the full Corey book); uncited numbers are flagged.

## How established trainers structure it

- **SoundGym** ([games](https://www.soundgym.co/games)): Peak Master (find a boosted bell, toggle EQ on/off), Kit Cut (a cut), Bass Detective (50 to 400 Hz boost, [KVR](https://kvraudio.com/news/soundgym-releases-bass-detective-ear-training-game-46044)), DB King (level in dB), EQ Mirror/Knight (matching), Filter Expert, Dr. Compressor (which is more compressed), Compressionist, PanGirl/Stereohead (pan and width), Balance Memory, Delay Control (ms), Reverb Wizard, Distorted Reality. Daily workout: 5 games on short loops ([SOS](https://www.soundonsound.com/node/4923945)). Peak Master reportedly about +12 dB, wide band, narrowing with level (user reports).
- **Quiztones**: sine quiz, EQ quiz (toggle, pick frequency), gain quiz (1 to 16 dB), loops or own audio ([ProAudioFiles](https://theproaudiofiles.com/quiztones/)). Easy boost +10, hard boost +5, hard cut -10, expert 1/3-octave ([AppleVis](https://www.applevis.com/apps/ios/music/quiztones-eq-ear-training)).
- **TrainYourEars**: "Guess" (name the EQ, hear your wrong answer beside the right one) and "Correct" (fix a problem EQ); exercise designer for frequency, type, gain, Q; about 15 min a day ([site](https://www.trainyourears.com/)).
- **Harman How to Listen**: band identification (peaks, dips, both, LP/HP), attributes (bright/dull, full/thin, reverb, noise, hum, L/R balance), adaptive ([blog](https://harmanhowtolisten.blogspot.com/)). Starts treble/mid/bass, adds bands up to about 14 (forum reports).
- **Golden Ears (Moulton)**: boosts and cuts in ten octaves, from simple boosts in music to single-octave cuts in pink noise. Gain steps unverified.
- **EarQuiz Frequencies** (GPL, after Golden Ears): 15 presets; one octave band boosted in a limited range up to two 1/3-octave bands boosted or cut; ±12 dB octave, ±15 dB third-octave; each example 30% off, 40% on, 30% off with a 35 ms crossfade ([settings](https://earquiz.org/manuals/earquiz-frequencies-help/equalization-patterns-sliders-settings/), [processing](https://earquiz.org/manuals/earquiz-frequencies-help/audio-processing-settings/), [method](https://earquiz.org/manuals/earquiz-frequencies-help/basic-training-method)).
- **Corey, Technical Ear Trainer** ([webtet.net](https://webtet.net/)): parametric EQ, mid-side, reverb, compression, distortion, edit points; matching and identification. Grid believed octave or third-octave, 1 to 3 bands, ±12 down to ±3, fixed Q (unverified).
- **Research**: [Kaniwa, Kim et al. 2011](https://www.tara.tsukuba.ac.jp/~maki/reprint/Makino/kaniwa11smc439-443.pdf): 7 octave bands 125 Hz to 8 kHz, pink noise, orchestra, piano, headphones, ~30 min twice a week; weeks: +12/+6, +6/+3, cuts, mixed ±12; adaptive band weighting 25 to 100 by error rate helped on music ([follow-up](https://www.jstage.jst.go.jp/article/ast/34/6/34_E1312/_article)). [Marui and Kamekawa, AES 2018](https://www.slideshare.net/JikanBae/does-spectral-flatness-affect-the-difficulty-of-the-peak-frequency-identification-task-in-technical-ear-training): +12 dB, Q 2, 9 octaves 63 Hz to 16 kHz, ~78% on music around week 20; also "mean octaves off" (~0.3).

## Parameters

- Grid: octave centers 63 Hz to 16 kHz (9) or 31.5 Hz to 16 kHz (10); advanced third-octave (~30).
- Gain: +12, +6, +3 dB; cuts after boosts at the same size (cuts are harder).
- Q: 1.41 is one octave, 4.32 a third-octave; Q 2 common in research.
- Material: pink noise first, then music (harder, and where adaptive weighting helps).
- A/B: free toggle or an automatic off/on/off example.
- Level: constant, comfortable, OS enhancements off; WHO/ITU H.870 limit 80 dB for 40 h a week.
- Short sessions (2 to 4 exercises, 15 to 30 min). One playback setup throughout.

## Web Audio

- `BiquadFilterNode` `peaking`: frequency, gain (dB), Q (linear). Toggle its gain between 0 and the target with `setTargetAtTime(target, t, 0.01)` (~50 ms settle); no second path needed.
- Pink noise: pre-render 10 s or more at `ctx.sampleRate` with Paul Kellet's filter ([noisehack](https://noisehack.com/generate-noise-web-audio-api/)), loop, normalise RMS.
- Headroom: pre-attenuate by the largest boost; no compressor or limiter (it changes what is judged).
- Loudness: a boost being louder is a fair cue for finding the band; match RMS for "boost or cut" and "how many dB".
- Safari: start from a gesture; `navigator.audioSession.type = "playback"` where available; never hardcode the sample rate.

## For a hobbyist producer

Most valuable: octave peak identification on drums, bass and synths (especially 50 to 400 Hz), cuts, level differences in dB, compressed or not, pan position, delay time. Skippable: third-octave, 14-band levels, dual bands, mid-side, fine distortion and reverb-time, edit points, full EQ matching.

## Path proposal

1. 3 bands (250 Hz, 1 kHz, 4 kHz), +12 dB, pink noise; 9/10 on Check.
2. 5 bands, then 9 octave bands; 8/10.
3. Same on music loops and the app's drum kits; 7/10, an octave off counted as near.
4. Cuts at -12 dB, noise then music.
5. +6 then +3 dB.
6. Boost or cut, level differences in dB, compression on/off.
7. Optional third-octave.

Weight bands by error rate (Kaniwa). Its own path ("Studio ears"), linked from the MPC path for the kit, level, compression and delay drills. No published "done" thresholds; don't ask for more than ~78% on 9 music bands.
