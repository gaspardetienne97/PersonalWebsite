<script lang="ts">
	import { onMount } from 'svelte';
	import { pdfStore } from '$lib/stores/pdf-reader/pdf.svelte';
	import { audioStore } from '$lib/stores/pdf-reader/audio.svelte';
	import { Button } from '@repo/ui/button';
	import { Slider } from '@repo/ui/slider';
	import { Label } from '@repo/ui/label';
	import { Progress } from '@repo/ui/progress';
	import * as Select from '@repo/ui/select';
	import { Play, Pause, Square, SkipBack, SkipForward } from 'lucide-svelte';

	onMount(async () => {
		await audioStore.initialize();
	});

	async function handlePlay() {
		// Load sentences from current page if not already loaded
		if (audioStore.progress.total === 0) {
			const textContent = await pdfStore.getPageText(pdfStore.currentPage);
			if (textContent) {
				audioStore.loadSentences(textContent.sentences);
			}
		}

		audioStore.play();
	}

	function handlePause() {
		audioStore.pause();
	}

	function handleStop() {
		audioStore.stop();
	}

	// State for sliders
	let rateValue = $state(audioStore.rate);
	let volumeValue = $state(audioStore.volume);

	// Update store when slider values change
	$effect(() => {
		audioStore.setRate(rateValue);
	});

	$effect(() => {
		audioStore.setVolume(volumeValue);
	});

	// Sync slider values with store changes
	$effect(() => {
		rateValue = audioStore.rate;
	});

	$effect(() => {
		volumeValue = audioStore.volume;
	});

	// Voice selection - syncs with audioStore
	let selectedVoiceId = $state(audioStore.selectedVoice?.id ?? '');

	// When selectedVoiceId changes, update the store
	$effect(() => {
		if (selectedVoiceId) {
			const voice = audioStore.voices.find((v) => v.id === selectedVoiceId);
			if (voice && voice.id !== audioStore.selectedVoice?.id) {
				audioStore.setVoice(voice);
			}
		}
	});

	// Sync from store to component
	$effect(() => {
		if (audioStore.selectedVoice?.id && audioStore.selectedVoice.id !== selectedVoiceId) {
			selectedVoiceId = audioStore.selectedVoice.id;
		}
	});
</script>

<div class="bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-4">
	<div class="max-w-4xl mx-auto space-y-4">
		<!-- Playback Controls -->
		<div class="flex items-center justify-center gap-2">
			<Button variant="outline" size="icon" onclick={() => audioStore.skipBackward()} disabled={!audioStore.isInitialized}>
				<SkipBack class="h-4 w-4" />
			</Button>

			{#if audioStore.isPlaying}
				<Button size="icon" onclick={handlePause}>
					<Pause class="h-4 w-4" />
				</Button>
			{:else}
				<Button size="icon" onclick={handlePlay} disabled={!audioStore.isInitialized || !pdfStore.document}>
					<Play class="h-4 w-4" />
				</Button>
			{/if}

			<Button variant="outline" size="icon" onclick={handleStop} disabled={!audioStore.isInitialized}>
				<Square class="h-4 w-4" />
			</Button>

			<Button variant="outline" size="icon" onclick={() => audioStore.skipForward()} disabled={!audioStore.isInitialized}>
				<SkipForward class="h-4 w-4" />
			</Button>
		</div>

		<!-- Progress -->
		{#if audioStore.progress.total > 0}
			<div class="space-y-2">
				<div class="text-center text-sm text-slate-600 dark:text-slate-400">
					Sentence {audioStore.progress.current} of {audioStore.progress.total}
				</div>
				<Progress value={audioStore.progress.percentage} max={100} class="w-full" />
			</div>
		{/if}

		<!-- Voice and Speed Controls -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
			<!-- Voice Selection -->
			<div class="space-y-2">
				<Label for="voice-select">Voice</Label>
				<Select.Root type="single" bind:value={selectedVoiceId}>
					<Select.Trigger id="voice-select" class="w-full">
						{audioStore.selectedVoice?.name ?? 'Select a voice'}
					</Select.Trigger>
					<Select.Content>
						<Select.Group>
							{#each audioStore.voices as voice (voice.id)}
								<Select.Item value={voice.id} label={voice.name}>
									{voice.name}
								</Select.Item>
							{/each}
						</Select.Group>
					</Select.Content>
				</Select.Root>
			</div>

			<!-- Rate Control -->
			<div class="space-y-2">
				<Label for="rate-slider">
					Speed: {rateValue.toFixed(1)}x
				</Label>
				<Slider
					id="rate-slider"
					type="single"
					bind:value={rateValue}
					min={0.5}
					max={2}
					step={0.1}
					class="w-full"
				/>
			</div>

			<!-- Volume Control -->
			<div class="space-y-2">
				<Label for="volume-slider">
					Volume: {Math.round(volumeValue * 100)}%
				</Label>
				<Slider
					id="volume-slider"
					type="single"
					bind:value={volumeValue}
					min={0}
					max={1}
					step={0.1}
					class="w-full"
				/>
			</div>
		</div>
	</div>
</div>
