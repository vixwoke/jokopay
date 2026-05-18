export interface TransactionItem {
  name: string;
  amount: number;
  quantity: number;
  category: string | null;
}

export interface TransactionData {
  type: "expense" | "income";
  store: string | null;
  payment_method: string | null;
  total: number | null;
  notes: string | null;
  date: string | null;
  time?: string | null;
  items: TransactionItem[];
  missing_fields: string[];
  error: string | null;
}

export type InputSource = "text" | "voice" | "image";
