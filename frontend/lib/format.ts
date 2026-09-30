/** Dates in the store are ISO strings. These render them the way a reader reads them. */

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const mins = Math.round((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return days === 1 ? "yesterday" : `${days} days ago`;
  return then.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function duration(seconds: number): string {
  if (!seconds) return "0s";
  // Rounded first, so 59.6 seconds reads as a minute rather than as "60s".
  const whole = Math.round(seconds);
  if (whole < 60) return `${whole}s`;
  const mins = Math.floor(whole / 60);
  if (mins < 60) return `${mins}m ${whole % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function compact(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Cuts on a word boundary so a truncated category still reads as a phrase. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.6 ? space : max).trimEnd()}...`;
}

/** A prose list: "Singapore", "Singapore and Malaysia", "Singapore, Malaysia and Australia". */
export function listOf(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The store keeps language tags. A reader wants the language. */
const languages: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  lo: "Lao",
  mn: "Mongolian",
  ms: "Malay",
  ru: "Russian",
  ta: "Tamil",
  th: "Thai",
  zh: "Chinese",
};

export function languageName(tag: string): string {
  return languages[tag] ?? tag.toUpperCase();
}

/** Capitalises the first letter, for a stored value that opens a label or a sentence. */
export function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The store keeps hyphenated codes ("common-law", "in-force"). A reader wants words. */
export function humanize(code: string): string {
  return sentence(code.replace(/[-_]/g, " "));
}

/** How a document's text was recovered, named the way a reader would name it. */
const extractions: Record<string, string> = {
  html: "HTML",
  "pdf-text": "PDF text layer",
  ocr: "OCR",
  plain: "Plain text",
  none: "Nothing",
};

export function extractionName(code: string): string {
  return extractions[code] ?? humanize(code);
}

/** The pillars a run was asked for, as a phrase: "all pillars", "pillar 6", "pillars 6 and 7". */
export function pillarsAsked(pillars: number[] | "all"): string {
  if (pillars === "all") return "all pillars";
  if (pillars.length === 1) return `pillar ${pillars[0]}`;
  return `pillars ${listOf(pillars.map(String))}`;
}
