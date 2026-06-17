/** Sample library — public-domain texts seeded on first load so the reader
 * has something to narrate before any uploads. */

import type { NarratorDoc } from "./types";

export const SAMPLE_DOCS: NarratorDoc[] = [
  {
    id: "time-machine",
    title: "The Time Machine",
    author: "H. G. Wells",
    kind: "epub",
    accent: "#1291FA",
    meta: "Novel · 1895",
    voice: "",
    progress: 0.18,
    chapters: [
      {
        id: "tm-1",
        title: "The Inventor",
        paragraphs: [
          "The Time Traveller, for so it will be convenient to speak of him, was expounding a recondite matter to us.",
          "His pale grey eyes shone and twinkled, and his usually pale face was flushed and animated. The fire burned brightly, and the soft radiance of the incandescent lights lit the bubbles that flashed and passed in our glasses.",
          "Our chairs, being his patents, embraced and caressed us rather than submitted to be sat upon, and there was that luxurious after-dinner atmosphere when thought runs gracefully free of the trammels of precision.",
        ],
      },
      {
        id: "tm-2",
        title: "The Argument",
        paragraphs: [
          "You must follow me carefully. I shall have to controvert one or two ideas that are almost universally accepted.",
          "The geometry, for instance, they taught you at school is founded on a misconception. Clearly any real body must have extension in four directions: it must have Length, Breadth, Thickness, and Duration.",
          "There is no difference between Time and any of the three dimensions of Space except that our consciousness moves along it. Some philosophical people have been asking why three dimensions particularly, and why not another at right angles to the other three.",
        ],
      },
      {
        id: "tm-3",
        title: "The Machine",
        paragraphs: [
          "I am afraid I cannot convey the peculiar sensations of time travelling. They are excessively unpleasant.",
          "There is a feeling exactly like that one has upon a switchback, of a helpless headlong motion. I felt the same horrible anticipation, too, of an imminent smash.",
          "As I put on pace, night followed day like the flapping of a black wing. The dim suggestion of the laboratory seemed presently to fall away from me, and I saw the sun hopping swiftly across the sky, leaping it every minute.",
        ],
      },
    ],
  },
  {
    id: "self-hosting",
    title: "Notes on Self-Hosting Everything",
    author: "Gaspard Etienne",
    kind: "paste",
    accent: "#A21FB8",
    meta: "Article · pasted",
    voice: "",
    progress: 0,
    chapters: [
      {
        id: "sh-1",
        title: "Why bother",
        paragraphs: [
          "I run my own little corner of the internet, and people keep asking me why.",
          "The honest answer is that I like understanding the things I depend on. When my photos live on my own disks, behind my own login, I know exactly what happens to them.",
          "It is slower to set up and it breaks in interesting ways, but every outage teaches me something a managed service would have hidden.",
        ],
      },
      {
        id: "sh-2",
        title: "The stack",
        paragraphs: [
          "Everything sits behind a single sign-on layer, so one login opens the whole house.",
          "Media streaming, photo backup, document sync, and a small language model all share the same front door. The dashboard ties them together into something that almost feels like a product.",
          "None of it is finished. That is rather the point: a homelab is a garden, not a monument.",
        ],
      },
    ],
  },
  {
    id: "meditations",
    title: "Meditations, Book II",
    author: "Marcus Aurelius",
    kind: "txt",
    accent: "#FF0C0D",
    meta: "Philosophy · 170 AD",
    voice: "",
    progress: 0.62,
    chapters: [
      {
        id: "me-1",
        title: "At Dawn",
        paragraphs: [
          "Begin the morning by saying to thyself, I shall meet with the busy-body, the ungrateful, arrogant, deceitful, envious, unsocial.",
          "All these things happen to them by reason of their ignorance of what is good and evil. But I have seen the nature of the good that it is beautiful, and of the bad that it is ugly.",
          "I can neither be injured by any of them, for no one can fix on me what is ugly, nor can I be angry with my kinsman, nor hate him.",
        ],
      },
      {
        id: "me-2",
        title: "On Time",
        paragraphs: [
          "Do every act of thy life as if it were the last, laying aside all carelessness and passionate aversion from the commands of reason.",
          "Remember how long thou hast been putting off these things, and how often thou hast received an opportunity from the gods, and yet dost not use it.",
          "Thou must now at last perceive of what universe thou art a part, and of what administrator of the universe thy existence is an efflux.",
        ],
      },
    ],
  },
  {
    id: "ddia",
    title: "Designing Data-Intensive Apps — Ch. 1",
    author: "M. Kleppmann",
    kind: "pdf",
    accent: "#22C55E",
    meta: "Technical · PDF, OCR",
    voice: "",
    progress: 0.04,
    chapters: [
      {
        id: "dd-1",
        title: "Reliable, Scalable, Maintainable",
        paragraphs: [
          "Many applications today are data-intensive, as opposed to compute-intensive. Raw CPU power is rarely a limiting factor for these applications.",
          "Bigger problems are usually the amount of data, the complexity of data, and the speed at which it is changing.",
          "A data-intensive application is typically built from standard building blocks that provide commonly needed functionality: databases, caches, search indexes, stream processing, and batch processing.",
        ],
      },
    ],
  },
];
