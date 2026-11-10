export function santoDomingoDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((type) => parts.find((part) => part.type === type)!.value)
    .join("-");
}

export function daysUntil(date: string | null, now = new Date()) {
  if (!date) return null;
  return Math.round(
    (Date.parse(date + "T00:00:00Z") - Date.parse(santoDomingoDate(now) + "T00:00:00Z")) / 86400000,
  );
}
