<script lang="ts">
	import { pdfStore } from '$lib/stores/pdf-reader/pdf.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-svelte';

	let pageInput = $state('');

	$effect(() => {
		pageInput = pdfStore.currentPage.toString();
	});

	function handlePageInput() {
		const page = parseInt(pageInput);
		if (!isNaN(page)) {
			pdfStore.goToPage(page);
		}
	}
</script>

<div class="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 p-4">
	<div class="max-w-4xl mx-auto flex items-center justify-between gap-4">
		<!-- Page Navigation -->
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				onclick={() => pdfStore.previousPage()}
				disabled={!pdfStore.document || pdfStore.currentPage <= 1}
			>
				<ChevronLeft class="h-4 w-4" />
			</Button>

			<div class="flex items-center gap-2">
				<Input
					type="text"
					bind:value={pageInput}
					onchange={handlePageInput}
					class="w-16 text-center"
					disabled={!pdfStore.document}
				/>
				<span class="text-sm text-slate-600 dark:text-slate-400">
					/ {pdfStore.document?.numPages ?? 0}
				</span>
			</div>

			<Button
				variant="outline"
				size="icon"
				onclick={() => pdfStore.nextPage()}
				disabled={!pdfStore.document || pdfStore.currentPage >= (pdfStore.document?.numPages ?? 0)}
			>
				<ChevronRight class="h-4 w-4" />
			</Button>
		</div>

		<!-- Zoom Controls -->
		<div class="flex items-center gap-2">
			<Button
				variant="outline"
				size="icon"
				onclick={() => pdfStore.zoomOut()}
				disabled={!pdfStore.document}
			>
				<ZoomOut class="h-4 w-4" />
			</Button>

			<span class="text-sm text-slate-600 dark:text-slate-400 min-w-[60px] text-center">
				{Math.round(pdfStore.scale * 100)}%
			</span>

			<Button
				variant="outline"
				size="icon"
				onclick={() => pdfStore.zoomIn()}
				disabled={!pdfStore.document}
			>
				<ZoomIn class="h-4 w-4" />
			</Button>

			<Button
				variant="outline"
				size="icon"
				onclick={() => pdfStore.rotate()}
				disabled={!pdfStore.document}
			>
				<RotateCw class="h-4 w-4" />
			</Button>
		</div>
	</div>
</div>
