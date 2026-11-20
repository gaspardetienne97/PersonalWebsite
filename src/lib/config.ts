import Github from "lucide-svelte/icons/github";
import Linkedin from "lucide-svelte/icons/linkedin";
// For the commented-out socials below: uncomment with them.
// import Instagram from "lucide-svelte/icons/instagram";
// import Youtube from "lucide-svelte/icons/youtube";
// import Mail from "lucide-svelte/icons/mail";

export const name = "Gaspard Michel Etienne";
export const shortName = "Gaspard Etienne";
export const title = "Gaspard Michel Etienne";
export const description =
  "Gaspard Michel Etienne, a full-stack software engineer in Boston. Projects, writing, drawings and more.";

/**
 * Links shown on the About page and in the footer, each with its icon. Nothing
 * renders while the list is empty.
 */
export const socials: { label: string; href: string; icon: typeof Github }[] = [
  { label: "GitHub", href: "https://github.com/gaspardetienne97", icon: Github },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/gaspardetienne", icon: Linkedin },
  // Fill in and uncomment to show them:
  // { label: "Instagram", href: "https://www.instagram.com/<handle>", icon: Instagram },
  // { label: "YouTube", href: "https://www.youtube.com/@<handle>", icon: Youtube },
  // { label: "Email", href: "mailto:<address>", icon: Mail },
];

/** Site navigation. Big apps such as Woodshed and Narrator are reached from Projects. */
export const nav = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/studio", label: "Studio" },
  { href: "/blog", label: "Blog" },
] as const;

/**
 * Route apps that take the whole screen with their own look, outside the site
 * chrome. Woodshed (/music) joins them from its own branch, which hides the chrome
 * in the root layout and adds its own way home.
 */
export const fullscreenApps = ["/pdf"] as const;

export const isFullscreenApp = (path: string) =>
  fullscreenApps.some((app) => path === app || path.startsWith(`${app}/`));
