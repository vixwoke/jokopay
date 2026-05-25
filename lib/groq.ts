import { getMalaysiaDateTimeContext as _getMalaysiaDateTimeContext } from "@/lib/utils/malaysiaTime";

function getMalaysiaDateTimeContext(): string {
  return _getMalaysiaDateTimeContext();
}

const SYSTEM_PROMPT = `You are JokoPay, a financial transaction parser for Malaysia. 
Your role is to extract structured data from user input.

OUTPUT LANGUAGE: All text values (store, notes, item names, categories) must be in English only.

RULES:
1. Currency is always Malaysian Ringgit (MYR). "25" means RM25. 
   Never use IDR or any other currency.
2. Supported payment methods: Touch 'n Go eWallet, GrabPay, ShopeePay, 
   Boost, BigPay, MAE, GoPayz, Fave, Lazada Wallet, Setel, DuitNow, 
   FPX, MyDebit, cash, plus Malaysian banks (Maybank, CIMB, Public Bank, 
   RHB, Hong Leong, AmBank, Bank Islam, Bank Rakyat, OCBC, UOB, HSBC, 
   Standard Chartered, Alliance, Affin, Bank Muamalat, MBSB, KFH).
3. If user mentions an Indonesian payment (GoPay, OVO, Dana, ShopeePay 
   Indonesia), respond with: {"error": "Only Malaysian payment methods are supported."}
4. Accept input in English, Bahasa Malaysia, or Bahasa Indonesia. Understand 
   Malay words (beli=buy, bayar=pay, guna=use, gaji=salary, duit=money, kedai=store) 
   and Indonesian words (beli=buy, bayar=pay, pakai=use, uang=money, warung=store).
   But always output text in English.
5. Extract transaction date and time when mentioned. Use Malaysia time
   (Asia/Kuala_Lumpur, UTC+08:00) for relative phrases such as today,
   yesterday, this morning, last night, and tomorrow.
6. The "date" field must be a full ISO-8601 timestamp string with a timezone
   offset, for example "2026-05-19T14:30:00+08:00".
7. The "time" field must be "HH:mm" in 24-hour Malaysia time when the user
   gave or implied a time. If date is known but time is not mentioned, use
   the current Malaysia time. If neither date nor time is mentioned, set both
   "date" and "time" to null.
8. Do not add "date" or "time" to missing_fields. They are optional and the
   app will default them if the user does not mention them.

Extract this JSON (no markdown, no explanation, only valid JSON):
{
  "type": "expense" | "income",
    "store": string | null, // for expense: store/merchant name; for income: income source name (e.g. "Monthly Salary", "Freelance")
    "payment_method": string | null,
  "total": number | null,
  "notes": string | null,
  "date": string | null,
  "time": string | null,
  "items": [{ "name": string, "amount": number, "quantity": number, "category": string | null }],
  "missing_fields": ["list of field names the user didn't provide"],
  "error": string | null
}`;

async function apiChat(
  messages: { role: string; content: string }[],
  options?: { temperature?: number; max_tokens?: number; top_p?: number }
): Promise<string> {
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      temperature: options?.temperature ?? 0.1,
      max_tokens: options?.max_tokens ?? 1024,
      top_p: options?.top_p ?? 1,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Groq API request failed");
  return data.content || "";
}

