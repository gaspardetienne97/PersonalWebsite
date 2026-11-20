// Dates, numbers and lists in the visitor's language. Use these rather than
// calling `Intl` with the bare locale: the Spanish here is Latin American and the
// French is Haitian, and most `Intl` data has no Haitian Creole at all.

import { getLocale } from "../paraglide/runtime.js";

type DateStyle = Intl.DateTimeFormatOptions["dateStyle"];

const CREOLE_MONTHS = [
  "janvye",
  "fevriye",
  "mas",
  "avril",
  "me",
  "jen",
  "jiyè",
  "out",
  "septanm",
  "oktòb",
  "novanm",
  "desanm",
];

/** Plain "es" and "fr" would mean Spain and France. */
const INTL_LOCALES: Record<string, string> = { es: "es-419", fr: "fr-HT" };

/** The tag to hand `Intl` for a site locale. */
export function intlLocale(locale: string = getLocale()) {
  return INTL_LOCALES[locale] ?? locale;
}

/** A date in the visitor's language. Strings are read as local dates ("2024-9-16"). */
export function formatDate(
  date: string | Date,
  dateStyle: DateStyle = "medium",
  locale: string = getLocale(),
) {
  // Safari is mad about dashes in the date
  const value = typeof date === "string" ? new Date(date.replaceAll("-", "/")) : date;
  if (locale === "ht") {
    if (dateStyle === "short")
      return `${value.getDate()}/${value.getMonth() + 1}/${value.getFullYear()}`;
    return `${value.getDate()} ${CREOLE_MONTHS[value.getMonth()]} ${value.getFullYear()}`;
  }
  return new Intl.DateTimeFormat(intlLocale(locale), { dateStyle }).format(value);
}

/** A number in the visitor's language. */
export function formatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale: string = getLocale(),
) {
  return new Intl.NumberFormat(intlLocale(locale), options).format(value);
}

/** "a, b and c" (or "a, b or c") in the visitor's language. */
export function formatList(
  items: string[],
  type: "conjunction" | "disjunction" = "conjunction",
  locale: string = getLocale(),
) {
  if (locale === "ht") {
    const word = type === "conjunction" ? "ak" : "oswa";
    return items.length < 2
      ? items.join("")
      : `${items.slice(0, -1).join(", ")} ${word} ${items[items.length - 1]}`;
  }
  // British English lists leave out the serial comma, as the app's English does.
  return new Intl.ListFormat(locale === "en" ? "en-GB" : intlLocale(locale), { type }).format(
    items,
  );
}
