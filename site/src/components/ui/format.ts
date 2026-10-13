const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const monthFmt = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

/** Dates are stored as YYYY-MM-DD; format them without timezone drift. */
export function formatDate(d: string | null | undefined) {
  if (!d) return "";
  return dateFmt.format(new Date(`${d}T00:00:00Z`));
}

export function formatMonth(d: string | null | undefined) {
  if (!d) return "";
  return monthFmt.format(new Date(`${d}T00:00:00Z`));
}

export function formatRange(a: string | null | undefined, b: string | null | undefined) {
  if (!a && !b) return "";
  if (a && !b) return formatDate(a);
  if (!a && b) return `until ${formatDate(b)}`;
  if (a === b) return formatDate(a);
  const da = new Date(`${a}T00:00:00Z`);
  const db = new Date(`${b}T00:00:00Z`);
  if (da.getUTCFullYear() === db.getUTCFullYear()) {
    const short = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${short.format(da)} – ${dateFmt.format(db)}`;
  }
  return `${formatDate(a)} – ${formatDate(b)}`;
}

export function nightsBetween(a: string | null, b: string | null) {
  if (!a || !b) return null;
  return Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export function excerpt(text: string | null | undefined, max = 180) {
  if (!text) return "";
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s\S*$/, "")}…` : t;
}

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
