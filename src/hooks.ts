import type { Reroute } from "@sveltejs/kit/hooks";
import { deLocalizeUrl } from "@repo/i18n/runtime.js";

export const reroute: Reroute = ({ url }) => deLocalizeUrl(url).pathname;
