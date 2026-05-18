import { TransactionData } from "@/lib/models/Transaction";
import { parseText } from "@/lib/groq";

function tryExtractJson(raw: string): TransactionData | null {
  const stripped = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(stripped) as TransactionData;
  } catch {
    // try to find a JSON object anywhere in the string
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]) as TransactionData;
      } catch {
        return null;
      }
    }
    return null;
  }
}

export class TransactionParser {
  private previousData: string | null = null;

  reset() {
    this.previousData = null;
  }

  async parse(rawText: string): Promise<{
    data: TransactionData | null;
    rawJson: string;
  }> {
    const jsonStr = await parseText(rawText, this.previousData ?? undefined);
    this.previousData = jsonStr;

    const data = tryExtractJson(jsonStr);
    return { data, rawJson: jsonStr };
  }
}
