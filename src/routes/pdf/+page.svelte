<script lang="ts">
  import type { NarratorDoc } from "@repo/pdf-core/domain";
  import { NarratorLibrary } from "@repo/pdf-core/stores/library";
  import { ReaderSettings } from "@repo/pdf-core/stores/settings";

  import AddDocumentModal from "./_components/AddDocumentModal.svelte";
  import LibraryView from "./_components/LibraryView.svelte";
  import ReaderView from "./_components/ReaderView.svelte";
  import "./narrator.css";

  const library = new NarratorLibrary();
  const settings = new ReaderSettings();

  let docId = $state<string | null>(null);
  let adding = $state(false);

  const doc = $derived(docId ? library.find(docId) : undefined);

  function openDoc(id: string) {
    docId = id;
  }

  function createDoc(d: NarratorDoc) {
    library.add(d);
    adding = false;
    openDoc(d.id);
  }
</script>

<svelte:head>
  <title>narrator — reads aloud</title>
  <meta
    name="description"
    content="Upload a PDF, EPUB, or text file — or paste anything — and have it read aloud with synced highlighting."
  />
</svelte:head>

<div class="narrator min-h-screen">
  {#if doc}
    {#key doc.id}
      <ReaderView {doc} {settings} onclose={() => (docId = null)} />
    {/key}
  {:else}
    <LibraryView {library} onopen={openDoc} onadd={() => (adding = true)} />
  {/if}

  {#if adding}
    <AddDocumentModal onclose={() => (adding = false)} oncreate={createDoc} />
  {/if}
</div>
