<script lang="ts">
  import { m } from "@repo/i18n/messages.js";
  // The guide: how Woodshed works, in plain words, one short topic each. Each
  // topic has its own colour and a small picture of the thing it describes,
  // drawn the way the app draws it.
  import Layers from "@lucide/svelte/icons/layers";
  import Eye from "@lucide/svelte/icons/eye";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";
  import Cable from "@lucide/svelte/icons/cable";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import Command from "@lucide/svelte/icons/command";
  import CalendarDays from "@lucide/svelte/icons/calendar-days";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import Check from "@lucide/svelte/icons/check";
  import { INSTRUMENT_ICON } from "#lib/music/components/instrument-icons.ts";
  import { onMount } from "svelte";
  import { SectionSpy } from "#lib/music/section-spy.svelte.ts";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { btn, btnPrimary } from "#lib/music/components/ui.ts";

  const TOPICS = [
    { id: "session", label: m.music_shell_guide_topic_session(), hue: "piano", icon: Layers },
    { id: "check", label: m.music_shell_guide_topic_check(), hue: "reading", icon: Eye },
    { id: "not-measured", label: m.music_shell_results_not_measured(), hue: "ear", icon: CircleSlash },
    { id: "connect", label: m.music_shell_guide_topic_connect(), hue: "mpc", icon: Cable },
    { id: "keys", label: m.music_shell_guide_topic_keys(), hue: "guitar", icon: Keyboard },
    { id: "shortcuts", label: m.music_shell_guide_topic_shortcuts(), hue: "create", icon: Command },
    { id: "streaks", label: m.music_shell_guide_topic_streaks(), hue: "rhythm", icon: CalendarDays },
    { id: "privacy", label: m.music_shell_guide_topic_privacy(), hue: "aerophone", icon: ShieldCheck },
  ] as const;
  const topic = (id: string) => TOPICS.find((t) => t.id === id)!;

  const spy = new SectionSpy(TOPICS.map((t) => t.id));
  onMount(() => spy.watch());
  // Read: a topic you have scrolled past, kept in this browser so the ticks survive a visit.
  const READ_KEY = "woodshed.guide-read";
  let read = $state<string[]>([]);
  onMount(() => {
    try {
      read = JSON.parse(localStorage.getItem(READ_KEY) ?? "[]");
    } catch {
      read = [];
    }
  });
  $effect(() => {
    const i = TOPICS.findIndex((t) => t.id === spy.current);
    const past = TOPICS.slice(0, i).map((t) => t.id).filter((id) => !read.includes(id));
    if (!past.length) return;
    read = [...read, ...past];
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(read));
    } catch {
      // No storage: the ticks last this visit.
    }
  });
  // The phone's chip row keeps the topic you are reading in view.
  let chips = $state<HTMLElement>();
  $effect(() => {
    chips?.querySelector(`[data-topic="${spy.current}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
  function jump(id: string) {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.hasAttribute("data-reduce-motion");
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "instant" : "smooth", block: "start" });
    history.replaceState(history.state, "", `#${id}`);
  }
  const STEPS = [m.music_shell_guide_step_1(), m.music_shell_guide_step_2(), m.music_shell_guide_step_3(), m.music_shell_guide_step_4()];

  // Illustration data: a set, two keyboards, a result, a week.
  const SET = [
    { label: m.music_shell_guide_set_scales(), hue: "piano", min: 5 },
    { label: m.music_shell_guide_set_ear(), hue: "ear", min: 5 },
    { label: m.music_shell_guide_set_reading(), hue: "reading", min: 5 },
    { label: m.music_shell_guide_set_rhythm(), hue: "rhythm", min: 5 },
  ];
  const MINI_WHITES = 8;
  const LIT = [0, 2, 4];
  const RESULT = [
    { label: m.music_shell_guide_result_notes(), value: 0.92 },
    { label: m.music_shell_guide_result_timing(), value: 0.78 },
    { label: m.music_shell_guide_result_velocity(), value: null },
  ];
  const WEEK = [
    { d: m.music_shell_guide_day_mon(), s: "done" },
    { d: m.music_shell_guide_day_tue(), s: "done" },
    { d: m.music_shell_guide_day_wed(), s: "frozen" },
    { d: m.music_shell_guide_day_thu(), s: "done" },
    { d: m.music_shell_guide_day_fri(), s: "done" },
    { d: m.music_shell_guide_day_sat(), s: "done" },
    { d: m.music_shell_guide_day_sun(), s: "today" },
  ];
  const DEVICES = [
    { name: m.music_shell_guide_device_keyboard(), instrument: "piano", note: "MIDI" },
    { name: "MPC One+", instrument: "mpc", note: m.music_shell_guide_device_heartbeat() },
    { name: "Aerophone", instrument: "aerophone", note: m.music_shell_guide_device_breath() },
    { name: m.music_shell_guide_device_guitar(), instrument: "guitar", note: m.music_shell_guide_device_mic() },
  ] as const;
  // Physical key positions, matching the runtime's QWERTY maps.
  const WHITE = [
    ["A", "C4"],
    ["S", "D"],
    ["D", "E"],
    ["F", "F"],
    ["G", "G"],
    ["H", "A"],
    ["J", "B"],
    ["K", "C5"],
    ["L", "D"],
    ["", "E"],
  ];
  // Black keys sit after white key index n (C# after C, and so on).
  const BLACK: [string, string, number][] = [
    ["W", "C♯", 0],
    ["E", "D♯", 1],
    ["T", "F♯", 3],
    ["Y", "G♯", 4],
    ["U", "A♯", 5],
    ["O", "C♯", 7],
    ["P", "D♯", 8],
  ];
  const PAD_ROWS = [
    ["1", "2", "3", "4"],
    ["Q", "W", "E", "R"],
    ["A", "S", "D", "F"],
    ["Z", "X", "C", "V"],
  ];
  const h2 = "mb-3 font-display text-2xl font-semibold tracking-tight";
  const prose = "flex max-w-prose flex-col gap-3 text-ws-ink/90";
  const link = "font-medium text-instr-ink underline underline-offset-4";
  // Inline markup for a translated sentence (rendered with {@html}): built here, never from user input.
  const strong = (t: string) => `<strong>${t}</strong>`;
  const a = (href: string, t: string) => `<a class="${link}" href="${href}">${t}</a>`;
  // Keys inside a sentence are drawn as <kbd> by the markup (its styles are this page's own), so they go in as tokens.
  const key = (k: string) => `\u0001${k}\u0001`;
  const withKeys = (text: string) => text.split(/\u0001(.*?)\u0001/).map((s, i) => ({ s, isKey: i % 2 === 1 }));
</script>

<svelte:head><title>{m.music_shell_guide_title()}</title></svelte:head>

<div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
  <header class="lg:col-span-2">
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{m.music_shell_nav_guide()}</h1>
    <p class="mt-1 max-w-prose text-ws-soft max-sm:hidden">{m.music_shell_guide_tagline()}</p>
  </header>
  <p role="status" class="sr-only">{m.music_shell_guide_loaded()}</p>

  <!-- Below lg: the eight topics as one sticky row of chips, the one you are reading filled, read ones ticked. -->
  <nav aria-label={m.music_shell_guide_topics_short()} class="min-w-0 sticky top-[var(--ws-strip-h,3.75rem)] z-20 -mx-4 bg-ws-bg/95 py-2 backdrop-blur sm:-mx-6 lg:hidden">
    <ol bind:this={chips} class="flex gap-1.5 overflow-x-auto px-4 max-sm:[mask-image:linear-gradient(to_right,black_calc(100%-2.5rem),transparent)] sm:px-6">
      {#each TOPICS as t, i (t.id)}
        {@const done = read.includes(t.id)}
        <li class="shrink-0" data-topic={t.id}>
          <a
            href="#{t.id}"
            aria-current={spy.current === t.id ? "location" : undefined}
            style:--topic="var(--hue-{t.hue})"
            class="topic flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-ws-line px-3 text-sm text-ws-soft"
            onclick={(e) => (e.preventDefault(), jump(t.id))}
          >
            {#if done}<Check class="size-4 text-success" aria-hidden="true" />{:else}<span class="tnum text-[13px]" aria-hidden="true">{i + 1}</span>{/if}{t.label}{#if done}<span class="sr-only">, {m.music_shell_guide_read()}</span>{/if}
          </a>
        </li>
      {/each}
    </ol>
  </nav>
  <nav aria-label={m.music_shell_guide_topics()} class="hidden min-w-0 lg:sticky lg:top-[calc(var(--ws-strip-h,3.75rem)+1.5rem)] lg:z-20 lg:block lg:self-start">
    <ul class="flex flex-col gap-1">
      {#each TOPICS as t (t.id)}
        <li>
          <a
            href="#{t.id}"
            aria-current={spy.current === t.id ? "location" : undefined}
            style:--topic="var(--hue-{t.hue})"
            class="topic flex min-h-11 items-start gap-2 rounded-lg px-3 py-3 text-sm leading-5 text-ws-soft hover:bg-ws-raised hover:text-ws-ink"
          >
            <!-- Sits on the first line, so a label that wraps keeps its dot at the top. -->
            {#if read.includes(t.id)}<Check class="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />{:else}<span class="mt-[0.3125rem] size-2.5 shrink-0 rounded-full" style:background="var(--topic)" aria-hidden="true"></span>{/if}{t.label}{#if read.includes(t.id)}<span class="sr-only">, {m.music_shell_guide_read()}</span>{/if}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-12">
    <section id="session" aria-labelledby="session-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("session-h", m.music_shell_guide_topic_session(), "session")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
          <ol class="flex flex-col gap-3">
            {#each STEPS as step, i (i)}
              <li class="flex gap-3">
                <span class="tnum grid size-7 shrink-0 place-items-center rounded-full bg-instr-wash text-sm font-semibold text-instr-ink" aria-hidden="true">{i + 1}</span>
                <span class="pt-0.5">{step}</span>
              </li>
            {/each}
          </ol>
          <p class="text-sm text-ws-soft">{m.music_shell_guide_countin_note()}</p>
          <p class="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a class="{btnPrimary} no-underline" href="/music">{m.music_shell_guide_open_today()}</a>
            <a class={link} href="/music?tab=drills">{m.music_shell_guide_any_drill()}</a>
          </p>
        </div>
        {@render setPicture()}
      </div>
      {@render nextTopic("session")}
    </section>

    <section id="check" aria-labelledby="check-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("check-h", m.music_shell_guide_topic_check(), "check")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>{@html m.music_shell_guide_check_p1({ practice: strong(m.music_shell_shell_practice()), check: strong(m.music_shell_shell_check()) })}</p>
        <p>{m.music_shell_guide_check_p2()}</p>
        <p>{m.music_shell_guide_check_p3({ hear: m.music_shell_shell_hear_it() })}</p>
      </div>
        {@render checkPicture()}
      </div>
      {@render nextTopic("check")}
    </section>

    <section id="not-measured" aria-labelledby="nm-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("nm-h", m.music_shell_guide_nm_heading(), "not-measured")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>{m.music_shell_guide_nm_p1()}</p>
        <p>{@html m.music_shell_guide_nm_p2({ nm: strong(m.music_shell_results_not_measured()) })}</p>
      </div>
        {@render resultPicture()}
      </div>
      {@render nextTopic("not-measured")}
    </section>

    <section id="connect" aria-labelledby="connect-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("connect-h", m.music_shell_guide_connect_heading(), "connect")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>{@html m.music_shell_guide_connect_p1({ midi: strong("MIDI"), connect: a("/music/connect", m.music_shell_nav_connect()) })}</p>
        <p>{@html m.music_shell_guide_connect_p2({ mpc: strong(m.music_shell_guide_mpc_name()) })}</p>
        <p>{@html m.music_shell_guide_connect_p3({ mic: strong(m.music_shell_guide_mic_name()), connect: a("/music/connect#mic", m.music_shell_nav_connect()), tuner: a("/music/tuner", m.music_shell_search_tuner()) })}</p>
        <p>{@html m.music_shell_guide_connect_p4({ settings: a("/music/settings#latency", m.music_shell_nav_settings()) })}</p>
      </div>
        {@render devicesPicture()}
      </div>
      {@render nextTopic("connect")}
    </section>

    <section id="keys" aria-labelledby="keys-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("keys-h", m.music_shell_guide_keys_heading(), "keys")}
      <div class={prose}>
        <p>{m.music_shell_guide_keys_p1()}</p>
      </div>
      <div class="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <figure class="min-w-0">
          <figcaption class="mb-2 text-sm font-medium">{m.music_shell_guide_piano_caption()}</figcaption>
          <div class="stage overflow-x-auto rounded-2xl p-4">
            <div class="relative mx-auto flex w-max gap-1" aria-label={m.music_shell_guide_piano_map()} role="img">
              {#each WHITE as [k, n], i (i)}
                <div class="flex h-28 w-10 flex-col items-center justify-end gap-1 rounded-b-lg bg-ws-stage-ink pb-2 text-[13px] font-medium text-ws-stage {k ? '' : 'opacity-40'}">
                  {#if k}<kbd class="kbd-light">{k}</kbd>{/if}{n}
                </div>
              {/each}
              {#each BLACK as [k, n, after] (k)}
                <div
                  class="absolute top-0 flex h-16 w-8 flex-col items-center justify-end gap-0.5 rounded-b-md bg-ws-stage pb-1 text-[13px] text-ws-stage-ink ring-1 ring-ws-stage-ink/30"
                  style:left="calc({after + 1} * 2.75rem - 1.125rem)"
                >
                  <kbd class="kbd-dark">{k}</kbd>{n}
                </div>
              {/each}
            </div>
          </div>
          <p class="mt-2 text-sm text-ws-soft">{#each withKeys(m.music_shell_guide_octave_keys({ z: key("Z"), x: key("X") })) as part, i (i)}{#if part.isKey}<kbd class="kbd">{part.s}</kbd>{:else}{part.s}{/if}{/each}</p>
        </figure>
        <figure>
          <figcaption class="mb-2 text-sm font-medium">{m.music_shell_guide_pads_caption()}</figcaption>
          <div class="stage grid w-max grid-cols-4 gap-1.5 rounded-2xl p-4" role="img" aria-label={m.music_shell_guide_pads_map()}>
            {#each PAD_ROWS as row, r (r)}
              {#each row as k, c (k)}
                <div class="flex size-14 flex-col justify-between rounded-lg bg-ws-stage-ink/15 p-1.5 text-[13px] text-ws-stage-ink">
                  <span>{(3 - r) * 4 + c + 1}</span>
                  <kbd class="kbd-dark self-end">{k}</kbd>
                </div>
              {/each}
            {/each}
          </div>
          <p class="mt-2 max-w-60 text-sm text-ws-soft">{m.music_shell_guide_pad_one()}</p>
        </figure>
      </div>
      {@render nextTopic("keys")}
    </section>

    <section id="shortcuts" aria-labelledby="shortcuts-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("shortcuts-h", m.music_shell_guide_topic_shortcuts(), "shortcuts")}
      <dl class="mt-3 grid max-w-prose grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-3">
        <dt><kbd class="kbd">{m.music_shell_guide_key_space()}</kbd></dt>
        <dd>{m.music_shell_guide_sc_space()}</dd>
        <dt><kbd class="kbd">Esc</kbd></dt>
        <dd>{m.music_shell_guide_sc_esc()}</dd>
        <dt><span class="flex gap-1"><kbd class="kbd">⌘</kbd><kbd class="kbd">K</kbd></span></dt>
        <dd>{#each withKeys(m.music_shell_guide_sc_search({ ctrl: key("Ctrl"), k: key("K") })) as part, i (i)}{#if part.isKey}<kbd class="kbd">{part.s}</kbd>{:else}{part.s}{/if}{/each}</dd>
      </dl>
      {@render nextTopic("shortcuts")}
    </section>

    <section id="streaks" aria-labelledby="streaks-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("streaks-h", m.music_shell_guide_streaks_heading(), "streaks")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>{@html m.music_shell_guide_streaks_p1({ freeze: strong(m.music_shell_guide_freeze()) })}</p>
        <p>{@html m.music_shell_guide_streaks_p2({ xp: strong("XP") })}</p>
        <p>{m.music_shell_guide_streaks_p3()}</p>
      </div>
        {@render weekPicture()}
      </div>
      {@render nextTopic("streaks")}
    </section>

    <section id="privacy" aria-labelledby="privacy-h" class="scroll-mt-[calc(var(--ws-strip-h,3.75rem)+4.5rem)] lg:scroll-mt-[calc(var(--ws-strip-h,3.75rem)+1.5rem)]">
      {@render heading("privacy-h", m.music_shell_guide_topic_privacy(), "privacy")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>{m.music_shell_guide_privacy_p1()}</p>
        <p>{@html m.music_shell_guide_privacy_p2({ settings: a("/music/settings#data", m.music_shell_nav_settings()) })}</p>
      </div>
        {@render privacyPicture()}
      </div>
      {@render nextTopic("privacy")}
    </section>
  </div>
</div>

<!-- The end of each topic leads to the next, so the guide reads straight through without the topic list. -->
{#snippet nextTopic(id: string)}
  {@const i = TOPICS.findIndex((t) => t.id === id)}
  {@const prev = TOPICS[i - 1]}
  {@const next = TOPICS[i + 1]}
  <nav aria-label={m.music_shell_guide_topic_of({ n: i + 1, total: TOPICS.length })} class="mt-6 flex flex-col gap-3 border-t border-ws-line pt-4">
    <!-- A dot per topic, this one filled: where you are in the guide at a glance. -->
    <ol class="flex items-center gap-1.5" aria-hidden="true">
      {#each TOPICS as t, k (t.id)}
        <li class="h-2 rounded-full {k === i ? 'w-6' : 'w-2 bg-ws-line'}" style:background={k === i ? `var(--hue-${t.hue})` : undefined}></li>
      {/each}
      <li class="tnum ml-2 text-sm text-ws-soft">{m.music_shell_guide_topic_of({ n: i + 1, total: TOPICS.length })}</li>
    </ol>
    <div class="flex flex-wrap items-center justify-between gap-2">
      {#if prev}<a class="{btn} no-underline" href="#{prev.id}" onclick={(e) => (e.preventDefault(), jump(prev.id))}><ChevronLeft class="size-4" aria-hidden="true" />{m.music_shell_guide_previous()}<span class="sr-only">: {prev.label}</span></a>{:else}<span></span>{/if}
      {#if next}<a class="{btn} no-underline" href="#{next.id}" onclick={(e) => (e.preventDefault(), jump(next.id))}>{m.music_shell_guide_next_topic({ label: next.label })}<ChevronRight class="size-4" aria-hidden="true" /></a>{/if}
    </div>
  </nav>
{/snippet}

{#snippet heading(id: string, label: string, topicId: string)}
  {@const t = topic(topicId)}
  <h2 {id} class="mb-4 flex items-center gap-3 font-display text-2xl font-semibold tracking-tight">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl text-ws-stage" style:background="var(--hue-{t.hue})" aria-hidden="true"><t.icon class="size-5" /></span>
    {label}
  </h2>
{/snippet}

{#snippet setPicture()}
  <!-- One picture of the set: a tile per block, its colour as a band, its name and minutes in stage ink. -->
  <figure class="pic max-md:order-first" aria-label={m.music_shell_guide_set_label()}>
    <ol class="grid grid-cols-4 gap-1.5 md:grid-cols-2">
      {#each SET as b, i (b.label)}
        <li class="flex min-w-0 flex-col gap-1 overflow-hidden rounded-lg bg-ws-stage-ink/10 pb-2 {i === 0 ? 'ring-2' : ''}" style:--tw-ring-color="var(--hue-{b.hue})">
          <span class="h-2" style:background="var(--hue-{b.hue})" aria-hidden="true"></span>
          <span class="px-1.5 text-sm font-semibold">{b.label}</span>
          <span class="tnum px-1.5 text-sm text-ws-stage-soft">{m.music_shell_guide_minutes({ min: b.min })}</span>
          {#if i === 0}<span class="mx-1.5 self-start rounded-full bg-ws-stage-ink px-2 text-sm font-semibold text-ws-stage">{m.music_shell_lesson_next()}</span>{/if}
        </li>
      {/each}
    </ol>
    <p class="mt-2 text-sm text-ws-stage-soft">{m.music_shell_guide_ringed()}</p>
  </figure>
{/snippet}

{#snippet miniKeys(lit: boolean)}
  <div class="relative flex h-16 gap-[2px] rounded-md bg-[#2a1d17] p-1 pt-1.5">
    {#each Array.from({ length: MINI_WHITES }, (_, i) => i) as i (i)}
      <div class="relative flex flex-1 items-end justify-center rounded-b-[3px] bg-[#f6f3ec] pb-1">
        {#if lit && LIT.includes(i)}<span class="size-2 rounded-full" style:background="var(--hue-reading)"></span>{/if}
      </div>
    {/each}
    {#each [0, 1, 3, 4, 5] as b (b)}
      <div class="absolute top-1.5 h-8 w-[7%] rounded-b-[2px] bg-[#18161c]" style:left="calc({((b + 1) / MINI_WHITES) * 100}% - 3%)"></div>
    {/each}
  </div>
{/snippet}

{#snippet checkPicture()}
  <figure class="pic max-md:order-first flex flex-col gap-3" aria-label={m.music_shell_guide_check_label()}>
    <div>
      <p class="mb-1.5 flex items-center justify-between text-sm font-semibold">{m.music_shell_shell_practice()} <span class="text-[13px] font-normal text-ws-stage-soft">{m.music_shell_guide_targets_lit()}</span></p>
      {@render miniKeys(true)}
    </div>
    <div>
      <p class="mb-1.5 flex items-center justify-between text-sm font-semibold">
        {m.music_shell_shell_check()} <span class="flex items-center gap-1 text-[13px] font-normal text-success"><Check class="size-3.5" aria-hidden="true" />{m.music_shell_guide_counts_toward()}</span>
      </p>
      {@render miniKeys(false)}
    </div>
  </figure>
{/snippet}

{#snippet resultPicture()}
  <figure class="pic max-md:order-first" aria-label={m.music_shell_guide_result_label()}>
    <p class="font-display text-3xl font-bold">{m.music_shell_pct({ value: 85 })}</p>
    <p class="text-[13px] text-ws-stage-soft">{m.music_shell_guide_velocity_left_out()}</p>
    <dl class="mt-3 flex flex-col gap-2.5 text-sm">
      {#each RESULT as r (r.label)}
        <div>
          <div class="flex justify-between"><dt class="text-ws-stage-soft">{r.label}</dt><dd class="tnum font-semibold">{r.value === null ? m.music_shell_results_not_measured() : m.music_shell_pct({ value: Math.round(r.value * 100) })}</dd></div>
          <div class="mt-1 h-1.5 rounded-full {r.value === null ? 'border border-dashed border-ws-stage-soft/60' : 'bg-ws-stage-ink/10'}">
            {#if r.value !== null}<div class="h-full rounded-full" style:width="{r.value * 100}%" style:background={r.value >= 0.9 ? "var(--success)" : "var(--warn)"}></div>{/if}
          </div>
        </div>
      {/each}
    </dl>
  </figure>
{/snippet}

{#snippet devicesPicture()}
  <figure class="pic max-md:order-first" aria-label={m.music_shell_guide_devices_label()}>
    <ul class="flex flex-col gap-2">
      {#each DEVICES as d (d.name)}
        {@const Icon = INSTRUMENT_ICON[d.instrument]}
        <li class="flex items-center gap-2.5">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg text-ws-stage" style:background="var(--hue-{d.instrument})"><Icon class="size-4" aria-hidden="true" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">{d.name}</span>
            <span class="block text-[13px] text-ws-stage-soft">{d.note}</span>
          </span>
          <span class="h-0.5 w-8 rounded-full {d.instrument === 'mpc' ? 'pulse-line' : ''}" style:background="var(--hue-{d.instrument})" aria-hidden="true"></span>
          <span class="grid size-7 place-items-center rounded-md bg-ws-stage-ink/10 text-[13px] font-bold" aria-hidden="true">W</span>
        </li>
      {/each}
    </ul>
  </figure>
{/snippet}

{#snippet weekPicture()}
  <figure class="pic max-md:order-first" aria-label={m.music_shell_guide_week_label()}>
    <ol class="grid grid-cols-7 gap-1 text-center text-[13px] text-ws-stage-soft">
      {#each WEEK as w, i (i)}
        <li class="flex flex-col items-center gap-1">
          <span
            class="grid size-8 place-items-center rounded-full {w.s === 'done' ? 'text-ws-stage' : w.s === 'frozen' ? 'border-2 border-dashed border-info text-info' : 'border-2 border-ws-stage-ink/40'}"
            style:background={w.s === "done" ? "var(--hue-rhythm)" : undefined}
          >{#if w.s === "done"}<Check class="size-4" aria-hidden="true" />{:else if w.s === "frozen"}❄{/if}</span>
          {w.d}
        </li>
      {/each}
    </ol>
    <p class="mt-4 text-[13px] text-ws-stage-soft">{m.music_shell_guide_xp_level()}</p>
    <div class="mt-1 h-2 rounded-full bg-ws-stage-ink/10"><div class="h-full w-[28%] rounded-full" style:background="var(--hue-rhythm)"></div></div>
  </figure>
{/snippet}

{#snippet privacyPicture()}
  <figure class="pic max-md:order-first" aria-label={m.music_shell_guide_privacy_label()}>
    <div class="rounded-xl border-2 border-dashed p-3" style:border-color="var(--hue-aerophone)">
      <p class="mb-2 text-[13px] font-semibold" style:color="var(--hue-aerophone)">{m.music_shell_guide_this_browser()}</p>
      <ul class="grid grid-cols-2 gap-1.5 text-[13px]">
        {#each [m.music_shell_guide_item_sessions(), m.music_shell_guide_item_scores(), m.music_shell_guide_item_recordings(), m.music_shell_guide_item_samples()] as item (item)}
          <li class="rounded-md bg-ws-stage-ink/10 px-2 py-1.5">{item}</li>
        {/each}
      </ul>
    </div>
    <p class="mt-3 flex items-center gap-2 text-[13px] text-ws-stage-soft"><span class="line-through">{m.music_shell_guide_server()}</span> {m.music_shell_guide_nothing_leaves()}</p>
  </figure>
{/snippet}

<style>
  .topic[aria-current="location"] {
    color: var(--ws-ink);
    font-weight: 600;
    border-color: var(--topic);
    background: color-mix(in oklch, var(--topic) 16%, transparent);
  }
  @media (min-width: 1024px) {
    .topic[aria-current="location"] {
      box-shadow: inset 3px 0 0 var(--topic);
    }
  }
  .pic {
    border-radius: 1rem;
    padding: 1rem;
    background: var(--ws-stage);
    color: var(--ws-stage-ink);
    box-shadow: inset 0 1px 0 #ffffff10;
  }
  .pulse-line {
    animation: guide-pulse 1s ease-in-out infinite;
  }
  @keyframes guide-pulse {
    50% {
      opacity: 0.35;
    }
  }
  .kbd,
  .kbd-light,
  .kbd-dark {
    display: inline-grid;
    place-items: center;
    min-width: 1.6rem;
    height: 1.6rem;
    padding-inline: 0.35rem;
    border-radius: 0.35rem;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
  }
  .kbd {
    border: 1px solid var(--ws-line);
    border-bottom-width: 2px;
    background: var(--ws-surface);
    color: var(--ws-ink);
  }
  .kbd-light {
    border: 1px solid #0002;
    border-bottom-width: 2px;
    background: white;
    color: #2a2530;
  }
  .kbd-dark {
    border: 1px solid #fff3;
    border-bottom-width: 2px;
    background: #0006;
    color: var(--ws-stage-ink);
  }
</style>
