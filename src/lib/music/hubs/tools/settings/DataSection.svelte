<script lang="ts">
  import Hint from "$lib/music/components/Hint.svelte";
  // Your data (catalog 5.14): journal export, data backup, full backup with
  // media, restore of either, and the one place that may delete user data.
  import Download from "lucide-svelte/icons/download";
  import Upload from "lucide-svelte/icons/upload";
  import TriangleAlert from "lucide-svelte/icons/triangle-alert";
  import {
    BACKUP_TABLES,
    BackupError,
    buildDataBackup,
    buildFullBackup,
    readDataBackup,
    readFullBackup,
    tableCounts,
    type BackupIssue,
    type BackupTable,
    type DataBackup,
    type RestoredAsset,
    type Row,
  } from "@repo/music-core/io/backup";
  import { db, deleteBinary, getBinary, putBinary } from "$lib/music/runtime";
  import { btn } from "$lib/music/components/ui";
  import { mediaCounts, mediaKeys, restoreAssets, undoWrites, type BinaryStore } from "./media";

  let { announce, rowCls }: { announce: (msg: string) => void; rowCls: string } = $props();

  const LABEL: Record<BackupTable, string> = {
    sessions: "Sessions",
    scoringEvents: "Scored answers",
    skillMastery: "Skill scores",
    skills: "Skills",
    skillRelationships: "Skill links",
    chordLibrary: "Chord library",
    songs: "Songs",
    settings: "Settings and saved setups",
    backingTracks: "Backing tracks",
    audioTakes: "Audio takes",
    midiTakes: "MIDI takes",
  };
  const store: BinaryStore = { get: getBinary, put: putBinary, del: deleteBinary };

  type Prepared = { kind: "data" | "full"; blob: Blob; name: string; counts: Record<BackupTable, number>; totalRows: number; excluded?: ReturnType<typeof mediaCounts>; files?: number; missing?: number };
  let prepared = $state<Prepared | null>(null);
  let busy = $state(false);
  let error = $state("");
  let issues = $state<BackupIssue[]>([]);
  let pending = $state<{ kind: "data" | "full"; data: DataBackup; assets: RestoredAsset[]; before: Record<BackupTable, number>; after: Record<BackupTable, number>; name: string } | null>(null);
  let confirmReset = $state(false);

  const day = () => new Date().toISOString().slice(0, 10);
  const size = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

  function download(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function readTables() {
    const entries = await Promise.all(BACKUP_TABLES.map(async (t) => [t, (await db.table(t).toArray()) as Row[]] as const));
    return Object.fromEntries(entries) as Record<BackupTable, Row[]>;
  }
  async function liveCounts() {
    const entries = await Promise.all(BACKUP_TABLES.map(async (t) => [t, await db.table(t).count()] as const));
    return Object.fromEntries(entries) as Record<BackupTable, number>;
  }

  function fail(e: unknown) {
    error = (e as Error).message;
    issues = e instanceof BackupError ? e.issues : [];
    announce(error);
  }

  async function exportJournal() {
    const sessions = await db.sessions.orderBy("startTime").toArray();
    download(new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 2)], { type: "application/json" }), `woodshed-journal-${day()}.json`);
    announce(`Exported ${sessions.length} session${sessions.length === 1 ? "" : "s"}.`);
  }

  async function prepare(kind: "data" | "full") {
    busy = true;
    error = "";
    issues = [];
    prepared = null;
    try {
      const tables = await readTables();
      const excluded = mediaCounts(tables);
      const built = buildDataBackup(tables, excluded);
      if (kind === "data") {
        prepared = { kind, blob: new Blob([built.json], { type: "application/json" }), name: `woodshed-backup-${day()}.json`, counts: built.counts, totalRows: built.totalRows, excluded };
      } else {
        const assets: { key: string; blob: Blob }[] = [];
        let missing = 0;
        for (const key of mediaKeys(tables)) {
          const blob = await getBinary(key);
          if (blob) assets.push({ key, blob });
          else missing++;
        }
        const zip = await buildFullBackup(built.backup, assets);
        prepared = { kind, blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: "application/zip" }), name: `woodshed-full-backup-${day()}.zip`, counts: built.counts, totalRows: built.totalRows, files: assets.length, missing };
      }
      announce(`Backup ready: ${prepared.totalRows} rows, ${size(prepared.blob.size)}.`);
    } catch (e) {
      fail(e);
    } finally {
      busy = false;
    }
  }

  async function pick(e: Event) {
    const file = (e.currentTarget as HTMLInputElement).files?.[0];
    (e.currentTarget as HTMLInputElement).value = "";
    if (!file) return;
    busy = true;
    error = "";
    issues = [];
    pending = null;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      const read = isZip ? await readFullBackup(bytes) : readDataBackup(bytes);
      if (!read.ok) {
        error = `"${file.name}" can't be restored. Choose a Woodshed backup file.`;
        issues = read.errors;
        announce(error);
        return;
      }
      const data = "data" in read.value ? read.value.data : read.value;
      const assets = "assets" in read.value ? read.value.assets : [];
      pending = { kind: isZip ? "full" : "data", data, assets, before: await liveCounts(), after: tableCounts(data), name: file.name };
      announce(`Check what "${file.name}" will replace, then confirm.`);
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  async function applyRestore() {
    if (!pending) return;
    busy = true;
    const { data, assets } = pending;
    let written: string[] = [];
    try {
      if (assets.length) written = (await restoreAssets(assets, store)).written;
      await db.transaction("rw", BACKUP_TABLES.map((t) => db.table(t)), async () => {
        for (const t of BACKUP_TABLES) {
          await db.table(t).clear();
          await db.table(t).bulkPut(data.tables[t]);
        }
      });
    } catch (e) {
      await undoWrites(written, store);
      busy = false;
      pending = null;
      return fail(new Error(`Nothing was restored: ${(e as Error).message}`));
    }
    const total = Object.values(pending.after).reduce((a, b) => a + b, 0);
    // A full load re-reads settings, practice history and device profiles.
    location.assign(`/music/settings?restored=${total}&files=${written.length}`);
  }

  async function resetAll() {
    busy = true;
    try {
      const keys = mediaKeys(await readTables());
      await db.transaction("rw", BACKUP_TABLES.map((t) => db.table(t)), async () => {
        for (const t of BACKUP_TABLES) await db.table(t).clear();
      });
      for (const k of keys) await deleteBinary(k).catch(() => {});
      location.assign("/music/settings?reset=1");
    } catch (e) {
      busy = false;
      fail(e);
    }
  }
</script>

<ul class="divide-y divide-ws-line overflow-hidden rounded-2xl border border-ws-line bg-ws-surface">
  <li class={rowCls}>
    <div class="min-w-0 flex-1 basis-56">
      <p class="flex items-center gap-1 font-medium">Export journal<Hint about="export journal" text="Every practice session as a JSON file." /></p>
    </div>
    <button type="button" class={btn} onclick={exportJournal}><Download class="size-4" aria-hidden="true" />Export journal</button>
  </li>
  <li class={rowCls}>
    <div class="min-w-0 flex-1 basis-56">
      <p class="flex items-center gap-1 font-medium">Back up your data<Hint about="back up your data" text="Data only is a small JSON of every table. Full adds your recordings and kit samples in a ZIP." /></p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class={btn} disabled={busy} onclick={() => prepare("data")}>Prepare data backup</button>
      <button type="button" class={btn} disabled={busy} onclick={() => prepare("full")}>Prepare full backup</button>
    </div>
  </li>
  {#if prepared}
    <li class="flex flex-col gap-3 bg-ws-raised/50 px-4 py-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="font-medium">
          <span class="tnum">{prepared.totalRows}</span> rows, <span class="tnum">{size(prepared.blob.size)}</span>
          {#if prepared.kind === "full"}, <span class="tnum">{prepared.files}</span> media file{prepared.files === 1 ? "" : "s"} included{/if}
        </p>
        <button type="button" class={btn} onclick={() => download(prepared!.blob, prepared!.name)}><Download class="size-4" aria-hidden="true" />Download {prepared.kind === "full" ? "ZIP" : "JSON"}</button>
      </div>
      {@render counts(prepared.counts)}
      {#if prepared.excluded}
        <p class="text-sm text-ws-soft">
          Media left out: {prepared.excluded.audioTakes} audio take{prepared.excluded.audioTakes === 1 ? "" : "s"}, {prepared.excluded.backingTracks} backing track{prepared.excluded.backingTracks === 1 ? "" : "s"} and {prepared.excluded.samples} kit sample{prepared.excluded.samples === 1 ? "" : "s"}. Use the full backup to keep them.
        </p>
      {:else if prepared.missing}
        <p class="text-sm text-warn">{prepared.missing} referenced file{prepared.missing === 1 ? " was" : "s were"} already missing from this browser, so the backup leaves {prepared.missing === 1 ? "it" : "them"} out.</p>
      {/if}
    </li>
  {/if}
  <li class={rowCls}>
    <div class="min-w-0 flex-1 basis-56">
      <p class="flex items-center gap-1 font-medium">Restore from a backup<Hint about="restore from a backup" text="A data backup (.json) or a full backup (.zip). You see what changes before anything is replaced." /></p>
    </div>
    <label class="{btn} cursor-pointer focus-within:outline-2 focus-within:outline-instr-ink">
      <Upload class="size-4" aria-hidden="true" />Choose backup file
      <input type="file" accept=".json,.zip,application/json,application/zip" class="sr-only" disabled={busy} onchange={pick} />
    </label>
  </li>
  {#if pending}
    <li class="flex flex-col gap-3 bg-ws-raised/50 px-4 py-4">
      <p class="font-medium">Restore "{pending.name}"{pending.kind === "full" ? `, with ${pending.assets.length} media file${pending.assets.length === 1 ? "" : "s"}` : ""}</p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-64 text-sm">
          <thead class="text-left text-ws-soft">
            <tr><th class="py-1 pr-3 font-normal">Table</th><th class="tnum py-1 pr-3 text-right font-normal">Now</th><th class="tnum py-1 text-right font-normal">After</th></tr>
          </thead>
          <tbody>
            {#each BACKUP_TABLES as t (t)}
              <tr class="border-t border-ws-line" data-testid="restore-{t}">
                <td class="py-1 pr-3">{LABEL[t]}</td>
                <td class="tnum py-1 pr-3 text-right">{pending.before[t]}</td>
                <td class="tnum py-1 text-right font-semibold">{pending.after[t]}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <ul class="flex list-disc flex-col gap-1 pl-5 text-sm">
        <li>All {BACKUP_TABLES.length} tables are replaced, not merged. Anything here now that isn't in the backup is deleted.</li>
        {#if pending.kind === "data"}
          <li>A data backup has no media files. Audio takes, backing tracks and kit samples it lists only play if their files already exist in this browser, unchanged.</li>
        {:else}
          <li>Missing media files are added. A file that already exists here with different contents stops the restore, so nothing is overwritten.</li>
        {/if}
        <li>Saved drill setups and device settings come from the backup too.</li>
        <li>Close Woodshed in other tabs first, or they may write old data back.</li>
        <li>The rest of this site, including the PDF reader, is untouched.</li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="{btn} border-destructive/50 text-destructive" disabled={busy} onclick={applyRestore}>Replace my data</button>
        <button type="button" class={btn} onclick={() => (pending = null)}>Cancel</button>
      </div>
    </li>
  {/if}
  <li class={rowCls}>
    <div class="min-w-0 flex-1 basis-56">
      <p class="font-medium">Reset local data</p>
      <p class="text-sm text-ws-soft">Deletes every session, take, sample and setting Woodshed keeps in this browser. Nothing else in Woodshed deletes your data.</p>
    </div>
    {#if confirmReset}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label="Confirm reset">
        <span class="flex items-center gap-1 text-sm font-semibold text-destructive"><TriangleAlert class="size-4" aria-hidden="true" />Delete everything?</span>
        <button type="button" class="{btn} border-transparent bg-destructive text-white hover:bg-destructive/90" disabled={busy} onclick={resetAll}>Delete everything</button>
        <button type="button" class={btn} onclick={() => (confirmReset = false)}>Keep my data</button>
      </div>
    {:else}
      <button type="button" class="{btn} text-destructive" onclick={() => (confirmReset = true)}>Reset local data</button>
    {/if}
  </li>
</ul>

{#if error}
  <div role="alert" class="mt-3 rounded-xl border border-destructive/40 px-4 py-3 text-sm">
    <p class="font-semibold text-destructive">{error}</p>
    {#if issues.length}
      <ul class="mt-1 list-disc pl-5">
        {#each issues.slice(0, 8) as i (i.path + i.message)}<li>{i.path} {i.message}</li>{/each}
      </ul>
      {#if issues.length > 8}<p class="mt-1 text-ws-soft">and {issues.length - 8} more.</p>{/if}
    {/if}
  </div>
{/if}

{#snippet counts(c: Record<BackupTable, number>)}
  <dl class="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-1 text-sm">
    {#each BACKUP_TABLES as t (t)}
      <div class="flex justify-between gap-2 border-b border-ws-line/60 py-0.5">
        <dt class="text-ws-soft">{LABEL[t]}</dt>
        <dd class="tnum font-medium">{c[t]}</dd>
      </div>
    {/each}
  </dl>
{/snippet}
