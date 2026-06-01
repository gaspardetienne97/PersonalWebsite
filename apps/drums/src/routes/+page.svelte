<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { midiService } from '$lib/midi/MidiService.js';
	import { keyboardInput } from '$lib/midi/KeyboardInputService.js';
	import { MidiParser } from '$lib/midi/MidiParser.js';
	import { ValidationEngine } from '$lib/validation/index.js';
	import { audioEngine } from '$lib/audio/index.js';
	import NoteHighway from '$lib/components/NoteHighway.svelte';
	import { midiState, inputDevices, session, score, settings } from '$lib/stores/index.js';
	import type { MidiNote, Lesson, NoteResult } from '$lib/types/index.js';
	import * as m from '$lib/paraglide/messages.js';
	import * as Sheet from '@repo/ui/sheet';
	import { Button } from '@repo/ui/button';

	let validationEngine: ValidationEngine | null = null;
	let unsubscribeNoteHandler: (() => void) | null = null;
	let unsubscribeKeyboardHandler: (() => void) | null = null;
	let isInitialized = false;
	let selectedFile: File | null = null;
	let fileInput: HTMLInputElement;
	let resultsMap: Map<number, NoteResult> = new Map();
	let currentTime = 0;
	let animationFrame: number;
	let useKeyboard = true;
	let showKeyMapping = false;
	let settingsOpen = false;
	let showCountdown = false;
	let countdownValue = 4;

	// Demo lesson
	const demoLesson: Lesson = {
		id: 'demo-1',
		version: 1,
		title: 'Basic Rock Beat',
		description: 'Learn a simple rock beat pattern',
		author: 'Demo',
		difficulty: 'beginner',
		genre: 'rock',
		tags: ['beginner', 'rock'],
		bpm: 120,
		timeSignature: [4, 4],
		duration: 16000,
		tips: ['Keep steady tempo', 'Focus on timing'],
		notes: [
			// Bar 1
			{ time: 0, note: 36, velocity: 100, duration: 100 }, // Kick
			{ time: 0, note: 42, velocity: 80, duration: 100 }, // HH
			{ time: 500, note: 38, velocity: 90, duration: 100 }, // Snare
			{ time: 500, note: 42, velocity: 80, duration: 100 }, // HH
			{ time: 1000, note: 36, velocity: 100, duration: 100 }, // Kick
			{ time: 1000, note: 42, velocity: 80, duration: 100 }, // HH
			{ time: 1500, note: 38, velocity: 90, duration: 100 }, // Snare
			{ time: 1500, note: 42, velocity: 80, duration: 100 }, // HH
			// Bar 2
			{ time: 2000, note: 36, velocity: 100, duration: 100 },
			{ time: 2000, note: 42, velocity: 80, duration: 100 },
			{ time: 2500, note: 38, velocity: 90, duration: 100 },
			{ time: 2500, note: 42, velocity: 80, duration: 100 },
			{ time: 3000, note: 36, velocity: 100, duration: 100 },
			{ time: 3000, note: 42, velocity: 80, duration: 100 },
			{ time: 3500, note: 38, velocity: 90, duration: 100 },
			{ time: 3500, note: 42, velocity: 80, duration: 100 },
			// Bar 3
			{ time: 4000, note: 36, velocity: 100, duration: 100 },
			{ time: 4000, note: 42, velocity: 80, duration: 100 },
			{ time: 4500, note: 38, velocity: 90, duration: 100 },
			{ time: 4500, note: 42, velocity: 80, duration: 100 },
			{ time: 5000, note: 36, velocity: 100, duration: 100 },
			{ time: 5000, note: 42, velocity: 80, duration: 100 },
			{ time: 5500, note: 38, velocity: 90, duration: 100 },
			{ time: 5500, note: 42, velocity: 80, duration: 100 },
			// Bar 4
			{ time: 6000, note: 36, velocity: 100, duration: 100 },
			{ time: 6000, note: 42, velocity: 80, duration: 100 },
			{ time: 6500, note: 38, velocity: 90, duration: 100 },
			{ time: 6500, note: 42, velocity: 80, duration: 100 },
			{ time: 7000, note: 36, velocity: 100, duration: 100 },
			{ time: 7000, note: 42, velocity: 80, duration: 100 },
			{ time: 7500, note: 38, velocity: 90, duration: 100 },
			{ time: 7500, note: 42, velocity: 80, duration: 100 }
		]
	};

	onMount(async () => {
		await init();
	});

	onDestroy(() => {
		cleanup();
	});

	async function init() {
		// Initialize MIDI
		const midiSuccess = await midiService.initialize();

		// Initialize Audio
		const audioSuccess = await audioEngine.initialize();

		// Apply initial volume from settings
		audioEngine.setMasterVolume($settings.masterVolume);

		// Set up validation engine with timing windows from settings
		validationEngine = new ValidationEngine($settings.timingWindows);

		// Load demo lesson
		loadLesson(demoLesson);

		// Enable keyboard input by default
		if (useKeyboard) {
			enableKeyboard();
		}

		isInitialized = audioSuccess;
	}

	function cleanup() {
		if (unsubscribeNoteHandler) {
			unsubscribeNoteHandler();
		}
		if (unsubscribeKeyboardHandler) {
			unsubscribeKeyboardHandler();
		}
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
		keyboardInput.deactivate();
		audioEngine.stopMetronome();
	}

	function enableKeyboard() {
		keyboardInput.activate();
		unsubscribeKeyboardHandler = keyboardInput.onNoteOn((note: MidiNote) => {
			handleNoteInput(note);
		});
		useKeyboard = true;
	}

	function disableKeyboard() {
		if (unsubscribeKeyboardHandler) {
			unsubscribeKeyboardHandler();
		}
		keyboardInput.deactivate();
		useKeyboard = false;
	}

	function toggleKeyboard() {
		if (useKeyboard) {
			disableKeyboard();
		} else {
			enableKeyboard();
		}
	}

	function loadLesson(lesson: Lesson) {
		session.update((s) => ({
			...s,
			lesson,
			isLoaded: true,
			tempo: lesson.bpm,
			currentTime: 0,
			results: [],
			currentNoteIndex: 0
		}));

		validationEngine?.loadNotes(lesson.notes);
		resultsMap.clear();
	}

	function selectDevice(id: string) {
		if (unsubscribeNoteHandler) {
			unsubscribeNoteHandler();
		}

		midiService.selectInput(id);

		unsubscribeNoteHandler = midiService.onNoteOn((note: MidiNote) => {
			handleNoteInput(note);
		});
	}

	function handleNoteInput(note: MidiNote) {
		if (!validationEngine || !$session.isPlaying) return;

		const result = validationEngine.processNote(note, currentTime);
		if (result) {
			const noteIndex = $session.lesson?.notes.findIndex(
				(n) => n.time === result.expectedTime && n.note === result.expectedNote
			);
			if (noteIndex !== undefined && noteIndex >= 0) {
				resultsMap.set(noteIndex, result);
				resultsMap = new Map(resultsMap);
			}

			// Update session results
			session.update((s) => ({
				...s,
				results: validationEngine!.getResults()
			}));
		}
	}

	function togglePlayback() {
		if ($session.isPlaying) {
			pausePlayback();
		} else {
			startPlayback();
		}
	}

	async function startPlayback() {
		if (!validationEngine || !$session.lesson) return;

		// Show countdown if enabled
		if ($settings.countIn.enabled) {
			showCountdown = true;
			const beatsPerBar = $session.lesson.timeSignature[0];
			const totalBeats = $settings.countIn.bars * beatsPerBar;
			const bpm = Math.round(($session.lesson.bpm * $session.tempo) / 100);
			const beatDuration = 60000 / bpm; // ms per beat

			// Start metronome for count-in if audible is enabled
			if ($settings.countIn.audible) {
				audioEngine.setTempo(bpm);
				audioEngine.startMetronome(bpm, $session.lesson.timeSignature);
			}

			// Count down
			for (let i = totalBeats; i > 0; i--) {
				countdownValue = i;
				await new Promise((resolve) => setTimeout(resolve, beatDuration));
			}

			// Stop metronome after count-in
			if ($settings.countIn.audible) {
				audioEngine.stopMetronome();
			}

			showCountdown = false;
		}

		validationEngine.start();
		audioEngine.setTempo($session.tempo);

		session.update((s) => ({ ...s, isPlaying: true, isPaused: false }));

		updateLoop();
	}

	function pausePlayback() {
		session.update((s) => ({ ...s, isPlaying: false, isPaused: true }));
		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
	}

	function stopPlayback() {
		session.update((s) => ({
			...s,
			isPlaying: false,
			isPaused: false,
			currentTime: 0,
			results: [],
			currentNoteIndex: 0
		}));

		currentTime = 0;
		resultsMap.clear();
		validationEngine?.reset();

		if (animationFrame) {
			cancelAnimationFrame(animationFrame);
		}
	}

	function updateLoop() {
		if (!$session.isPlaying) return;

		currentTime += 16; // ~60fps

		// Check for missed notes
		validationEngine?.checkMissedNotes(currentTime);

		session.update((s) => ({
			...s,
			currentTime,
			results: validationEngine!.getResults()
		}));

		// Update results map
		const allResults = validationEngine?.getResults() || [];
		allResults.forEach((result, idx) => {
			resultsMap.set(idx, result);
		});
		resultsMap = new Map(resultsMap);

		// Check if lesson is complete
		if ($session.lesson && currentTime >= $session.lesson.duration) {
			stopPlayback();
			return;
		}

		animationFrame = requestAnimationFrame(updateLoop);
	}

	async function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

		try {
			const parsed = await MidiParser.loadFromFile(file);
			const lesson = MidiParser.toLesson(parsed, {
				title: file.name.replace('.mid', ''),
				difficulty: 'intermediate'
			});

			loadLesson(lesson);
		} catch (err) {
			console.error('Failed to parse MIDI file:', err);
			alert('Failed to load MIDI file. Please try another file.');
		}
	}

	function loadDemoLesson() {
		loadLesson(demoLesson);
	}
