const TZ = "Asia/Bangkok";

/** YYYY-MM-DD ตามเวลาไทย (เลื่อนได้ด้วย offsetDays) */
export function thaiDate(offsetDays = 0, from = new Date()) {
  const d = new Date(from.getTime() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** แสดงวันแบบไทย เช่น "ศ. 19 ก.ย." */
export function thaiDateLabel(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!, 12));
  return new Intl.DateTimeFormat("th-TH", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(date);
}

export function thaiHour(from = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", hour12: false }).format(from));
}
