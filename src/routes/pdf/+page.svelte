<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import type { DocKind, NarratorDoc } from "@repo/pdf-core/domain";
  import { NarratorLibrary } from "@repo/pdf-core/stores/library";
  import { ReaderSettings } from "@repo/pdf-core/stores/settings";

  import AddDocumentModal from "./_components/AddDocumentModal.svelte";
  import LibraryView from "./_components/LibraryView.svelte";
  import ReaderView from "./_components/ReaderView.svelte";
  import "./narrator.css";

  const library = new NarratorLibrary();
  const settings = new ReaderSettings();

  let docId = $state<string | null>(null);
  /** The add modal's opening tab while it is open. */
  let adding = $state<DocKind | null>(null);

  const doc = $derived(docId ? library.find(docId) : undefined);

  function openDoc(id: string) {
    docId = id;
  }

  function createDoc(d: NarratorDoc) {
    library.add(d);
    adding = null;
    openDoc(d.id);
  }
</script>

<svelte:head>
  <title>{m.narrator_head_title()}</title>
  <meta
    name="description"
    content={m.narrator_head_description()}
  />
</svelte:head>

<div class="narrator min-h-screen">
  {#if doc}
    {#key doc.id}
      <ReaderView {doc} {settings} onclose={() => (docId = null)} />
    {/key}
  {:else}
    <LibraryView {library} onopen={openDoc} onadd={(tab = "pdf") => (adding = tab)} />
  {/if}

  {#if adding}
    <AddDocumentModal initialTab={adding} onclose={() => (adding = null)} oncreate={createDoc} />
  {/if}
</div>
