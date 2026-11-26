<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  import Hint from "#lib/music/components/Hint.svelte";
  // Your data (catalog 5.14): journal export, data backup, full backup with
  // media, restore of either, and the one place that may delete user data.
  import Download from "@lucide/svelte/icons/download";
  import Upload from "@lucide/svelte/icons/upload";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";
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
  import { db, deleteBinary, getBinary, putBinary } from "#lib/music/runtime/index.ts";
  import { btn } from "#lib/music/components/ui.ts";
  import { mediaCounts, mediaKeys, restoreAssets, undoWrites, type BinaryStore } from "./media";
  import { formatList } from "@repo/i18n/format";
  import { dayKey } from "@repo/music-core/progress/rewards";

  let { announce, rowCls }: { announce: (msg: string) => void; rowCls: string } = $props();

  const LABEL: Record<BackupTable, string> = {
    sessions: m.music_hubs_data_t_sessions(),
    scoringEvents: m.music_hubs_data_t_events(),
    skillMastery: m.music_hubs_data_t_mastery(),
    skills: m.music_hubs_data_t_skills(),
    skillRelationships: m.music_hubs_data_t_links(),
    chordLibrary: m.music_hubs_data_t_chords(),
    songs: m.music_hubs_data_t_songs(),
    settings: m.music_hubs_data_t_settings(),
    backingTracks: m.music_hubs_data_t_backing(),
    audioTakes: m.music_hubs_data_t_audio(),
    midiTakes: m.music_hubs_data_t_midi(),
  };
  const store: BinaryStore = { get: getBinary, put: putBinary, del: deleteBinary };

  type Prepared = { kind: "data" | "full"; blob: Blob; name: string; counts: Record<BackupTable, number>; totalRows: number; excluded?: ReturnType<typeof mediaCounts>; files?: number; missing?: number };
  let prepared = $state<Prepared | null>(null);
  let busy = $state(false);
  let error = $state("");
  let issues = $state<BackupIssue[]>([]);
  let pending = $state<{ kind: "data" | "full"; data: DataBackup; assets: RestoredAsset[]; before: Record<BackupTable, number>; after: Record<BackupTable, number>; name: string } | null>(null);
  let confirmReset = $state(false);

  const day = () => dayKey(Date.now());
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
    announce(m.music_hubs_data_exported({ count: sessions.length }));
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
      announce(m.music_hubs_data_ready({ rows: prepared.totalRows, size: size(prepared.blob.size) }));
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
        error = m.music_hubs_data_cant_restore({ name: file.name });
        issues = read.errors;
        announce(error);
        return;
      }
      const data = "data" in read.value ? read.value.data : read.value;
      const assets = "assets" in read.value ? read.value.assets : [];
      pending = { kind: isZip ? "full" : "data", data, assets, before: await liveCounts(), after: tableCounts(data), name: file.name };
      announce(m.music_hubs_data_check_replace({ name: file.name }));
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
      return fail(new Error(m.music_hubs_data_nothing_restored({ reason: (e as Error).message })));
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
      <p class="flex items-center gap-1 font-medium">{m.music_hubs_data_export_journal()}<Hint about={m.music_hubs_data_export_about()} text={m.music_hubs_data_export_hint()} /></p>
    </div>
    <button type="button" class={btn} onclick={exportJournal}><Download class="size-4" aria-hidden="true" />{m.music_hubs_data_export_journal()}</button>
  </li>
  <li class={rowCls}>
    <div class="min-w-0 flex-1 basis-56">
      <p class="flex items-center gap-1 font-medium">{m.music_hubs_data_backup()}<Hint about={m.music_hubs_data_backup_about()} text={m.music_hubs_data_backup_hint()} /></p>
    </div>
    <div class="flex flex-wrap gap-2">
      <button type="button" class={btn} disabled={busy} onclick={() => prepare("data")}>{m.music_hubs_data_prepare_data()}</button>
      <button type="button" class={btn} disabled={busy} onclick={() => prepare("full")}>{m.music_hubs_data_prepare_full()}</button>
    </div>
  </li>
  {#if prepared}
    <li class="flex flex-col gap-3 bg-ws-raised/50 px-4 py-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="font-medium">
          {@html m.music_hubs_data_rows_size({ rows: `<span class="tnum">${prepared.totalRows}</span>`, size: `<span class="tnum">${size(prepared.blob.size)}</span>` })}
          {#if prepared.kind === "full"}{@html m.music_hubs_data_files_included({ count: prepared.files ?? 0, files: `<span class="tnum">${prepared.files}</span>` })}{/if}
        </p>
        <button type="button" class={btn} onclick={() => download(prepared!.blob, prepared!.name)}><Download class="size-4" aria-hidden="true" />{m.music_hubs_data_download({ format: prepared.kind === "full" ? "ZIP" : "JSON" })}</button>
      </div>
      {@render counts(prepared.counts)}
      {#if prepared.excluded}
        <p class="text-sm text-ws-soft">
          {m.music_hubs_data_left_out({
            list: formatList([
              m.music_hubs_data_audio_takes({ count: prepared.excluded.audioTakes }),
              m.music_hubs_data_backing_tracks({ count: prepared.excluded.backingTracks }),
              m.music_hubs_data_kit_samples({ count: prepared.excluded.samples }),
            ]),
          })}
        </p>
      {:else if prepared.missing}
        <p class="text-sm text-warn">{m.music_hubs_data_missing({ count: prepared.missing })}</p>
      {/if}
    </li>
  {/if}
  <li class={rowCls}>
    <div class="min-w-0 flex-1 basis-56">
      <p class="flex items-center gap-1 font-medium">{m.music_hubs_data_restore()}<Hint about={m.music_hubs_data_restore_about()} text={m.music_hubs_data_restore_hint()} /></p>
    </div>
    <label class="{btn} cursor-pointer focus-within:outline-2 focus-within:outline-instr-ink">
      <Upload class="size-4" aria-hidden="true" />{m.music_hubs_data_choose()}
      <input type="file" accept=".json,.zip,application/json,application/zip" class="sr-only" disabled={busy} onchange={pick} />
    </label>
  </li>
  {#if pending}
    <li class="flex flex-col gap-3 bg-ws-raised/50 px-4 py-4">
      <p class="font-medium">{pending.kind === "full" ? m.music_hubs_data_restore_name_files({ name: pending.name, count: pending.assets.length }) : m.music_hubs_data_restore_name({ name: pending.name })}</p>
      <div class="overflow-x-auto">
        <table class="w-full min-w-64 text-sm">
          <thead class="text-left text-ws-soft">
            <tr><th class="py-1 pr-3 font-normal">{m.music_hubs_data_col_table()}</th><th class="tnum py-1 pr-3 text-right font-normal">{m.music_hubs_data_col_now()}</th><th class="tnum py-1 text-right font-normal">{m.music_hubs_data_col_after()}</th></tr>
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
        <li>{m.music_hubs_data_replaced({ count: BACKUP_TABLES.length })}</li>
        {#if pending.kind === "data"}
          <li>{m.music_hubs_data_no_media()}</li>
        {:else}
          <li>{m.music_hubs_data_media_added()}</li>
        {/if}
        <li>{m.music_hubs_data_setups()}</li>
        <li>{m.music_hubs_data_close_tabs()}</li>
        <li>{m.music_hubs_data_rest_untouched()}</li>
      </ul>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="{btn} border-destructive/50 text-destructive" disabled={busy} onclick={applyRestore}>{m.music_hubs_data_replace()}</button>
        <button type="button" class={btn} onclick={() => (pending = null)}>{m.music_hubs_cancel()}</button>
      </div>
    </li>
  {/if}
  <li class={rowCls}>
    <div class="min-w-0 flex-1 basis-56">
      <p class="font-medium">{m.music_hubs_data_reset()}</p>
      <p class="text-sm text-ws-soft">{m.music_hubs_data_reset_hint()}</p>
    </div>
    {#if confirmReset}
      <div class="flex flex-wrap items-center gap-2" role="group" aria-label={m.music_hubs_data_confirm_reset()}>
        <span class="flex items-center gap-1 text-sm font-semibold text-destructive"><TriangleAlert class="size-4" aria-hidden="true" />{m.music_hubs_data_delete_q()}</span>
        <button type="button" class="{btn} border-transparent bg-destructive text-white hover:bg-destructive/90" disabled={busy} onclick={resetAll}>{m.music_hubs_data_delete_all()}</button>
        <button type="button" class={btn} onclick={() => (confirmReset = false)}>{m.music_hubs_data_keep()}</button>
      </div>
    {:else}
      <button type="button" class="{btn} text-destructive" onclick={() => (confirmReset = true)}>{m.music_hubs_data_reset()}</button>
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
      {#if issues.length > 8}<p class="mt-1 text-ws-soft">{m.music_hubs_data_and_more({ count: issues.length - 8 })}</p>{/if}
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
