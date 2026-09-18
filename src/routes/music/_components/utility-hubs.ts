import type { Icon as IconType } from "lucide-svelte";
import CircleHelp from "lucide-svelte/icons/circle-help";
import Gauge from "lucide-svelte/icons/gauge";
import Plug from "lucide-svelte/icons/plug";
import Settings from "lucide-svelte/icons/settings";

export interface UtilityHub {
  label: string;
  href: string;
  icon: typeof IconType;
}

/**
 * The four utility hubs: full links on the desktop rail (`MusicNavigation`),
 * a phone-only "More" menu (`MusicTopBar`, since the bottom tab bar only has
 * room for the four primary hubs). One source so the two surfaces can't drift
 * apart on label, href, or icon.
 */
export const UTILITY_HUBS: UtilityHub[] = [
  { label: "Connect", href: "/music/connect", icon: Plug },
  { label: "Tuner", href: "/music/tuner", icon: Gauge },
  { label: "Settings", href: "/music/settings", icon: Settings },
  { label: "Guide", href: "/music/guide", icon: CircleHelp },
];
