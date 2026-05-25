import { TransactionData } from "@/lib/models/Transaction";
import { parseText } from "@/lib/groq";

type ParsedTransactionData = TransactionData & {
  date?: string | null;
  time?: string | null;
};

import { getMalaysiaDate, getMalaysiaTime } from "@/lib/utils/malaysiaTime";

function malaysiaDateParts(date: Date): { date: string; time: string } {
  return { date: getMalaysiaDate(date), time: getMalaysiaTime(date) };
}

function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || "0");
  const meridiem = match[3]?.toLowerCase();

  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    if (meridiem === "pm" && hour !== 12) hour += 12;
    if (meridiem === "am" && hour === 12) hour = 0;
  } else if (hour > 23) {
    return null;
  }

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function normalizeDateTime(data: ParsedTransactionData): TransactionData {
  const nowMalaysia = malaysiaDateParts(new Date());
  const explicitTime = normalizeTime(data.time);

  if (typeof data.date !== "string" || !data.date.trim()) {
    return {
      ...data,
      date: explicitTime ? `${nowMalaysia.date}T${explicitTime}:00+08:00` : null,
      time: explicitTime,
    };
  }

  const rawDate = data.date.trim();
  const dateOnlyMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})$/);
  const parsedDate = new Date(rawDate);

  if (dateOnlyMatch) {
    const time = explicitTime || nowMalaysia.time;
    return {
      ...data,
      date: `${dateOnlyMatch[1]}T${time}:00+08:00`,
      time,
    };
  }

  if (Number.isNaN(parsedDate.getTime())) {
    return {
      ...data,
      date: null,
      time: explicitTime,
    };
  }

  const malaysia = malaysiaDateParts(parsedDate);
  const time = explicitTime || malaysia.time;
  return {
    ...data,
    date: `${malaysia.date}T${time}:00+08:00`,
    time,
  };
}

export function tryExtractJson(raw: string): TransactionData | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return normalizeDateTime(JSON.parse(stripped) as ParsedTransactionData);
  } catch {
    // try to find a JSON object anywhere in the string
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return normalizeDateTime(JSON.parse(match[0]) as ParsedTransactionData);
      } catch {
        return null;
      }
    }
    return null;
  }
}

export class TransactionParser {
  public previousData: string | null = null;

  reset() {
    this.previousData = null;
  }

  async parse(rawText: string): Promise<{
    data: TransactionData | null;
    rawJson: string;
  }> {
    const jsonStr = await parseText(rawText, this.previousData ?? undefined);
    const data = tryExtractJson(jsonStr);
    const rawJson = data ? JSON.stringify(data) : jsonStr;
    this.previousData = rawJson;

    return { data, rawJson };
  }
}
