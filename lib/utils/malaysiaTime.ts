function malaysiaParts(date: Date): Intl.DateTimeFormatPart[] {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  }).formatToParts(date);
}

export function getMalaysiaDateTimeParts(date: Date = new Date()): Intl.DateTimeFormatPart[] {
  return malaysiaParts(date);
}

export function getMalaysiaValue(date: Date, type: string): string {
  return malaysiaParts(date).find((part) => part.type === type)?.value || "00";
}

export function getMalaysiaDate(date: Date = new Date()): string {
  const parts = malaysiaParts(date);
  const v = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${v("year")}-${v("month")}-${v("day")}`;
}

export function getMalaysiaTime(date: Date = new Date()): string {
  const parts = malaysiaParts(date);
  const v = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${v("hour")}:${v("minute")}`;
}

export function getMalaysiaISOString(date: Date = new Date()): string {
  const parts = malaysiaParts(date);
  const v = (t: string) => parts.find((p) => p.type === t)?.value || "00";
  return `${v("year")}-${v("month")}-${v("day")}T${v("hour")}:${v("minute")}:${v("second")}+08:00`;
}

export function getMalaysiaDateTimeContext(date: Date = new Date()): string {
  const iso = getMalaysiaISOString(date);
  return `Current Malaysia date/time: ${iso}. Timezone: Asia/Kuala_Lumpur (UTC+08:00).`;
}