async function groqParse(userText: string, previousData?: string): Promise<string> {
  const dateTimeContext = getMalaysiaDateTimeContext();
  const messages: { role: "system" | "user"; content: string }[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  if (previousData) {
    messages.push({
      role: "user",
      content: `${dateTimeContext}\nPrevious partial data: ${previousData}\nUser just said: "${userText}"\nProduce updated JSON merging both. Copy the "date" and "time" fields from previous data verbatim. Do NOT change them unless the user explicitly corrects them.`,
    });
  } else {
    messages.push({ role: "user", content: `${dateTimeContext}\nUser text: "${userText}"` });
  }

  return apiChat(messages);
}

function stripMarkdown(raw: string): string {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  return cleaned;
}

export async function parseText(
  userText: string,
  previousData?: string
): Promise<string> {
  const raw = await groqParse(userText, previousData);
  return stripMarkdown(raw);
}

export async function speechToText(audioBlob: Blob): Promise<string> {
  const ext = audioBlob.type.includes("mp4") ? "m4a" : "webm";
  const file = new File([audioBlob], `audio.${ext}`, { type: audioBlob.type });
  const formData = new FormData();
  formData.append("audio", file);
  const res = await fetch("/api/groq", { method: "POST", body: formData });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Groq API request failed");
  return data.text || "";
}

export async function ocrImage(imageBase64: string): Promise<string> {
  const res = await fetch("/api/groq", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image: imageBase64,
      messages: [{ role: "user", content: "Extract all text from this receipt/image. List every item, amount, store name, total, and payment method if visible. Output in English only. Return as plain text only." }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Groq API request failed");
  return data.content || "";
}

export async function normalizeEditInput(
  field: string,
  currentContext: string,
  rawInput: string
): Promise<{ normalized: string; changed: boolean }> {
  const fieldInstructions: Record<string, string> = {
    store: "output the store/merchant name (e.g. \"i went to 7 eleven\" → \"7-Eleven\")",
    payment_method: "output the exact Malaysian payment method. Common patterns: 'maybank'/'mb' → 'Maybank', 'cimb' → 'CIMB', 'tng'/'t and g'/'touch and go' → 'Touch N\\' Go eWallet', 'grab'/'grabs'/'grabpay' → 'GrabPay', 'cash' → 'Cash', 'duitnow' → 'DuitNow', 'fpx' → 'FPX', 'boost' → 'Boost', 'shopeepay' → 'ShopeePay', 'public bank'/'pbb' → 'Public Bank', 'rhb' → 'RHB'",
    notes: "output the notes text cleaned up but as-is in meaning",
    item_name: "output the item name corrected for spelling and capitalization (e.g. \"cofee\" → \"Coffee\", \"nasi lemak\" → \"Nasi Lemak\")",
    item_category: "output the item category corrected for spelling and proper capitalization. Common categories: 'food'/'makanan' → 'Food', 'beverage'/'minuman' → 'Beverage', 'groceries'/'sembako' → 'Groceries', 'transport'/'pengangkutan' → 'Transport', 'utilities'/'bil' → 'Utilities', 'entertainment'/'hiburan' → 'Entertainment', 'health'/'kesihatan' → 'Health', 'education' → 'Education', 'shopping'/'belanja' → 'Shopping', 'salary'/'gaji' → 'Salary', 'freelance' → 'Freelance', 'investment' → 'Investment', 'other'/'lain' → 'Other'",
  };

  const instruction = fieldInstructions[field] || "output the normalized value";

  const prompt = `You are normalizing a single field value for a Malaysia finance tracker.

Current transaction context: ${currentContext}
Field to update: "${field}"
Raw user input: "${rawInput}"

Extract ONLY the normalized value for the "${field}" field from the raw input.
- ${instruction}
- If field is "type": output "expense" or "income"
- If field is "total" or "item_amount": output just the number without RM or currency
- If field is "item_qty": output just the integer quantity

Output ONLY the normalized value, no explanation, no JSON wrapping, no markdown.`;

  const content = await apiChat(
    [
      { role: "system", content: "You normalize Malaysia finance transaction fields. Output only the normalized value, no extra text." },
      { role: "user", content: prompt },
    ],
    { max_tokens: 256 }
  );

  const normalized = (content || rawInput).trim();
  const changed = normalized.toLowerCase() !== rawInput.toLowerCase().trim();
  return { normalized, changed };
}

export async function normalizeItemVoice(
  currentContext: string,
  currentName: string,
  currentQty: number,
  currentAmount: number,
  rawInput: string
): Promise<{ name: string; qty: number; amount: number }> {
  const prompt = `You are extracting item details for a Malaysia finance tracker.

Current transaction context: ${currentContext}
Current item: name="${currentName}", qty=${currentQty}, amount=RM${currentAmount.toFixed(2)}
User said: "${rawInput}"

Extract the item name, quantity, and amount from what the user said.
- If the user renames the item, capitalize properly (e.g. "nasi lemak" → "Nasi Lemak").
- Quantity: output as integer number only (e.g. 2 not "two").
- Amount: output as number without RM (e.g. 12.50).
- If a field is not mentioned in the user's input, output the current value unchanged.
- If the user corrects a field, output the corrected value.

Output ONLY valid JSON in this exact format, no other text:
{"name": "...", "qty": 0, "amount": 0}`;

  const content = await apiChat(
    [
      { role: "system", content: "You extract item name, quantity, and amount from voice input for a Malaysia finance tracker. Output only JSON." },
      { role: "user", content: prompt },
    ],
    { max_tokens: 256 }
  );

  try {
    const parsed = JSON.parse(content);
    return {
      name: typeof parsed.name === "string" ? parsed.name : currentName,
      qty: typeof parsed.qty === "number" ? Math.max(1, Math.round(parsed.qty)) : currentQty,
      amount: typeof parsed.amount === "number" ? parsed.amount : currentAmount,
    };
  } catch {
    return { name: rawInput, qty: currentQty, amount: currentAmount };
  }
}