</script>

<svelte:head>
	<title>Finger Drumming Practice</title>
</svelte:head>

<div class="min-h-screen bg-gray-900 text-white p-8">
	<div class="max-w-7xl mx-auto space-y-6">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div class="text-center flex-1">
				<h1 class="text-4xl font-bold mb-2">Finger Drumming Practice</h1>
				<p class="text-gray-400">Practice drumming with MIDI controller feedback</p>
			</div>
			<Sheet.Root bind:open={settingsOpen}>
				<Sheet.Trigger class="ml-4">
					<button
						class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 w-10"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							width="20"
							height="20"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							stroke-linejoin="round"
						>
							<path
								d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
							></path>
							<circle cx="12" cy="12" r="3"></circle>
						</svg>
						<span class="sr-only">Settings</span>
					</button>
				</Sheet.Trigger>
				<Sheet.Portal>
					<Sheet.Overlay />
					<Sheet.Content side="right" class="w-[400px] sm:w-[540px]">
						<Sheet.Header>
							<Sheet.Title>Settings</Sheet.Title>
							<Sheet.Description>Configure your practice session settings</Sheet.Description>
						</Sheet.Header>

						<div class="py-6 space-y-6">
							<!-- Audio Settings -->
							<div class="space-y-4">
								<h3 class="text-lg font-semibold">Audio</h3>

								<div class="space-y-2">
									<label class="block text-sm font-medium">
										Master Volume: {$settings.masterVolume}%
									</label>
									<input
										type="range"
										min="0"
										max="100"
										value={$settings.masterVolume}
										oninput={(e) => {
											const val = parseInt(e.currentTarget.value);
											settings.update((s) => ({ ...s, masterVolume: val }));
											audioEngine.setMasterVolume(val);
										}}
										class="w-full"
									/>
								</div>

								<div class="space-y-2">
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={$settings.metronome.enabled}
											onchange={(e) =>
												settings.update((s) => ({
													...s,
													metronome: { ...s.metronome, enabled: e.currentTarget.checked }
												}))}
											class="rounded"
										/>
										<span class="text-sm">Enable Metronome</span>
									</label>
								</div>

								{#if $settings.metronome.enabled}
									<div class="space-y-2 ml-6">
										<label class="block text-sm font-medium">
											Metronome Volume: {$settings.metronome.volume}%
										</label>
										<input
											type="range"
											min="0"
											max="100"
											value={$settings.metronome.volume}
											oninput={(e) =>
												settings.update((s) => ({
													...s,
													metronome: { ...s.metronome, volume: parseInt(e.currentTarget.value) }
												}))}
											class="w-full"
										/>
									</div>
								{/if}
							</div>

							<!-- Timing Settings -->
							<div class="space-y-4">
								<h3 class="text-lg font-semibold">Timing Windows</h3>

								<div class="space-y-2">
									<label class="block text-sm font-medium">
										Perfect: ±{$settings.timingWindows.perfect}ms
									</label>
									<input
										type="range"
										min="10"
										max="50"
										value={$settings.timingWindows.perfect}
										oninput={(e) =>
											settings.update((s) => ({
												...s,
												timingWindows: { ...s.timingWindows, perfect: parseInt(e.currentTarget.value) }
											}))}
										class="w-full"
									/>
								</div>

								<div class="space-y-2">
									<label class="block text-sm font-medium">
										Good: ±{$settings.timingWindows.good}ms
									</label>
									<input
										type="range"
										min="20"
										max="100"
										value={$settings.timingWindows.good}
										oninput={(e) =>
											settings.update((s) => ({
												...s,
												timingWindows: { ...s.timingWindows, good: parseInt(e.currentTarget.value) }
											}))}
										class="w-full"
									/>
								</div>

								<div class="space-y-2">
									<label class="block text-sm font-medium">
										Miss: ±{$settings.timingWindows.miss}ms
									</label>
									<input
										type="range"
										min="50"
										max="200"
										value={$settings.timingWindows.miss}
										oninput={(e) =>
											settings.update((s) => ({
												...s,
												timingWindows: { ...s.timingWindows, miss: parseInt(e.currentTarget.value) }
											}))}
										class="w-full"
									/>
								</div>
							</div>

							<!-- Playback Speed -->
							<div class="space-y-4">
								<h3 class="text-lg font-semibold">Playback Speed</h3>

								<div class="space-y-2">
									<label class="block text-sm font-medium">
										Speed: {$session.tempo}% ({Math.round(
											($session.lesson?.bpm || 120) * ($session.tempo / 100)
										)}
										BPM)
									</label>
									<input
										type="range"
										min="50"
										max="150"
										step="5"
										value={$session.tempo}
										oninput={(e) => {
											const speed = parseInt(e.currentTarget.value);
											session.update((s) => ({ ...s, tempo: speed }));
											if ($session.lesson) {
												const newBpm = Math.round(($session.lesson.bpm * speed) / 100);
												audioEngine.setTempo(newBpm);
											}
										}}
										class="w-full"
									/>
									<div class="flex justify-between text-xs text-gray-400">
										<span>50% (Slow)</span>
										<span>100% (Normal)</span>
										<span>150% (Fast)</span>
									</div>
								</div>

								<div class="flex gap-2">
									<button
										class="flex-1 px-3 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 transition-colors"
										onclick={() => {
											session.update((s) => ({ ...s, tempo: 75 }));
											if ($session.lesson) {
												audioEngine.setTempo(Math.round(($session.lesson.bpm * 75) / 100));
											}
										}}
									>
										75% Practice
									</button>
									<button
										class="flex-1 px-3 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 transition-colors"
										onclick={() => {
											session.update((s) => ({ ...s, tempo: 100 }));
											if ($session.lesson) {
												audioEngine.setTempo($session.lesson.bpm);
											}
										}}
									>
										100% Normal
									</button>
									<button
										class="flex-1 px-3 py-2 text-sm rounded bg-gray-700 hover:bg-gray-600 transition-colors"
										onclick={() => {
											session.update((s) => ({ ...s, tempo: 125 }));
											if ($session.lesson) {
												audioEngine.setTempo(Math.round(($session.lesson.bpm * 125) / 100));
											}
										}}
									>
										125% Challenge
									</button>
								</div>
							</div>

							<!-- Count-In Settings -->
							<div class="space-y-4">
								<h3 class="text-lg font-semibold">Count-In</h3>

								<div class="space-y-2">
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={$settings.countIn.enabled}
											onchange={(e) =>
												settings.update((s) => ({
													...s,
													countIn: { ...s.countIn, enabled: e.currentTarget.checked }
												}))}
											class="rounded"
										/>
										<span class="text-sm">Enable Count-In</span>
									</label>
								</div>

								{#if $settings.countIn.enabled}
									<div class="space-y-2">
										<label class="block text-sm font-medium">
											Bars: {$settings.countIn.bars}
										</label>
										<div class="flex gap-2">
											<button
												class="flex-1 px-3 py-2 text-sm rounded transition-colors {$settings.countIn
													.bars === 1
													? 'bg-blue-600 hover:bg-blue-500'
													: 'bg-gray-700 hover:bg-gray-600'}"
												onclick={() =>
													settings.update((s) => ({
														...s,
														countIn: { ...s.countIn, bars: 1 }
													}))}
											>
												1 Bar
											</button>
											<button
												class="flex-1 px-3 py-2 text-sm rounded transition-colors {$settings.countIn
													.bars === 2
													? 'bg-blue-600 hover:bg-blue-500'
													: 'bg-gray-700 hover:bg-gray-600'}"
												onclick={() =>
													settings.update((s) => ({
														...s,
														countIn: { ...s.countIn, bars: 2 }
													}))}
											>
												2 Bars
											</button>
											<button
												class="flex-1 px-3 py-2 text-sm rounded transition-colors {$settings.countIn
													.bars === 4
													? 'bg-blue-600 hover:bg-blue-500'
													: 'bg-gray-700 hover:bg-gray-600'}"
												onclick={() =>
													settings.update((s) => ({
														...s,
														countIn: { ...s.countIn, bars: 4 }
													}))}
											>
												4 Bars
											</button>
										</div>
									</div>

									<div class="space-y-2">
										<label class="flex items-center gap-2">
											<input
												type="checkbox"
												checked={$settings.countIn.audible}
												onchange={(e) =>
													settings.update((s) => ({
														...s,
														countIn: { ...s.countIn, audible: e.currentTarget.checked }
													}))}
												class="rounded"
											/>
											<span class="text-sm">Audible (metronome clicks)</span>
										</label>
									</div>

									<div class="space-y-2">
										<label class="flex items-center gap-2">
											<input
												type="checkbox"
												checked={$settings.countIn.visual}
												onchange={(e) =>
													settings.update((s) => ({
														...s,
														countIn: { ...s.countIn, visual: e.currentTarget.checked }
													}))}
												class="rounded"
											/>
											<span class="text-sm">Visual countdown</span>
										</label>
									</div>
								{/if}
							</div>

							<!-- Practice Mode Settings -->
							<div class="space-y-4">
								<h3 class="text-lg font-semibold">Practice Mode</h3>

								<div class="space-y-2">
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={$settings.practiceMode.noFail}
											onchange={(e) =>
												settings.update((s) => ({
													...s,
													practiceMode: { ...s.practiceMode, noFail: e.currentTarget.checked }
												}))}
											class="rounded"
										/>
										<span class="text-sm">No Fail Mode (continue even with mistakes)</span>
									</label>
								</div>

								<div class="space-y-2">
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={$settings.practiceMode.waitMode}
											onchange={(e) =>
												settings.update((s) => ({
													...s,
													practiceMode: { ...s.practiceMode, waitMode: e.currentTarget.checked }
												}))}
											class="rounded"
										/>
										<span class="text-sm">Wait Mode (pause until you hit the note)</span>
									</label>
								</div>
							</div>

							<!-- Reduce Animations -->
							<div class="space-y-4">
								<h3 class="text-lg font-semibold">Accessibility</h3>

								<div class="space-y-2">
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={$settings.reduceAnimations}
											onchange={(e) =>
												settings.update((s) => ({ ...s, reduceAnimations: e.currentTarget.checked }))}
											class="rounded"
										/>
										<span class="text-sm">Reduce Animations</span>
									</label>
								</div>
							</div>
						</div>

						<Sheet.Footer>
							<button
								class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
								onclick={() => {
									settings.reset();
								}}
							>
								Reset to Defaults
							</button>
							<Sheet.Close>
								<button
									class="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
								>
									Close
								</button>
							</Sheet.Close>
						</Sheet.Footer>
					</Sheet.Content>
				</Sheet.Portal>
			</Sheet.Root>
		</div>

		<!-- Input Method Selection -->
		<div class="bg-gray-800 rounded-lg p-6">
			<h2 class="text-xl font-semibold mb-4">Input Method</h2>

			<div class="space-y-4">
				<!-- Keyboard Input -->
				<div class="bg-gray-700 p-4 rounded">
					<div class="flex items-center justify-between mb-2">
						<div>
							<h3 class="font-semibold">Keyboard Input</h3>
							<p class="text-sm text-gray-400">Use your computer keyboard to play</p>
						</div>
						<button
							class="px-4 py-2 rounded transition-colors {useKeyboard
								? 'bg-green-600 hover:bg-green-700'
								: 'bg-gray-600 hover:bg-gray-500'}"
							onclick={toggleKeyboard}
						>
							{useKeyboard ? 'Enabled' : 'Disabled'}
						</button>
					</div>

					{#if useKeyboard}
						<button
							class="text-sm text-indigo-400 hover:text-indigo-300"
							onclick={() => (showKeyMapping = !showKeyMapping)}
						>
							{showKeyMapping ? 'Hide' : 'Show'} Key Mapping
						</button>

						{#if showKeyMapping}
							<div class="mt-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
								{#each Object.entries(keyboardInput.getKeyMap()) as [_, mapping]}
									<div class="bg-gray-800 p-2 rounded">
										<span class="font-mono font-bold text-indigo-400">{mapping.key}</span>
										<span class="text-gray-400 ml-1">→ {mapping.name}</span>
									</div>
								{/each}
							</div>
						{/if}
					{/if}
				</div>

				<!-- MIDI Controller -->
				<div class="bg-gray-700 p-4 rounded">
					<h3 class="font-semibold mb-2">MIDI Controller</h3>

					{#if $midiState.error}
						<div class="bg-red-900/50 border border-red-500 p-3 rounded mb-3 text-sm">
							<p class="text-red-200">{$midiState.error}</p>
						</div>
					{/if}

					{#if $midiState.isSupported}
						<div class="space-y-3">
							<div class="flex items-center gap-3 text-sm">
								<span class="text-gray-400">MIDI API:</span>
								<span class="text-green-400">✅ Supported</span>
							</div>

							{#if $inputDevices.length > 0}
								<div>
									<label class="block text-sm text-gray-400 mb-2">Connected Devices:</label>
									<div class="space-y-2">
										{#each $inputDevices as device}
											<button
												class="w-full text-left p-3 rounded transition-colors text-sm {$midiState.activeInputId ===
												device.id
													? 'bg-indigo-600'
													: 'bg-gray-800 hover:bg-gray-600'}"
												onclick={() => selectDevice(device.id)}
											>
												<span class="font-medium">{device.name}</span>
												<span class="text-gray-400 ml-2">({device.manufacturer})</span>
											</button>
										{/each}
									</div>
								</div>
							{:else}
								<p class="text-sm text-gray-400">
									No MIDI devices detected. Connect a device and refresh the page.
								</p>
							{/if}

							{#if $midiState.lastNote}
								<div class="text-sm text-gray-400">
									Last Note: {$midiState.lastNote.note} | Velocity: {$midiState.lastNote.velocity}
								</div>
							{/if}
						</div>
					{:else}
						<p class="text-sm text-gray-400">Web MIDI not supported in this browser.</p>
					{/if}
				</div>
			</div>
		</div>

		<!-- Lesson Selection -->
		<div class="bg-gray-800 rounded-lg p-6">
			<h2 class="text-xl font-semibold mb-4">Lesson</h2>

			<div class="space-y-4">
				<div>
					<button
						class="bg-indigo-600 hover:bg-indigo-700 px-4 py-2 rounded transition-colors"
						onclick={loadDemoLesson}
					>
						Load Demo Lesson
					</button>
				</div>

				<div>
					<label class="block text-sm text-gray-400 mb-2">Or upload MIDI file:</label>
					<input
						type="file"
						accept=".mid,.midi"
						bind:this={fileInput}
						onchange={handleFileUpload}
						class="bg-gray-700 p-2 rounded w-full"
					/>
				</div>

				{#if $session.lesson}
					<div class="bg-gray-700 p-4 rounded">
						<h3 class="font-semibold">{$session.lesson.title}</h3>
						<p class="text-sm text-gray-400">{$session.lesson.description}</p>
						<div class="flex gap-4 mt-2 text-sm">
							<span>BPM: {$session.lesson.bpm}</span>
							<span>Difficulty: {$session.lesson.difficulty}</span>
							<span>Notes: {$session.lesson.notes.length}</span>
						</div>
					</div>
				{/if}
			</div>
		</div>

		<!-- Note Highway -->
		{#if $session.lesson}
			<div class="bg-gray-800 rounded-lg p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-xl font-semibold">Practice Highway</h2>
					{#if useKeyboard}
						<div class="text-sm text-gray-400">
							Press keys to play: <span class="font-mono text-indigo-400"
								>SPACE, Q, A, Z for basics</span
							>
						</div>
					{/if}
				</div>
				<div class="h-[500px] relative">
					<!-- Countdown Overlay -->
					{#if showCountdown && $settings.countIn.visual}
						<div
							class="absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
						>
							<div class="text-center">
								<div class="text-9xl font-bold text-white mb-4 animate-pulse">
									{countdownValue}
								</div>
								<div class="text-2xl text-gray-300">Get Ready...</div>
							</div>
						</div>
					{/if}

					<NoteHighway
						notes={$session.lesson.notes}
						{currentTime}
						lookAhead={2000}
						results={resultsMap}
					/>
				</div>
			</div>

			<!-- Transport Controls -->
			<div class="bg-gray-800 rounded-lg p-6">
				<div class="flex gap-4 items-center justify-center">
					<button
						class="bg-indigo-600 hover:bg-indigo-700 px-6 py-3 rounded-lg text-lg font-semibold transition-colors"
						onclick={togglePlayback}
					>
						{$session.isPlaying ? 'Pause' : 'Play'}
					</button>

					<button
						class="bg-gray-700 hover:bg-gray-600 px-6 py-3 rounded-lg transition-colors"
						onclick={stopPlayback}
					>
						Stop
					</button>

					<div class="text-sm text-gray-400">
						Time: {(currentTime / 1000).toFixed(2)}s / {($session.lesson.duration / 1000).toFixed(
							0
						)}s
					</div>
				</div>
			</div>

			<!-- Score Display -->
			<div class="bg-gray-800 rounded-lg p-6">
				<h2 class="text-xl font-semibold mb-4">Score</h2>

				<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
					<div class="text-center">
						<div class="text-3xl font-bold text-green-400">{$score.perfectHits}</div>
						<div class="text-sm text-gray-400">Perfect</div>
					</div>

					<div class="text-center">
						<div class="text-3xl font-bold text-yellow-400">{$score.goodHits}</div>
						<div class="text-sm text-gray-400">Good</div>
					</div>

					<div class="text-center">
						<div class="text-3xl font-bold text-red-400">{$score.misses}</div>
						<div class="text-sm text-gray-400">Misses</div>
					</div>

					<div class="text-center">
						<div class="text-3xl font-bold text-indigo-400">{$score.accuracy}%</div>
						<div class="text-sm text-gray-400">Accuracy</div>
					</div>
				</div>

				<div class="mt-4 text-center">
					<div class="text-4xl font-bold">{$score.grade}</div>
					<div class="text-sm text-gray-400">Grade</div>
				</div>

				<div class="mt-4 flex justify-center gap-8 text-sm text-gray-400">
					<div>Streak: {$score.currentStreak}</div>
					<div>Max Streak: {$score.maxStreak}</div>
				</div>
			</div>
		{/if}
	</div>
</div>
