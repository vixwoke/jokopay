import { supabase } from "@/lib/supabase";
import { TransactionData, InputSource } from "@/lib/models/Transaction";

function getUserId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("jokopay_user_id");
}

export class TransactionManager {
  formatReceipt(data: TransactionData): string {
    const lines: string[] = [];
    lines.push("🧾 JOKO RECEIPT");
    lines.push("─".repeat(30));
    if (data.store) lines.push(`Store        ${data.store}`);
    lines.push(`Type         ${data.type}`);
    if (data.payment_method) lines.push(`Payment      ${data.payment_method}`);
    if (data.items.length > 0) {
      lines.push("─".repeat(30));
      for (const item of data.items) {
        lines.push(
          `${item.name.padEnd(15)} ${item.quantity} × ${Number(item.amount).toLocaleString("en")}`
        );
      }
    }
    if (data.notes) {
      lines.push("─".repeat(30));
      lines.push(`Notes: ${data.notes}`);
    }
    lines.push("─".repeat(30));
    lines.push(
      `TOTAL        RM ${Number(data.total).toLocaleString("en", { minimumFractionDigits: 2 })}`
    );
    lines.push("─".repeat(30));
    return lines.join("\n");
  }

  async save(
    data: TransactionData,
    rawText: string,
    source: InputSource
  ): Promise<boolean> {
    const userId = getUserId();
    if (!userId) return false;

    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        type: data.type,
        store: data.store,
        payment_method: data.payment_method,
        total: data.total,
        notes: data.notes,
        date: data.date || new Date().toISOString(),
        raw_text: rawText,
        source,
      })
      .select("id")
      .single();

    if (txError || !transaction) {
      console.error("Failed to save transaction:", txError);
      return false;
    }

    for (const item of data.items) {
      const { error: itemError } = await supabase
        .from("transaction_items")
        .insert({
          transaction_id: transaction.id,
          name: item.name,
          amount: item.amount,
          quantity: item.quantity,
          category: item.category,
          created_at: data.date || new Date().toISOString(),
        });

      if (itemError) {
        console.error("Failed to save transaction item:", itemError);
      }
    }

    const { data: user } = await supabase
      .from("users")
      .select("balance")
      .eq("id", userId)
      .single();

    if (user) {
      const delta = data.type === "expense" ? -Number(data.total) : Number(data.total);
      const newBalance = Number(user.balance) + delta;
      await supabase.from("users").update({ balance: newBalance }).eq("id", userId);
    }

    return true;
  }
}
