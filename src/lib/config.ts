import type { Component } from "svelte";
import { m } from "@repo/i18n/messages.js";
// Lucide dropped brand icons in 1.0, so these are local, drawn in Lucide's style.
import Github from "#lib/components/site/icons/Github.svelte";
import Linkedin from "#lib/components/site/icons/Linkedin.svelte";
// For the commented-out socials below: uncomment with them.
// import Instagram from "#lib/components/site/icons/Instagram.svelte";
// import Youtube from "#lib/components/site/icons/Youtube.svelte";
// import Mail from "@lucide/svelte/icons/mail";

type Icon = Component<{
  size?: number | string;
  class?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export const name = "Gaspard Michel Etienne";
export const shortName = "Gaspard Etienne";
export const title = "Gaspard Michel Etienne";

/**
 * Links shown on the About page and in the footer, each with its icon. Nothing
 * renders while the list is empty.
 */
export const socials: { label: string; href: string; icon: Icon }[] = [
  { label: "GitHub", href: "https://github.com/gaspardetienne97", icon: Github },
  { label: "LinkedIn", href: "https://www.linkedin.com/in/gaspardetienne", icon: Linkedin },
  // Fill in and uncomment to show them:
  // { label: "Instagram", href: "https://www.instagram.com/<handle>", icon: Instagram },
  // { label: "YouTube", href: "https://www.youtube.com/@<handle>", icon: Youtube },
  // { label: "Email", href: "mailto:<address>", icon: Mail },
];

/**
 * Site navigation. Big apps such as Woodshed and Narrator are reached from Projects.
 * Labels are getters, so they read in the visitor's language wherever they're used.
 */
export const nav = [
  {
    href: "/",
    get label() {
      return m.nav_home();
    },
  },
  {
    href: "/about",
    get label() {
      return m.nav_about();
    },
  },
  {
    href: "/studio",
    get label() {
      return m.nav_studio();
    },
  },
  {
    href: "/blog",
    get label() {
      return m.nav_blog();
    },
  },
] as const;

/**
 * Route apps that take the whole screen with their own look, outside the site
 * chrome. Woodshed (/music) joins them from its own branch, which hides the chrome
 * in the root layout and adds its own way home.
 */
export const fullscreenApps = ["/pdf"] as const;

export const isFullscreenApp = (path: string) =>
  fullscreenApps.some((app) => path === app || path.startsWith(`${app}/`));
