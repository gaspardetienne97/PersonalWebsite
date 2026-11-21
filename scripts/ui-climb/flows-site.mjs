// The personal site's flows for the UI hill climb (project "site").
//   id: panel id, shared with the competitor library (<work>/competitors/flows.json);
//   flow: the name judges see; job: what the screens are for (no site names);
//   shots: capture dirs under <work>/shots/<round>/; comp: competitor flow ids;
//   panel: the screens judges see, in order, as [state, width, theme] or
//   [state, width, theme, "full"] for the whole page (see pickPanel in flows.mjs).
const flow = (id, name, job, panel) => ({ id, flow: name, job, shots: [id], comp: [id], panel });

export const FLOWS = [
  flow(
    "home",
    "Home page: a first visit with a logo intro, and the returning visit",
    "The front door of one person's site. A first visit opens on an animated logo that grows a circuit board and unfolds into initials before the page; a returning visit goes straight to the page: who this is, the newest post and piece, and a door into every kind of work.",
    [
      ["intro-waiting", "desktop", "light"],
      ["intro-mid-play", "desktop", "dark"],
      ["intro-settled", "phone", "dark"],
      ["home-after-intro", "desktop", "light"],
      ["home", "desktop", "dark", "full"],
      ["home", "phone", "light"],
      ["home-doors", "phone", "dark"],
      ["home-fr", "phone", "light", "full"],
    ],
  ),
  flow(
    "about",
    "About page",
    "Who this person is, what they work on and how to reach them, with ways on into the rest of the site.",
    [
      ["page", "desktop", "light", "full"],
      ["page", "phone", "dark"],
      ["this-website", "desktop", "dark"],
      ["this-website", "phone", "light"],
      ["end", "desktop", "light"],
      ["end", "phone", "dark"],
      ["page-fr", "phone", "light", "full"],
    ],
  ),
  flow(
    "blog-index",
    "Writing: the list of posts",
    "Finding something to read: the list of articles, newest first, with a way to filter by topic.",
    [
      ["list", "desktop", "light", "full"],
      ["list", "phone", "dark", "full"],
      ["filtered", "desktop", "dark"],
      ["filtered", "phone", "light"],
      ["row-hover", "desktop", "light"],
      ["list-fr", "phone", "light"],
    ],
  ),
  flow(
    "blog-post",
    "Writing: one article, reading",
    "Reading one article from top to bottom: title and date, the text with code, and where to go next.",
    [
      ["top", "desktop", "light"],
      ["top", "phone", "dark"],
      ["code", "desktop", "dark"],
      ["code", "phone", "light"],
      ["end", "desktop", "light"],
      ["end", "phone", "dark"],
      ["top", "desktop", "dark", "full"],
      ["end-fr", "phone", "light"],
    ],
  ),
  flow(
    "studio",
    "Studio: a wall of all the work, and a view by kind",
    "Browsing everything one person makes (drawings, music, paintings, photos, projects, videos) as one wall of equal tiles, filtering it to one kind, or seeing one card per kind.",
    [
      ["wall", "desktop", "light"],
      ["wall", "phone", "dark"],
      ["wall-drawings", "desktop", "dark"],
      ["kinds", "desktop", "light"],
      ["kinds", "phone", "light"],
      ["empty-kind", "phone", "dark"],
      ["tile-hover", "desktop", "dark"],
      ["wall-fr", "phone", "light"],
    ],
  ),
  flow(
    "studio-viewer",
    "Studio: one piece opened in the viewer",
    "Looking at one piece large and stepping to the next and previous ones.",
    [
      ["open", "desktop", "light"],
      ["open", "phone", "dark"],
      ["wide", "desktop", "dark"],
      ["wide", "phone", "light"],
      ["from-wall", "desktop", "light"],
      ["from-wall", "phone", "dark"],
      ["open-fr", "phone", "light"],
    ],
  ),
  flow(
    "listplay",
    "Playlists: the index and one playlist",
    "A small music tool on the site: the visitor's playlists, and the tracks of one playlist.",
    [
      ["index", "desktop", "light"],
      ["index", "phone", "dark"],
      ["playlist", "desktop", "dark"],
      ["playlist", "phone", "light"],
      ["index-fr", "phone", "light"],
    ],
  ),
  flow(
    "nav",
    "Getting around: header, language menu, phone menu, footer",
    "Moving around the site: the header and its links, choosing a language, the menu at phone width, keyboard focus, and the footer.",
    [
      ["header", "desktop", "light"],
      ["language-menu", "desktop", "dark"],
      ["keyboard-focus", "desktop", "light"],
      ["phone-menu", "phone", "light"],
      ["language-menu", "phone", "dark"],
      ["footer", "desktop", "dark"],
      ["footer", "phone", "light"],
      ["phone-menu-fr", "phone", "dark"],
    ],
  ),
  flow(
    "sign-in",
    "Signing in",
    "The sign-in page a visitor reaches from the private area while signed out, and what it says when sign-in fails.",
    [
      ["login|login-unavailable", "desktop", "light"],
      ["login|login-unavailable", "phone", "dark"],
      ["login-cancelled", "desktop", "dark"],
      ["login-cancelled", "phone", "light"],
      ["private-signed-out", "desktop", "light"],
      ["login-fr", "phone", "light"],
    ],
  ),
  flow(
    "not-found",
    "Page not found",
    "What a visitor sees at an address that does not exist, and how they get back to something real.",
    [
      ["404", "desktop", "light"],
      ["404", "phone", "dark"],
      ["404-post", "desktop", "dark"],
      ["404-post", "phone", "light"],
      ["404-fr", "phone", "light"],
    ],
  ),
];
