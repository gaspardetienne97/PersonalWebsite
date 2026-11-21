<!--
  The logo intro, shown full screen over the home page on a visitor's first visit
  (and again on Ctrl+Shift+G, M, E). The name, the role line and a "Play the
  intro" button sit under the logo. The button, or the first input of any kind
  (a press on the logo or anywhere else, a key, a scroll), grows a circuit board
  out of its ring, the logo unfolds into the initials G M E and the name appears
  large. No trace is routed within 24px of the name, its line or the button at
  the foot. It never lifts by itself: the
  labelled button at the foot ("Skip intro", then "Explore the site") or Escape
  lifts it away at any time, and so does a scroll once it has played. The board
  it grew stays behind the site as the background.

  The root layout mounts this on "/" only. A one-line head script hides it before
  first paint for anyone who has already seen it, so returning visitors never
  see it flash.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import ChevronsDown from "@lucide/svelte/icons/chevrons-down";
  import Play from "@lucide/svelte/icons/play";
  import type { Board } from "#lib/circuit/router.ts";
  import CircuitPaths from "./CircuitPaths.svelte";
  import GmeMark from "./GmeMark.svelte";
  import { name } from "#lib/config.ts";
  import { m } from "@repo/i18n/messages.js";
  import {
    SEEN_CLASS,
    SEEN_KEY,
    growSiteBoard,
    randomSeed,
    site,
    type Rect,
  } from "./intro.svelte";

  /** GmeMark's viewBox and the logo's outer radius in it (ring 300, drawn at 1.45×). */
  const VIEW_W = 2100;
  const VIEW_H = 680;
  const LOGO_RADIUS = 300 * 1.45;
  const STEP_MS = 26;
  const LEAVE_MS = 800;
  /** No trace comes nearer than 24px to the words or the button: 24 and half a trace and a via. */
  const CLEAR = 28;

  // Split so the Svelte parser doesn't read the closing tag as the end of this block.
  const headScript = `<script>try{if(localStorage.getItem("${SEEN_KEY}"))document.documentElement.classList.add("${SEEN_CLASS}")}catch(e){}<${"/"}script>`;

  let overlay = $state<HTMLElement>();
  let mark = $state<HTMLButtonElement>();
  let copy = $state<HTMLElement>();
  let actions = $state<HTMLElement>();

  let open = $state(true);
  let leaving = $state(false);
  let spelled = $state(false);
  let revealed = $state(false);
  let board = $state<Board | null>(null);
  let seed = 0;
  let ring = { cx: 0, cy: 0, r: 0 };
  let timers: ReturnType<typeof setTimeout>[] = [];

  const reducedMotion = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const later = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
  const clearTimers = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };

  function grow(): Board | null {
    if (!overlay || !mark) return null;
    const box = overlay.getBoundingClientRect();
    const logo = mark.getBoundingClientRect();
    ring = {
      cx: logo.left - box.left + logo.width / 2,
      cy: logo.top - box.top + logo.height * (340 / VIEW_H),
      r: LOGO_RADIUS * (logo.width / VIEW_W) + 6,
    };
    seed = randomSeed();
    // The name and its line (laid out already, shown once the board has grown) and
    // the button at the foot, whose label grows from "Skip intro" to "Explore the site".
    const clear = (el: HTMLElement | undefined, side: number): Rect[] => {
      if (!el) return [];
      const r = el.getBoundingClientRect();
      return [
        {
          x: r.left - box.left - side,
          y: r.top - box.top - CLEAR,
          w: r.width + side * 2,
          h: r.height + CLEAR * 2,
        },
      ];
    };
    return growSiteBoard(box.width, box.height, ring, seed, [
      ...clear(copy, CLEAR),
      ...clear(actions, CLEAR + 36),
    ]);
  }

  function play() {
    clearTimers();
    if (spelled) {
      // Fold the initials back into the logo; the next click grows a new board.
      spelled = false;
      board = null;
      return;
    }
    board = grow();
    if (reducedMotion()) {
      spelled = true;
      revealed = true;
      return;
    }
    const grown = (board?.depth ?? 0) * STEP_MS;
    later(600, () => (spelled = true));
    later(Math.max(1600, grown * 0.7), () => (revealed = true));
  }

  function remember() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* storage blocked: the intro shows again next visit */
    }
  }

  /** Lift the intro away. Its board, if any, stays on as the site background. */
  function dismiss() {
    if (!open || leaving) return;
    clearTimers();
    remember();
    if (board) {
      site.board = board;
      site.ring = ring;
      site.seed = seed;
    }
    leaving = true;
    later(reducedMotion() ? 0 : LEAVE_MS, () => {
      open = false;
      leaving = false;
    });
  }

  async function start() {
    clearTimers();
    document.documentElement.classList.remove(SEEN_CLASS);
    spelled = false;
    revealed = false;
    leaving = false;
    board = null;
    open = true;
    await tick();
    overlay?.focus();
  }

  onMount(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* storage blocked: treat as a first visit */
    }
    // Focus the dialog itself so keys work at once without drawing a ring on the logo.
    if (seen && !site.replay) open = false;
    else overlay?.focus();
    return clearTimers;
  });

  // Ctrl+Shift+G, M, E (or the footer's replay link) asks for the intro again.
  $effect(() => {
    if (!site.replay) return;
    site.replay = false;
    start();
  });

  // While the intro is up, the page behind it can't scroll or take focus.
  $effect(() => {
    if (!open || leaving || !overlay) return;
    const siblings = [...(overlay.parentElement?.children ?? [])].filter(
      (el): el is HTMLElement => el !== overlay && el instanceof HTMLElement,
    );
    siblings.forEach((el) => (el.inert = true));
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      siblings.forEach((el) => (el.inert = false));
      root.style.overflow = overflow;
    };
  });

  /** The logo and the button at the foot answer for themselves. */
  const onButton = (event: Event) =>
    event.target instanceof Element && event.target.closest("button") !== null;

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape") return dismiss();
    // Shortcuts (the replay one included) and keys that only move focus are not a start.
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (board === null) {
      const starts = event.key.length === 1 || /^(Enter|Arrow|Page)/.test(event.key);
      if (starts && !onButton(event)) play();
      return;
    }
    if (revealed && ["ArrowDown", "PageDown", " "].includes(event.key)) {
      if (event.key === " " && onButton(event)) return;
      event.preventDefault();
      dismiss();
    }
  }

  function onclick(event: MouseEvent) {
    if (board === null && !onButton(event)) play();
  }

  // One swipe on a trackpad is a long run of wheel events. Only the first of a
  // run counts, so the scroll that starts the intro can't also lift it.
  let lastWheel = -Infinity;
  function onwheel(event: WheelEvent) {
    const fresh = event.timeStamp - lastWheel > 250;
    lastWheel = event.timeStamp;
    if (!fresh) return;
    if (board === null) play();
    else if (revealed && event.deltaY > 0) dismiss();
  }

  let touchY = 0;
  function ontouchend(event: TouchEvent) {
    if (touchY - (event.changedTouches[0]?.clientY ?? 0) <= 40) return;
    if (board === null) play();
    else dismiss();
  }
