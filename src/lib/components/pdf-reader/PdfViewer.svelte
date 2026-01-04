<script lang="ts">
	import { onMount } from 'svelte';
	import { pdfStore } from '$lib/stores/pdf-reader/pdf.svelte';
	import { renderPage } from '$lib/services/pdf/renderer';

	let canvas: HTMLCanvasElement | undefined = $state();
	let container: HTMLDivElement;
	let isRendering = $state(false);
	let lastRenderedKey = $state('');

	async function renderCurrentPage() {
		if (!pdfStore.document || !canvas || isRendering) return;

		// Create a unique key for this render state
		const renderKey = `${pdfStore.currentPage}-${pdfStore.scale}-${pdfStore.rotation}`;

		// Skip if we've already rendered this exact state
		if (renderKey === lastRenderedKey) return;

		isRendering = true;
		try {
			const page = await pdfStore.document.document.getPage(pdfStore.currentPage);
			await renderPage(page, canvas, {
				scale: pdfStore.scale,
				rotation: pdfStore.rotation
			});
			lastRenderedKey = renderKey;
		} catch (err) {
			console.error('Failed to render page:', err);
		} finally {
			isRendering = false;
		}
	}

	// Watch for changes to trigger re-render
	$effect(() => {
		// Track all dependencies that should trigger a re-render
		if (pdfStore.document && canvas && pdfStore.currentPage && pdfStore.scale !== undefined && pdfStore.rotation !== undefined) {
			renderCurrentPage();
		}
	});
</script>

<div bind:this={container} class="flex items-center justify-center bg-slate-100 dark:bg-slate-900 p-4 min-h-[600px] overflow-auto">
	{#if pdfStore.isLoading}
		<div class="text-center">
			<p class="text-lg">Loading PDF...</p>
		</div>
	{:else if pdfStore.error}
		<div class="text-center text-red-600">
			<p>Error: {pdfStore.error}</p>
		</div>
	{:else if !pdfStore.document}
		<div class="text-center text-slate-500">
			<p>No PDF loaded</p>
		</div>
	{/if}

	<!-- Canvas is always mounted to prevent recreation issues -->
	<canvas
		bind:this={canvas}
		class="shadow-lg max-w-full"
		class:hidden={!pdfStore.document || pdfStore.isLoading || !!pdfStore.error}
	></canvas>
</div>
