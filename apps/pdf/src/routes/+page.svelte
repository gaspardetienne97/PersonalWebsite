<script lang="ts">
	import { onMount } from 'svelte';
	import PdfViewer from '$lib/components/pdf-reader/PdfViewer.svelte';
	import PdfControls from '$lib/components/pdf-reader/PdfControls.svelte';
	import AudioControls from '$lib/components/pdf-reader/AudioControls.svelte';
	import FileUploader from '$lib/components/pdf-reader/FileUploader.svelte';
	import { pdfStore } from '$lib/stores/pdf-reader/pdf.svelte';
	import { Card } from '@repo/ui/card';

	let mounted = $state(false);

	onMount(() => {
		mounted = true;
	});
</script>

<svelte:head>
	<title>PDF Reader & Narrator</title>
	<meta name="description" content="Read PDFs with text-to-speech narration" />
</svelte:head>

<div class="min-h-screen bg-slate-50 dark:bg-slate-950">
	<header class="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
		<div class="max-w-7xl mx-auto px-4 py-6">
			<h1 class="text-3xl font-bold">PDF Reader & Narrator</h1>
			<p class="text-slate-600 dark:text-slate-400 mt-2">
				Upload a PDF and listen to it with text-to-speech
			</p>
		</div>
	</header>

	<main class="max-w-7xl mx-auto px-4 py-8">
		{#if mounted}
			{#if !pdfStore.document}
				<Card class="max-w-2xl mx-auto">
					<FileUploader />
				</Card>
			{:else}
				<div class="space-y-4">
					<!-- PDF Controls -->
					<Card>
						<PdfControls />
					</Card>

					<!-- PDF Viewer -->
					<Card>
						<PdfViewer />
					</Card>

					<!-- Audio Controls -->
					<Card>
						<AudioControls />
					</Card>

					<!-- Info Panel -->
					{#if pdfStore.document.metadata.title || pdfStore.document.metadata.author}
						<Card class="p-4">
							<h3 class="font-semibold mb-2">Document Information</h3>
							<dl class="space-y-1 text-sm">
								{#if pdfStore.document.metadata.title}
									<div class="grid grid-cols-3">
										<dt class="text-slate-600 dark:text-slate-400">Title:</dt>
										<dd class="col-span-2">{pdfStore.document.metadata.title}</dd>
									</div>
								{/if}
								{#if pdfStore.document.metadata.author}
									<div class="grid grid-cols-3">
										<dt class="text-slate-600 dark:text-slate-400">Author:</dt>
										<dd class="col-span-2">{pdfStore.document.metadata.author}</dd>
									</div>
								{/if}
								<div class="grid grid-cols-3">
									<dt class="text-slate-600 dark:text-slate-400">Pages:</dt>
									<dd class="col-span-2">{pdfStore.document.numPages}</dd>
								</div>
							</dl>
						</Card>
					{/if}

					<!-- Text Extraction Progress -->
					{#if pdfStore.isTextExtracting}
						<Card class="p-4">
							<p class="text-sm text-slate-600 dark:text-slate-400">
								Extracting text for narration... {pdfStore.textExtractionProgress}%
							</p>
						</Card>
					{/if}
				</div>
			{/if}
		{/if}
	</main>
</div>