</script>

<svelte:head>
  {@html headScript}
</svelte:head>

{#if open}
  <div
    bind:this={overlay}
    class="intro"
    class:revealed
    class:leaving
    class:grown={board !== null}
    role="dialog"
    aria-modal="true"
    aria-label={m.intro_label()}
    tabindex="-1"
    {onkeydown}
    {onclick}
    {onwheel}
    ontouchstart={(event) => (touchY = event.touches[0]?.clientY ?? 0)}
    {ontouchend}
  >
    {#if board}
      <div class="board">
        <CircuitPaths {board} grow={!reducedMotion()} stepMs={STEP_MS} />
      </div>
    {/if}

    <div class="stage">
      <div class="logo">
        <button
          bind:this={mark}
          type="button"
          class="mark"
          onclick={play}
          aria-label={spelled ? m.intro_fold() : m.intro_animate()}
        >
          <GmeMark {spelled} />
          <span class="hit" aria-hidden="true"></span>
        </button>
        <!-- Whose site this is and what they do, from the first frame, and the button
             that starts the intro. The large name and line below are the ones a screen
             reader gets, so these copies are for the eye only. -->
        <div class="wait" inert={board !== null}>
          <span class="who" aria-hidden="true">{name}</span>
          <span class="what" aria-hidden="true">{m.home_lede()}</span>
          <button type="button" class="press" onclick={play}>
            <Play aria-hidden="true" fill="currentColor" />{m.intro_play()}
          </button>
        </div>
      </div>

      <div class="copy" bind:this={copy}>
        <p class="name">{name}</p>
        <p class="role">
          {m.intro_role_line1()}<br />{m.intro_role_line2()}
        </p>
      </div>
    </div>

    <div class="actions" bind:this={actions}>
      <button type="button" class="cue" onclick={dismiss}>
        <span class="disc" aria-hidden="true"><ChevronsDown strokeWidth={1.75} /></span>
        <span class="cue-label">{revealed ? m.intro_explore() : m.intro_skip()}</span>
      </button>
    </div>
  </div>
{/if}

<style>
  :global(html.gm-intro-seen) .intro {
    display: none;
  }

  .intro {
    position: fixed;
    inset: 0;
    z-index: 60;
    isolation: isolate;
    display: grid;
    place-items: center;
    overflow: hidden;
    background: var(--background);
    color: var(--foreground);
    font-family: var(--font-gm-display);
    outline: none;
    transition: background-color 0.8s ease;
  }
  /* Perfboard dots, one per grid node, fading out toward the edges. */
  .intro::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: radial-gradient(circle, var(--gm-dot) 1.1px, transparent 1.7px);
    background-size: 16px 16px;
    mask-image: radial-gradient(ellipse 75% 70% at 50% 48%, #000 35%, transparent 100%);
    transition: opacity 0.6s ease;
  }
  .board {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    transition: opacity 0.8s ease;
  }

  .stage {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(2.5rem, 7vh, 4.5rem);
    width: 100%;
    padding: clamp(3rem, 10vh, 6rem) 1.25rem clamp(6.5rem, 15vh, 8rem);
    /* One steady hand across the whole logo area, so it never switches to an
       arrow at the ring's edge or in its gaps. */
    cursor: pointer;
  }
  /* The logo's box: the button, and under it what shows while the intro waits.
     Also held to the height (less the room the name, the line and the two buttons
     under the ring need), so on a short screen they stay clear of each other. */
  .logo {
    position: relative;
    width: min(56rem, 88vw, max(12rem, 175vh - 38.5rem));
  }
  /* A frosted veil: the board grows out of the logo, so it runs on under it,
     washed and softly blurred so it reads as texture, not noise. Edges feather
     out. The name and its line need none: no trace is routed near them. */
  .mark,
  .copy {
    position: relative;
  }
  .mark::before {
    content: "";
    position: absolute;
    z-index: -1;
    pointer-events: none;
    background: color-mix(in oklab, var(--background) 72%, transparent);
    backdrop-filter: blur(3.5px);
    mask-image:
      linear-gradient(to right, transparent, #000 10%, #000 90%, transparent),
      linear-gradient(to bottom, transparent, #000 22%, #000 78%, transparent);
    mask-composite: intersect;
    /* Nothing to veil until the board grows: fade in as the logo unfolds. */
    opacity: 0;
    transition: opacity 0.5s ease;
  }
  .grown .mark::before {
    opacity: 1;
    transition: opacity 1.2s ease 0.15s;
  }
  .mark::before {
    inset: -20% -3%;
  }

  .mark {
    display: block;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
    border-radius: 1rem;
  }
  .mark:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 1.5rem;
  }

  /* Until it's clicked, the logo's ring sends out a slow ripple, like a pad
     waiting for a signal, and swells a touch on hover. The ring's outer edge is
     435 of the 2100 unit drawing (41.4% of its width), centred in the button. */
  .mark :global(.gme) {
    transition: scale 0.4s cubic-bezier(0.3, 0, 0.2, 1);
  }
  /* The ring overflows the button's box, so the button and the drawing ignore
     the pointer and a plain HTML disc laid over the ring takes it instead. One
     still element under the cursor means the cursor never flickers while the
     ripple and the hover swell animate. Once spelled, the disc opens out to
     the whole button. Clicks on it bubble to the button. */
  .mark,
  .mark :global(.gme) {
    pointer-events: none;
  }
  .hit {
    position: absolute;
    left: 50%;
    top: 50%;
    /* The ring is 41.4% of the drawing; this also covers its hover swell
       (×1.03) and the still ring that replaces the ripple on hover (×1.08). */
    width: 45%;
    aspect-ratio: 1;
    translate: -50% -50%;
    border-radius: 50%;
    pointer-events: auto;
    cursor: pointer;
  }
  .grown .hit {
    width: 100%;
    height: 100%;
    aspect-ratio: auto;
    border-radius: 1rem;
  }
  .intro:not(.grown) .mark:hover :global(.gme) {
    scale: 1.03;
  }
  .mark::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 41.4%;
    aspect-ratio: 1;
    translate: -50% -50%;
    border-radius: 50%;
    border: 2px solid transparent;
    background: var(--gm-brand) border-box;
    mask:
      linear-gradient(#000 0 0) padding-box exclude,
      linear-gradient(#000 0 0);
    opacity: 0;
    pointer-events: none;
  }
  .intro:not(.grown) .mark::after {
    animation: ripple 2.6s cubic-bezier(0.2, 0.6, 0.3, 1) 0.8s infinite;
  }
  /* Under the pointer the ripple settles into a still ring: it has done its
     job, and nothing keeps animating beneath the cursor. */
  .intro:not(.grown) .mark:hover::after {
    animation: none;
    scale: 1.08;
    opacity: 0.6;
    transition:
      scale 0.4s ease,
      opacity 0.4s ease;
  }
  @keyframes ripple {
    0% {
      scale: 1.02;
      opacity: 0;
    }
    15% {
      opacity: 0.7;
    }
    100% {
      scale: 1.34;
      opacity: 0;
    }
  }

  /* Until the intro starts: whose site this is, what they do, and the button
     that plays it. They sit 24px below the ripple's widest reach (the ring is
     41.4% of the logo's width, the ripple ends at 1.34 times that), so the ring
     never crosses them. A press on the words counts as a press on the logo. */
  .wait {
    position: absolute;
    left: 50%;
    top: 50%;
    margin-top: calc(27.75% + 1.5rem);
    translate: -50% 0;
    display: grid;
    justify-items: center;
    width: max-content;
    max-width: calc(100vw - 2.5rem);
    text-align: center;
    cursor: pointer;
    transition: opacity 0.3s ease;
  }
  .who {
    font-size: 1.125rem;
    font-weight: 650;
    line-height: 1.2;
    letter-spacing: -0.01em;
    color: var(--foreground);
  }
  .what {
    margin-top: 0.3rem;
    font-family: var(--font-gm-serif);
    font-size: 1.0625rem;
    line-height: 1.35;
    color: color-mix(in oklab, var(--foreground) 78%, var(--muted-foreground));
    text-wrap: balance;
  }
  /* A real button, in the site's main button colours, 44px tall. */
  .press {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    margin-top: 0.85rem;
    padding: 0 1.25rem 0 1.1rem;
    border-radius: 999px;
    font-size: 1rem;
    font-weight: 650;
    white-space: nowrap;
    color: var(--primary-foreground);
    background: var(--primary);
    cursor: pointer;
    outline: none;
    transition: background-color 0.15s ease;
  }
  .press :global(svg) {
    width: 0.9rem;
    height: 0.9rem;
  }
  .press:hover {
    background: color-mix(in oklab, var(--primary) 86%, var(--background));
  }
  .press:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 3px;
  }
  .grown .wait {
    opacity: 0;
    pointer-events: none;
  }
  /* A phone on its side has no room for the line between the name and the button. */
  @media (height < 30rem) {
    .what {
      display: none;
    }
  }

  .copy {
    position: relative;
    display: grid;
    justify-items: center;
    text-align: center;
    gap: 0.75rem;
    max-width: 40rem;
  }
  .name {
    font-weight: 700;
    /* Small enough at 390px to leave a gutter of 20px or more on each side. */
    font-size: clamp(1.5rem, 7.2vw, 3.6rem);
    line-height: 1;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }
  .role {
    font-family: var(--font-gm-serif);
    font-size: clamp(1.1rem, 2vw, 1.35rem);
    line-height: 1.45;
    color: color-mix(in oklab, var(--foreground) 78%, var(--muted-foreground));
    max-width: 34ch;
    text-wrap: balance;
  }
  .name,
  .role {
    opacity: 0;
    transition: opacity 0.7s ease;
  }
  .role {
    transition-delay: 0.15s;
  }
  /* Folded back into the logo, the screen is the waiting one again: the small
     name and the caption, not these. */
  .revealed.grown .name,
  .revealed.grown .role {
    opacity: 1;
  }

  .actions {
    position: absolute;
    bottom: clamp(1rem, 4vh, 2.5rem);
    left: 50%;
    z-index: 2;
    translate: -50% 0;
  }
  /* The way on: a double chevron on a disc with its name under it, "Skip intro"
     while the intro waits or plays and "Explore the site" once the name is up. */
  .cue {
    display: grid;
    justify-items: center;
    gap: 0.5rem;
    min-width: 2.75rem;
    padding: 0.25rem 0.5rem;
    border-radius: 1rem;
    color: var(--foreground);
    cursor: pointer;
    outline: none;
  }
  .cue:focus-visible {
    outline: 2px solid var(--ring);
    outline-offset: 4px;
  }
  .disc {
    position: relative;
    display: grid;
    place-items: center;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    /* Frosted, so the traces pass behind it, not through it. */
    background: color-mix(in oklab, var(--background) 82%, transparent);
    backdrop-filter: blur(4px);
    box-shadow:
      inset 0 0 0 1px var(--border),
      0 0 1.25rem 0.75rem color-mix(in oklab, var(--background) 70%, transparent);
  }
  .cue:hover .disc {
    background: var(--accent);
  }
  /* Once the logo is clicked the disc takes on the ripple's gradient ring. */
  .disc::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    border: 2px solid transparent;
    background: var(--gm-brand) border-box;
    mask:
      linear-gradient(#000 0 0) padding-box exclude,
      linear-gradient(#000 0 0);
    opacity: 0;
    transition: opacity 0.8s ease 0.3s;
    pointer-events: none;
  }
  .grown .disc::before {
    opacity: 1;
  }
  .disc :global(svg) {
    width: 2.5rem;
    height: 2.5rem;
  }
  .cue-label {
    padding: 0.15rem 0.7rem;
    border-radius: 999px;
    font-size: 1rem;
    font-weight: 600;
    white-space: nowrap;
    background: var(--background);
  }
  /* Still until the logo is clicked, then it starts to beckon downward. */
  .grown .disc :global(svg) {
    animation: cue-pulse 1.8s ease-in-out infinite;
  }
  @keyframes cue-pulse {
    0%,
    100% {
      translate: 0 -3px;
      opacity: 0.6;
    }
    50% {
      translate: 0 4px;
      opacity: 1;
    }
  }

  /* Leaving: the letters and name lift away like a page scrolling, the paper
     clears, and the board fades back to become the site's background. */
  .stage,
  .actions {
    transition:
      translate 0.8s cubic-bezier(0.6, 0, 0.3, 1),
      opacity 0.6s ease;
  }
  .leaving {
    background-color: transparent;
    pointer-events: none;
  }
  .leaving::before {
    opacity: 0;
  }
  .leaving .stage {
    translate: 0 -45vh;
    opacity: 0;
  }
  .leaving .actions {
    translate: -50% -45vh;
    opacity: 0;
  }
  .leaving .board {
    opacity: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .intro,
    .stage,
    .actions,
    .board,
    .mark::before,
    .press {
      transition: none;
    }
    .grown .disc :global(svg) {
      animation: none;
      opacity: 1;
    }
    .wait {
      transition: none;
    }
    /* No ripple: a still, faint halo marks the logo as something to press. */
    .intro:not(.grown) .mark::after {
      animation: none;
      scale: 1.12;
      opacity: 0.45;
    }
  }
</style>
