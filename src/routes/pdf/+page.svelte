<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
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
  /** A file dropped on the library, for the add sheet to read as soon as it opens. */
  let dropped = $state<File | undefined>();

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
    <LibraryView
      {library}
      onopen={openDoc}
      onadd={(file) => {
        dropped = file;
        adding = true;
      }}
    />
  {/if}

  {#if adding}
    <AddDocumentModal file={dropped} onclose={() => (adding = false)} oncreate={createDoc} />
  {/if}
</div>
