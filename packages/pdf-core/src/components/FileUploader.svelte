<script lang="ts">
	import { pdfStore } from '../stores/pdf.svelte';
	import { Button } from '@repo/ui/button';

	let fileInput: HTMLInputElement;

	async function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		const file = target.files?.[0];

		if (file && file.type === 'application/pdf') {
			await pdfStore.loadFromFile(file);
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];

		if (file && file.type === 'application/pdf') {
			pdfStore.loadFromFile(file);
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
	}
</script>

<div
	role="button"
	tabindex="0"
	class="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-8 text-center"
	ondrop={handleDrop}
	ondragover={handleDragOver}
	onkeypress={(e) => e.key === 'Enter' && fileInput.click()}
>
	<h3 class="text-lg font-semibold mb-4">Upload PDF</h3>
	<p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
		Drag and drop a PDF file here, or click to browse
	</p>

	<input
		bind:this={fileInput}
		type="file"
		accept="application/pdf"
		onchange={handleFileSelect}
		class="hidden"
	/>

	<Button onclick={() => fileInput.click()}>
		Choose PDF File
	</Button>
</div>
