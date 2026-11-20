// Day and month names for the hubs' calendars and dates, in the visitor's language. Intl has no
// Haitian Creole, so in Creole the names come from messages and times use the Haitian French clock.
import { intlLocale } from "@repo/i18n/format";
import { m } from "@repo/i18n/messages.js";
import { getLocale } from "@repo/i18n/runtime.js";

const creole = () => getLocale() === "ht";
const utcDay = (day: string) => new Date(`${day}T00:00:00Z`);
const mondayFirst = (d: Date) => (d.getUTCDay() + 6) % 7;
const month = (i: number) => m.music_hubs_month_names().split(" ")[i];

/** "M", "T"…: the weekday letter of a day key ("2024-09-16"), Monday first. */
export const weekdayLetter = (day: string) =>
  m.music_hubs_weekday_letters().split(" ")[mondayFirst(utcDay(day))];

/** "Monday": the weekday of a day key ("2024-09-16"). */
export const weekdayName = (day: string) =>
  m.music_hubs_weekday_names().split(" ")[mondayFirst(utcDay(day))];

/** "Sep 16": a day and month. `utc` reads the date in UTC (for day keys). */
export function monthDay(date: Date, utc = false) {
  if (creole()) {
    const day = utc ? date.getUTCDate() : date.getDate();
    return `${day} ${month(utc ? date.getUTCMonth() : date.getMonth())}`;
  }
  return date.toLocaleDateString(intlLocale(), {
    month: "short",
    day: "numeric",
    ...(utc ? { timeZone: "UTC" } : {}),
  });
}

/** "Monday, September 16": a day key's weekday, day and month. */
export function longDay(day: string) {
  const d = utcDay(day);
  if (creole()) return `${weekdayName(day)} ${d.getUTCDate()} ${month(d.getUTCMonth())}`;
  return d.toLocaleDateString(intlLocale(), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

/** "3:04 PM": a time of day. */
export const timeOfDay = (date: Date) =>
  date.toLocaleTimeString(creole() ? "fr-HT" : intlLocale(), {
    hour: "numeric",
    minute: "2-digit",
  });

/** "Sep 16, 3:04 PM": a day, month and time. */
export function monthDayTime(date: Date) {
  if (creole()) return `${monthDay(date)}, ${timeOfDay(date)}`;
  return date.toLocaleString(intlLocale(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "Mon, Sep 16, 3:04 PM": a short weekday, day, month and time. */
export function weekdayDateTime(date: Date) {
  if (creole()) {
    const day = m.music_hubs_weekday_short().split(" ")[(date.getDay() + 6) % 7];
    return `${day} ${monthDay(date)}, ${timeOfDay(date)}`;
  }
  return date.toLocaleString(intlLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}
