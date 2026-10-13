<script lang="ts">
  // The guide: how Woodshed works, in plain words, one short topic each. Each
  // topic has its own colour and a small picture of the thing it describes,
  // drawn the way the app draws it.
  import Layers from "lucide-svelte/icons/layers";
  import Eye from "lucide-svelte/icons/eye";
  import CircleSlash from "lucide-svelte/icons/circle-slash";
  import Cable from "lucide-svelte/icons/cable";
  import Keyboard from "lucide-svelte/icons/keyboard";
  import Command from "lucide-svelte/icons/command";
  import CalendarDays from "lucide-svelte/icons/calendar-days";
  import ShieldCheck from "lucide-svelte/icons/shield-check";
  import Check from "lucide-svelte/icons/check";
  import { INSTRUMENT_ICON } from "$lib/music/components/instrument-icons";
  import { onMount } from "svelte";
  import { SectionSpy } from "$lib/music/section-spy.svelte";

  const TOPICS = [
    { id: "session", label: "How a session works", hue: "piano", icon: Layers },
    { id: "check", label: "Practice and Check", hue: "reading", icon: Eye },
    { id: "not-measured", label: "Not measured", hue: "ear", icon: CircleSlash },
    { id: "connect", label: "MIDI, the MPC and the mic", hue: "mpc", icon: Cable },
    { id: "keys", label: "Playing from the keyboard", hue: "guitar", icon: Keyboard },
    { id: "shortcuts", label: "Shortcuts", hue: "create", icon: Command },
    { id: "streaks", label: "Streaks and XP", hue: "rhythm", icon: CalendarDays },
    { id: "privacy", label: "Privacy", hue: "aerophone", icon: ShieldCheck },
  ] as const;
  const topic = (id: string) => TOPICS.find((t) => t.id === id)!;

  const spy = new SectionSpy(TOPICS.map((t) => t.id));
  onMount(() => spy.watch());

  // Illustration data: a set, two keyboards, a result, a week.
  const SET = [
    { label: "Scales", hue: "piano", min: 5 },
    { label: "Ear", hue: "ear", min: 5 },
    { label: "Reading", hue: "reading", min: 5 },
    { label: "Rhythm", hue: "rhythm", min: 5 },
  ];
  const MINI_WHITES = 8;
  const LIT = [0, 2, 4];
  const RESULT = [
    { label: "Notes right", value: 0.92 },
    { label: "Timing", value: 0.78 },
    { label: "Velocity", value: null },
  ];
  const WEEK = [
    { d: "M", s: "done" },
    { d: "T", s: "done" },
    { d: "W", s: "frozen" },
    { d: "T", s: "done" },
    { d: "F", s: "done" },
    { d: "S", s: "done" },
    { d: "S", s: "today" },
  ];
  const DEVICES = [
    { name: "Keyboard", instrument: "piano", note: "MIDI" },
    { name: "MPC One+", instrument: "mpc", note: "MIDI + heartbeat" },
    { name: "Aerophone", instrument: "aerophone", note: "MIDI + breath" },
    { name: "Guitar", instrument: "guitar", note: "microphone" },
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
</script>

<svelte:head><title>Guide | Woodshed</title></svelte:head>

<div class="mx-auto grid max-w-5xl gap-8 lg:grid-cols-[13rem_minmax(0,1fr)]">
  <header class="lg:col-span-2">
    <h1 class="font-display text-4xl font-semibold tracking-tight sm:text-5xl">Guide</h1>
    <p class="mt-1 max-w-prose text-ws-soft">What Woodshed does with your playing, and how to get the most from ten minutes at the instrument.</p>
  </header>
  <p role="status" class="sr-only">Guide loaded.</p>

  <nav aria-label="Guide topics" class="sticky top-27 z-20 min-w-0 -mx-4 bg-ws-bg/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:top-32 lg:mx-0 lg:self-start lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
    <ul class="flex gap-2 overflow-x-auto py-2 [scrollbar-width:none] lg:flex-col lg:gap-1 lg:overflow-visible lg:py-0">
      {#each TOPICS as t (t.id)}
        <li class="shrink-0">
          <a
            href="#{t.id}"
            aria-current={spy.current === t.id ? "location" : undefined}
            style:--topic="var(--hue-{t.hue})"
            class="topic flex min-h-11 items-center gap-2 whitespace-nowrap rounded-full border border-ws-line px-4 text-sm leading-5 text-ws-soft hover:bg-ws-raised hover:text-ws-ink lg:items-start lg:whitespace-normal lg:rounded-lg lg:border-0 lg:px-3 lg:py-3"
          >
            <!-- Sits on the first line, so a label that wraps keeps its dot at the top. -->
            <span class="mt-[0.3125rem] size-2.5 shrink-0 rounded-full" style:background="var(--topic)" aria-hidden="true"></span>{t.label}
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-12">
    <section id="session" aria-labelledby="session-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("session-h", "How a session works", "session")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>Open <a class={link} href="/music">Today</a> and pick how many minutes you have. Woodshed builds a short set from what is due: something you are learning, something slipping, and something to review. Press Start and go block by block, or open any drill from the Drills tab instead.</p>
        <p>Every drill runs the same way. The setup is remembered and folded into one line, so most days you just press Start. Timed drills start with a count-in (set in the practice strip), and nothing you play during it is graded. When the run ends you get one sentence on how it went, the number that matters, the change since your last run with the same setup, and what to try next.</p>
        <p>Your session is saved as you go. There is nothing to submit.</p>
      </div>
        {@render setPicture()}
      </div>
    </section>

    <section id="check" aria-labelledby="check-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("check-h", "Practice and Check", "check")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>Every graded drill has two modes. <strong>Practice</strong> shows you the targets on the keys, frets or pads, and lets you hear it first. <strong>Check</strong> hides them.</p>
        <p>Only Check moves your skill mastery. Playing a scale while it is lit up proves you can follow lights; playing it from memory proves you know it. Practice runs are still saved and still earn XP, they just do not claim more than they show.</p>
        <p>"Hear it first" is a demo. It is never scored.</p>
      </div>
        {@render checkPicture()}
      </div>
    </section>

    <section id="not-measured" aria-labelledby="nm-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("nm-h", 'What "Not measured" means', "not-measured")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>Some inputs cannot see some things. An on-screen pad has no velocity, the microphone cannot tell which string you used, a computer keyboard plays one note at a time so it cannot judge two hands together.</p>
        <p>When that happens the result says <strong>Not measured</strong> for that part and leaves it out of the score, rather than giving you a zero or a flattering 100%. Connect the real instrument and those rows start counting.</p>
      </div>
        {@render resultPicture()}
      </div>
    </section>

    <section id="connect" aria-labelledby="connect-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("connect-h", "MIDI, the MPC and the microphone", "connect")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p><strong>MIDI</strong> works in Chromium browsers. Plug in the keyboard, MPC or Aerophone and enable MIDI once on <a class={link} href="/music/connect">Connect</a>; after that Woodshed reopens it on every visit. Name each device and tell it which instrument it is.</p>
        <p><strong>The MPC One+</strong> only sends pad notes while a computer keeps talking to it. Turn on the controller link on Connect and Woodshed keeps that conversation going on every page, not just that one. If your pads send the Akai Classic notes, pick that pad map there, or use Learn pads and hit each pad once.</p>
        <p><strong>The microphone</strong> is for guitar, ukulele and voice. It only starts when you press something that needs it, and it stops when the drill ends. Pick the input and echo cancellation in <a class={link} href="/music/settings#input">Settings</a>; the <a class={link} href="/music/tuner">Tuner</a> is the quickest way to check it hears you.</p>
        <p>If notes feel late, run a latency calibration in <a class={link} href="/music/settings#latency">Settings</a>.</p>
      </div>
        {@render devicesPicture()}
      </div>
    </section>

    <section id="keys" aria-labelledby="keys-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("keys-h", "Playing from the computer keyboard", "keys")}
      <div class={prose}>
        <p>No instrument nearby? The keys below play whichever surface is on screen. They follow key positions, so they work the same on other layouts.</p>
      </div>
      <div class="mt-5 grid gap-6 md:grid-cols-[minmax(0,1fr)_auto]">
        <figure class="min-w-0">
          <figcaption class="mb-2 text-sm font-medium">Piano, from middle C</figcaption>
          <div class="stage overflow-x-auto rounded-2xl p-4">
            <div class="relative mx-auto flex w-max gap-1" aria-label="Piano key map: A S D F G H J K L play the white keys from C4 to D5; W E, T Y U, O P play the black keys." role="img">
              {#each WHITE as [k, n], i (i)}
                <div class="flex h-28 w-10 flex-col items-center justify-end gap-1 rounded-b-lg bg-[#f4efe6] pb-2 text-xs font-medium text-[#3a3440] {k ? '' : 'opacity-40'}">
                  {#if k}<kbd class="kbd-light">{k}</kbd>{/if}{n}
                </div>
              {/each}
              {#each BLACK as [k, n, after] (k)}
                <div
                  class="absolute top-0 flex h-16 w-8 flex-col items-center justify-end gap-0.5 rounded-b-md bg-[#15131a] pb-1 text-[0.7rem] text-ws-stage-soft ring-1 ring-black"
                  style:left="calc({after + 1} * 2.75rem - 1.125rem)"
                >
                  <kbd class="kbd-dark">{k}</kbd>{n}
                </div>
              {/each}
            </div>
          </div>
          <p class="mt-2 text-sm text-ws-soft"><kbd class="kbd">Z</kbd> and <kbd class="kbd">X</kbd> shift down or up an octave, three either way.</p>
        </figure>
        <figure>
          <figcaption class="mb-2 text-sm font-medium">MPC pads, laid out like the pad grid</figcaption>
          <div class="stage grid w-max grid-cols-4 gap-1.5 rounded-2xl p-4" role="img" aria-label="Pad key map: Z X C V play pads 1 to 4 on the bottom row, then A S D F, Q W E R, and 1 2 3 4 on the top row for pads 13 to 16.">
            {#each PAD_ROWS as row, r (r)}
              {#each row as k, c (k)}
                <div class="flex size-14 flex-col justify-between rounded-lg bg-[#35323b] p-1.5 text-[0.7rem] text-ws-stage-soft shadow-[inset_0_-3px_0_#0006]">
                  <span>{(3 - r) * 4 + c + 1}</span>
                  <kbd class="kbd-dark self-end">{k}</kbd>
                </div>
              {/each}
            {/each}
          </div>
          <p class="mt-2 max-w-60 text-sm text-ws-soft">Pad 1 is bottom left, the same as A01 on the MPC.</p>
        </figure>
      </div>
    </section>

    <section id="shortcuts" aria-labelledby="shortcuts-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("shortcuts-h", "Shortcuts", "shortcuts")}
      <dl class="mt-3 grid max-w-prose grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-3">
        <dt><kbd class="kbd">Space</kbd></dt>
        <dd>Start a drill, or run it again from the results, while focus is not on a button or field.</dd>
        <dt><kbd class="kbd">Esc</kbd></dt>
        <dd>Stop a run or count-in.</dd>
        <dt><span class="flex gap-1"><kbd class="kbd">⌘</kbd><kbd class="kbd">K</kbd></span></dt>
        <dd>Search every drill, path, song and page. <kbd class="kbd">Ctrl</kbd> <kbd class="kbd">K</kbd> on Windows and Linux. Arrow keys move, Enter goes.</dd>
      </dl>
    </section>

    <section id="streaks" aria-labelledby="streaks-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("streaks-h", "Streaks, freezes and XP", "streaks")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>Your streak counts the days you practise in a row. It is forgiving: every week you practise earns a <strong>freeze</strong>, and you can hold two. Miss a day and come back, and a freeze covers the gap for you. Frozen days show dashed on the week calendar.</p>
        <p><strong>XP</strong> rewards showing up and doing the work: a wrong answer still earns a little, a hard clean run earns a lot more, and beating your last run adds a bonus. Every 250 XP is a level.</p>
        <p>XP is not skill. Mastery is separate and only moves on Check runs, and it fades if you leave a skill alone, so Progress can tell you what is actually due.</p>
      </div>
        {@render weekPicture()}
      </div>
    </section>

    <section id="privacy" aria-labelledby="privacy-h" class="scroll-mt-42 lg:scroll-mt-32">
      {@render heading("privacy-h", "Privacy", "privacy")}
      <div class="grid items-start gap-6 md:grid-cols-[minmax(0,1fr)_17rem]">
        <div class={prose}>
        <p>Everything stays in this browser: sessions, scores, recordings and samples. There is no account and nothing is sent to a server. The microphone audio is analysed on this device and only saved when you record a take.</p>
        <p>Clearing this site's data in the browser deletes it, so make a backup in <a class={link} href="/music/settings#data">Settings</a> now and then. Backups are files you keep.</p>
      </div>
        {@render privacyPicture()}
      </div>
    </section>
  </div>
</div>

{#snippet heading(id: string, label: string, topicId: string)}
  {@const t = topic(topicId)}
  <h2 {id} class="mb-4 flex items-center gap-3 font-display text-2xl font-semibold tracking-tight">
    <span class="grid size-10 shrink-0 place-items-center rounded-xl text-[oklch(0.2_0.04_288)]" style:background="var(--hue-{t.hue})" aria-hidden="true"><t.icon class="size-5" /></span>
    {label}
  </h2>
{/snippet}

{#snippet setPicture()}
  <figure class="pic" aria-label="Today's set: four five-minute blocks, scales, ear, reading and rhythm, with the first one ready to start">
    <div class="flex h-14 gap-1.5">
      {#each SET as b, i (b.label)}
        <div class="flex min-w-0 flex-1 items-end rounded-lg p-1.5 text-xs font-semibold text-[oklch(0.2_0.04_288)]" style:background="var(--hue-{b.hue})" style:opacity={i === 0 ? 1 : 0.75}>{b.label}</div>
      {/each}
    </div>
    <ol class="mt-3 flex flex-col gap-1.5 text-sm">
      {#each SET as b, i (b.label)}
        <li class="flex items-center gap-2 rounded-lg px-2 py-1.5 {i === 0 ? 'ring-2' : ''}" style:--tw-ring-color="var(--hue-{b.hue})">
          <span class="tnum grid size-6 place-items-center rounded-full bg-ws-stage-ink/10 text-xs">{i + 1}</span>
          <span class="flex-1">{b.label}</span>
          <span class="tnum text-xs text-ws-stage-soft">{b.min} min</span>
        </li>
      {/each}
    </ol>
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
  <figure class="pic flex flex-col gap-3" aria-label="Practice shows the target keys lit; Check hides them, and only Check counts toward mastery">
    <div>
      <p class="mb-1.5 flex items-center justify-between text-sm font-semibold">Practice <span class="text-xs font-normal text-ws-stage-soft">targets lit</span></p>
      {@render miniKeys(true)}
    </div>
    <div>
      <p class="mb-1.5 flex items-center justify-between text-sm font-semibold">
        Check <span class="flex items-center gap-1 text-xs font-normal text-success"><Check class="size-3.5" aria-hidden="true" />counts toward mastery</span>
      </p>
      {@render miniKeys(false)}
    </div>
  </figure>
{/snippet}

{#snippet resultPicture()}
  <figure class="pic" aria-label="A result card: notes right 92 percent, timing 78 percent, velocity not measured on an on-screen pad">
    <p class="font-display text-3xl font-bold">85%</p>
    <p class="text-xs text-ws-stage-soft">score, velocity left out</p>
    <dl class="mt-3 flex flex-col gap-2.5 text-sm">
      {#each RESULT as r (r.label)}
        <div>
          <div class="flex justify-between"><dt class="text-ws-stage-soft">{r.label}</dt><dd class="tnum font-semibold">{r.value === null ? "Not measured" : `${Math.round(r.value * 100)}%`}</dd></div>
          <div class="mt-1 h-1.5 rounded-full {r.value === null ? 'border border-dashed border-ws-stage-soft/60' : 'bg-ws-stage-ink/10'}">
            {#if r.value !== null}<div class="h-full rounded-full" style:width="{r.value * 100}%" style:background={r.value >= 0.9 ? "var(--success)" : "var(--warn)"}></div>{/if}
          </div>
        </div>
      {/each}
    </dl>
  </figure>
{/snippet}

{#snippet devicesPicture()}
  <figure class="pic" aria-label="Keyboard, MPC and Aerophone connect over MIDI, the MPC with a heartbeat; the guitar comes in through the microphone">
    <ul class="flex flex-col gap-2">
      {#each DEVICES as d (d.name)}
        {@const Icon = INSTRUMENT_ICON[d.instrument]}
        <li class="flex items-center gap-2.5">
          <span class="grid size-9 shrink-0 place-items-center rounded-lg text-[oklch(0.2_0.04_288)]" style:background="var(--hue-{d.instrument})"><Icon class="size-4" aria-hidden="true" /></span>
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">{d.name}</span>
            <span class="block text-xs text-ws-stage-soft">{d.note}</span>
          </span>
          <span class="h-0.5 w-8 rounded-full {d.instrument === 'mpc' ? 'pulse-line' : ''}" style:background="var(--hue-{d.instrument})" aria-hidden="true"></span>
          <span class="grid size-7 place-items-center rounded-md bg-ws-stage-ink/10 text-xs font-bold" aria-hidden="true">W</span>
        </li>
      {/each}
    </ul>
  </figure>
{/snippet}

{#snippet weekPicture()}
  <figure class="pic" aria-label="A week: five days practised, one covered by a freeze shown dashed, and today still open">
    <ol class="grid grid-cols-7 gap-1 text-center text-xs text-ws-stage-soft">
      {#each WEEK as w, i (i)}
        <li class="flex flex-col items-center gap-1">
          <span
            class="grid size-8 place-items-center rounded-full {w.s === 'done' ? 'text-[oklch(0.2_0.04_288)]' : w.s === 'frozen' ? 'border-2 border-dashed border-info text-info' : 'border-2 border-ws-stage-ink/40'}"
            style:background={w.s === "done" ? "var(--hue-rhythm)" : undefined}
          >{#if w.s === "done"}<Check class="size-4" aria-hidden="true" />{:else if w.s === "frozen"}❄{/if}</span>
          {w.d}
        </li>
      {/each}
    </ol>
    <p class="mt-4 text-xs text-ws-stage-soft">Level 4, 180 XP to the next</p>
    <div class="mt-1 h-2 rounded-full bg-ws-stage-ink/10"><div class="h-full w-[28%] rounded-full" style:background="var(--hue-rhythm)"></div></div>
  </figure>
{/snippet}

{#snippet privacyPicture()}
  <figure class="pic" aria-label="Sessions, scores, recordings and samples stay inside this browser; nothing goes to a server">
    <div class="rounded-xl border-2 border-dashed p-3" style:border-color="var(--hue-aerophone)">
      <p class="mb-2 text-xs font-semibold" style:color="var(--hue-aerophone)">This browser</p>
      <ul class="grid grid-cols-2 gap-1.5 text-xs">
        {#each ["Sessions", "Scores", "Recordings", "Samples"] as item (item)}
          <li class="rounded-md bg-ws-stage-ink/10 px-2 py-1.5">{item}</li>
        {/each}
      </ul>
    </div>
    <p class="mt-3 flex items-center gap-2 text-xs text-ws-stage-soft"><span class="line-through">Server</span> nothing leaves this device</p>
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
    font-size: 0.8rem;
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
