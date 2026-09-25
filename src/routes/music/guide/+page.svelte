<script lang="ts">
  // The guide: how Woodshed works, in plain words, one short topic each.
  const TOPICS = [
    { id: "session", label: "How a session works" },
    { id: "check", label: "Practice and Check" },
    { id: "not-measured", label: "Not measured" },
    { id: "connect", label: "MIDI, the MPC and the mic" },
    { id: "keys", label: "Playing from the keyboard" },
    { id: "shortcuts", label: "Shortcuts" },
    { id: "streaks", label: "Streaks and XP" },
    { id: "privacy", label: "Privacy" },
  ];
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

  <nav aria-label="Guide topics" class="lg:sticky lg:top-20 lg:self-start">
    <ul class="flex flex-wrap gap-2 lg:flex-col lg:gap-1">
      {#each TOPICS as t (t.id)}
        <li>
          <a href="#{t.id}" class="flex min-h-11 items-center rounded-full border border-ws-line px-4 text-sm text-ws-soft hover:bg-ws-raised hover:text-ws-ink lg:rounded-lg lg:border-0 lg:px-3">{t.label}</a>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="flex min-w-0 flex-col gap-12">
    <section id="session" aria-labelledby="session-h" class="scroll-mt-20">
      <h2 id="session-h" class={h2}>How a session works</h2>
      <div class={prose}>
        <p>Open <a class={link} href="/music">Today</a> and pick how many minutes you have. Woodshed builds a short set from what is due: something you are learning, something slipping, and something to review. Press Start and go block by block; you can skip or swap any of it.</p>
        <p>Every drill runs the same way. The setup is remembered and folded into one line, so most days you just press Start. A count-in plays first, and nothing you play during it is graded. When the run ends you get one sentence on how it went, the number that matters, the change since your last run with the same setup, and what to try next.</p>
        <p>Your session is saved as you go. There is nothing to submit.</p>
      </div>
    </section>

    <section id="check" aria-labelledby="check-h" class="scroll-mt-20">
      <h2 id="check-h" class={h2}>Practice and Check</h2>
      <div class={prose}>
        <p>Every graded drill has two modes. <strong>Practice</strong> shows you the targets on the keys, frets or pads, and lets you hear it first. <strong>Check</strong> hides them.</p>
        <p>Only Check moves your skill mastery. Playing a scale while it is lit up proves you can follow lights; playing it from memory proves you know it. Practice runs are still saved and still earn XP, they just do not claim more than they show. If you use a hint in Practice, the run is recorded as hinted.</p>
        <p>"Hear it first" is a demo. It is never scored.</p>
      </div>
    </section>

    <section id="not-measured" aria-labelledby="nm-h" class="scroll-mt-20">
      <h2 id="nm-h" class={h2}>What "Not measured" means</h2>
      <div class={prose}>
        <p>Some inputs cannot see some things. An on-screen pad has no velocity, the microphone cannot tell which string you used, a computer keyboard plays one note at a time so it cannot judge two hands together.</p>
        <p>When that happens the result says <strong>Not measured</strong> for that part and leaves it out of the score, rather than giving you a zero or a flattering 100%. Connect the real instrument and those rows start counting.</p>
      </div>
    </section>

    <section id="connect" aria-labelledby="connect-h" class="scroll-mt-20">
      <h2 id="connect-h" class={h2}>MIDI, the MPC and the microphone</h2>
      <div class={prose}>
        <p><strong>MIDI</strong> works in Chromium browsers. Plug in the keyboard, MPC or Aerophone and enable MIDI once on <a class={link} href="/music/connect">Connect</a>; after that Woodshed reopens it on every visit. Name each device and tell it which instrument it is.</p>
        <p><strong>The MPC One+</strong> only sends pad notes while a computer keeps talking to it. Turn on the controller link on Connect and Woodshed keeps that conversation going on every page, not just that one. If your pads send the Akai Classic notes, pick that pad map there, or use Learn pads and hit each pad once.</p>
        <p><strong>The microphone</strong> is for guitar, ukulele and voice. It only starts when you press something that needs it, and it stops when the drill ends. Pick the input and echo cancellation in <a class={link} href="/music/settings#input">Settings</a>; the <a class={link} href="/music/tuner">Tuner</a> is the quickest way to check it hears you.</p>
        <p>If notes feel late, run a latency calibration in <a class={link} href="/music/settings#latency">Settings</a>.</p>
      </div>
    </section>

    <section id="keys" aria-labelledby="keys-h" class="scroll-mt-20">
      <h2 id="keys-h" class={h2}>Playing from the computer keyboard</h2>
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

    <section id="shortcuts" aria-labelledby="shortcuts-h" class="scroll-mt-20">
      <h2 id="shortcuts-h" class={h2}>Shortcuts</h2>
      <dl class="mt-3 grid max-w-prose grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-3">
        <dt><kbd class="kbd">Space</kbd></dt>
        <dd>Start a drill, or run it again from the results, while focus is not on a button or field.</dd>
        <dt><kbd class="kbd">Esc</kbd></dt>
        <dd>Stop a run or count-in.</dd>
        <dt><span class="flex gap-1"><kbd class="kbd">⌘</kbd><kbd class="kbd">K</kbd></span></dt>
        <dd>Search every drill, path, song and page. <kbd class="kbd">Ctrl</kbd> <kbd class="kbd">K</kbd> on Windows and Linux. Arrow keys move, Enter goes.</dd>
      </dl>
    </section>

    <section id="streaks" aria-labelledby="streaks-h" class="scroll-mt-20">
      <h2 id="streaks-h" class={h2}>Streaks, freezes and XP</h2>
      <div class={prose}>
        <p>Your streak counts the days you practise in a row. It is forgiving: every week you practise earns a <strong>freeze</strong>, and you can hold two. Miss a day and come back, and a freeze covers the gap for you. Frozen days show dashed on the week calendar.</p>
        <p><strong>XP</strong> rewards showing up and doing the work: a wrong answer still earns a little, a hard clean run earns a lot more, and beating your last run adds a bonus. Every 250 XP is a level.</p>
        <p>XP is not skill. Mastery is separate and only moves on Check runs, and it fades if you leave a skill alone, so Progress can tell you what is actually due.</p>
      </div>
    </section>

    <section id="privacy" aria-labelledby="privacy-h" class="scroll-mt-20">
      <h2 id="privacy-h" class={h2}>Privacy</h2>
      <div class={prose}>
        <p>Everything stays in this browser: sessions, scores, recordings and samples. There is no account and nothing is sent to a server. The microphone audio is analysed on this device and only saved when you record a take.</p>
        <p>Clearing this site's data in the browser deletes it, so make a backup in <a class={link} href="/music/settings#data">Settings</a> now and then. Backups are files you keep.</p>
      </div>
    </section>
  </div>
</div>

<style>
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
