"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

interface TransactionItem {
  id: string;
  name: string;
  amount: number;
  quantity: number;
  category: string | null;
}

interface Transaction {
  id: string;
  date: string;
  type: "expense" | "income";
  store: string | null;
  payment_method: string | null;
  total: number;
  notes: string | null;
  created_at: string;
  items: TransactionItem[];
}

interface PreviewItem {
  name: string;
  amount: number;
  quantity: number;
}

interface PreviewGroup {
  date: string;
  type: "expense" | "income";
  store: string | null;
  payment: string | null;
  total: number;
  notes: string | null;
  items: PreviewItem[];
}

const PAGE_SIZES = [10, 20, 50, 100, 1000] as const;

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TransactionsPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [totalCount, setTotalCount] = useState(0);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewData, setPreviewData] = useState<PreviewGroup[] | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; action?: "delete" | "confirm"; onConfirm: () => void } | null>(null);

  function handleOpenSettings() {
    setSidebarOpen(false);
  }

  function handleSelectOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectAll() {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  }

  async function handleDeleteSelected() {
    if (selectedIds.size === 0) return;
    setConfirmDialog({
      message: `Delete ${selectedIds.size} transaction${selectedIds.size !== 1 ? "s" : ""}?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const userId = localStorage.getItem("jokopay_user_id");
        if (!userId) { return; }

        setDeleting(true);

        let deleted = 0;
        let errors = 0;

        for (const id of selectedIds) {
          const tx = transactions.find((t) => t.id === id);
          if (!tx) { errors++; continue; }

          const { error: itemErr } = await supabase
            .from("transaction_items")
            .delete()
            .eq("transaction_id", id);
          if (itemErr) { errors++; continue; }

          const { error: txErr } = await supabase
            .from("transactions")
            .delete()
            .eq("id", id)
            .eq("user_id", userId);
          if (txErr) { errors++; continue; }

          const delta = tx.type === "expense" ? Number(tx.total) : -Number(tx.total);
          const { data: user } = await supabase
            .from("users")
            .select("balance")
            .eq("id", userId)
            .single();
          if (user) {
            await supabase
              .from("users")
              .update({ balance: Number(user.balance) + delta })
              .eq("id", userId);
          }

          deleted++;
        }

        setDeleting(false);
        setSelectedIds(new Set());
        setRefreshKey((k) => k + 1);
      },
    });
  }

  async function handleDeleteTransaction(id: string) {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    setConfirmDialog({
      message: `Delete this transaction?`,
      onConfirm: async () => {
        setConfirmDialog(null);
        const userId = localStorage.getItem("jokopay_user_id");
        if (!userId) return;

        await supabase.from("transaction_items").delete().eq("transaction_id", id);
        await supabase.from("transactions").delete().eq("id", id).eq("user_id", userId);

        const delta = tx.type === "expense" ? Number(tx.total) : -Number(tx.total);
        const { data: user } = await supabase.from("users").select("balance").eq("id", userId).single();
        if (user) {
          await supabase.from("users").update({ balance: Number(user.balance) + delta }).eq("id", userId);
        }

        setRefreshKey((k) => k + 1);
      },
    });
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  useEffect(() => {
    async function fetchTransactions() {
      const userId = localStorage.getItem("jokopay_user_id");
      if (!userId) { setLoading(false); return; }

      setSelectedIds(new Set());
      setLoading(true);
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      const { data: txs, error, count } = await supabase
        .from("transactions")
        .select("id, date, type, store, payment_method, total, notes, created_at", { count: "exact" })
        .eq("user_id", userId)
        .order("date", { ascending: false })
        .range(from, to);

      if (error) { console.error(error); setLoading(false); return; }

      if (count !== null) setTotalCount(count);

      if (txs && txs.length > 0) {
        const txIds = txs.map((t) => t.id);
        const { data: items } = await supabase
          .from("transaction_items")
          .select("id, transaction_id, name, amount, quantity, category")
          .in("transaction_id", txIds);

        const itemsByTxId: Record<string, TransactionItem[]> = {};
        if (items) {
          for (const item of items) {
            if (!itemsByTxId[item.transaction_id]) itemsByTxId[item.transaction_id] = [];
            itemsByTxId[item.transaction_id].push(item);
          }
        }

        setTransactions(
          txs.map((t) => ({
            ...t,
            total: Number(t.total),
            items: itemsByTxId[t.id] || [],
          }))
        );
      } else {
        setTransactions([]);
      }

      setLoading(false);
    }

    fetchTransactions();
  }, [page, pageSize, refreshKey]);

  function handlePageSizeChange(newSize: number) {
    if (newSize === 1000) {
      setConfirmDialog({
        message: "Loading 1000 rows may cause performance issues. Continue?",
        action: "confirm",
        onConfirm: () => {
          setConfirmDialog(null);
          setPageSize(newSize);
          setPage(1);
        },
      });
      return;
    }
    setPageSize(newSize);
    setPage(1);
  }

  function parseCSV(file: File) {
    setImportMsg(null);
    setCsvFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) {
        setImportMsg({ ok: false, text: "CSV must have a header row and at least one data row." });
        return;
      }

      const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
      const groupIdx = headers.indexOf("group");
      const dateIdx = headers.indexOf("date");
      const timeIdx = headers.indexOf("time");
      const typeIdx = headers.indexOf("type");
      const storeIdx = headers.indexOf("store");
      const paymentIdx = headers.indexOf("payment_method");
      const totalIdx = headers.indexOf("total");
      const notesIdx = headers.indexOf("notes");
      const itemNameIdx = headers.indexOf("item_name");
      const itemAmtIdx = headers.indexOf("item_amount");
      const itemQtyIdx = headers.indexOf("item_quantity");

      if (typeIdx === -1 || totalIdx === -1) {
        setImportMsg({ ok: false, text: 'CSV must have at least "type" and "total" columns.' });
        return;
      }

      const groups = new Map<string, PreviewGroup>();

      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(",").map((c) => c.trim());
        const type = cols[typeIdx]?.toLowerCase();
        if (type !== "expense" && type !== "income") continue;

        const total = parseFloat(cols[totalIdx]);
        if (isNaN(total)) continue;

        const dateRaw = dateIdx !== -1 && cols[dateIdx] ? cols[dateIdx] : new Date().toISOString().split("T")[0];
        const timeRaw = timeIdx !== -1 && cols[timeIdx] ? cols[timeIdx] : "00:00";
        const date = `${dateRaw}T${timeRaw}:00.000Z`;
        const store = storeIdx !== -1 ? cols[storeIdx] || null : null;
        const payment = paymentIdx !== -1 ? cols[paymentIdx] || null : null;
        const notes = notesIdx !== -1 ? cols[notesIdx] || null : null;

        const itemName = itemNameIdx !== -1 ? cols[itemNameIdx] || null : null;
        const itemAmount = itemAmtIdx !== -1 ? parseFloat(cols[itemAmtIdx]) || total : total;
        const itemQty = itemQtyIdx !== -1 ? parseInt(cols[itemQtyIdx], 10) || 1 : 1;

        const key = groupIdx !== -1 && cols[groupIdx] ? cols[groupIdx] : `__row_${i}`;

        if (!groups.has(key)) {
          groups.set(key, { date, type, store, payment, total, notes, items: [] });
        }
        const group = groups.get(key)!;

        if (itemName) {
          group.items.push({ name: itemName, amount: itemAmount, quantity: itemQty });
        }
      }

      if (groups.size === 0) {
        setImportMsg({ ok: false, text: "No valid transactions found in the CSV." });
        return;
      }

      setPreviewData(Array.from(groups.values()));
    };
    reader.readAsText(file);
  }

  async function confirmImport() {
    if (!previewData || previewData.length === 0) return;

    const userId = localStorage.getItem("jokopay_user_id");
    if (!userId) return;

    setImporting(true);
    setImportMsg(null);

    let imported = 0;
    let errors = 0;

    for (const group of previewData) {
      const { data: tx, error: txErr } = await supabase
        .from("transactions")
        .insert({
          user_id: userId,
          date: group.date,
          type: group.type,
          store: group.store,
          payment_method: group.payment,
          total: group.total,
          notes: group.notes,
          raw_text: `imported ${group.date}`,
          source: "text",
        })
        .select("id")
        .single();

      if (txErr || !tx) { errors++; continue; }

      for (const item of group.items) {
        await supabase.from("transaction_items").insert({
          transaction_id: tx.id,
          name: item.name,
          amount: item.amount,
          quantity: item.quantity,
        });
      }

      const delta = group.type === "expense" ? -group.total : group.total;
      const { data: user } = await supabase
        .from("users")
        .select("balance")
        .eq("id", userId)
        .single();
      if (user) {
        await supabase
          .from("users")
          .update({ balance: Number(user.balance) + delta })
          .eq("id", userId);
      }

      imported++;
    }

    setImporting(false);

    if (errors > 0 && imported === 0) {
      setImportMsg({ ok: false, text: `All ${errors} transaction${errors !== 1 ? "s" : ""} failed to import.` });
    } else {
      setImportMsg({ ok: true, text: `Imported ${imported} transaction${imported !== 1 ? "s" : ""}${errors > 0 ? ` (${errors} skipped).` : "."}` });
      setPreviewData(null);
      setCsvFileName("");
      setPage(1);
    }
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".csv")) {
      parseCSV(file);
    } else {
      setImportMsg({ ok: false, text: "Please drop a .csv file." });
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseCSV(file);
  }

  function handleResetImport() {
    setPreviewData(null);
    setCsvFileName("");
    setImportMsg(null);
  }

  function handleDownloadSample() {
    const csv = `group,date,time,type,store,payment_method,total,notes,item_name,item_amount,item_quantity
1,2026-05-19,14:30,expense,Giant,TNG,150.50,weekly groceries,Milk,12.00,2
1,2026-05-19,14:30,expense,Giant,TNG,150.50,weekly groceries,Eggs,8.50,1
2,2026-05-20,09:00,income,Salary,,5000.00,May salary,,,`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jokopay_sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-x-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={handleOpenSettings}
      />

      <Navbar onMenuClick={() => setSidebarOpen(true)} />

      <main className="flex min-w-0 flex-1 items-center justify-center px-6 pb-8 pt-[4.5rem] lg:hidden">
        <div className="max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-[#1f2c33]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-11 w-11 text-zinc-400"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75h6.75L19.5 9v9.75a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V5.25a1.5 1.5 0 0 1 1.5-1.5h1.5Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.25 3.75V9h5.25" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25h.01M15 14.25h.01M9.75 17.25c1.5-1 3-1 4.5 0" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-800 dark:text-zinc-100">
            Aw, Snap!
          </h1>
          <p className="mt-3 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
            Historical transaction only available on desktop version. We&apos;re sorry for that.
          </p>
        </div>
      </main>

      <div className="hidden flex-1 flex-col overflow-y-auto px-4 pb-4 pt-[4.5rem] lg:flex">
        <div className="flex items-center justify-between px-6 pt-6 pb-4">
          <h1 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
            Transactions
          </h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setImportDialogOpen(true)}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 16.5a.75.75 0 01-.75-.75V3.81L9.03 6.03a.75.75 0 01-1.06-1.06l3.75-3.75a.75.75 0 011.06 0l3.75 3.75a.75.75 0 01-1.06 1.06L12.75 3.81v11.94c0 .414-.336.75-.75.75z" />
                <path d="M3.75 18a.75.75 0 01.75.75V21h15v-2.25a.75.75 0 011.5 0v3a.75.75 0 01-.75.75H3a.75.75 0 01-.75-.75v-3a.75.75 0 01.75-.75z" />
              </svg>
              Import CSV
            </button>
            <button
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path d="M12 1.5a.75.75 0 01.75.75v7.19l2.72-2.72a.75.75 0 111.06 1.06l-4 4a.75.75 0 01-1.06 0l-4-4a.75.75 0 011.06-1.06l2.72 2.72V2.25A.75.75 0 0112 1.5z" />
                <path d="M3.75 15.75a.75.75 0 01.75.75V21h15v-4.5a.75.75 0 011.5 0v5.25a.75.75 0 01-.75.75H3a.75.75 0 01-.75-.75V16.5a.75.75 0 01.75-.75z" />
              </svg>
              Export CSV
            </button>
          </div>
        </div>

        <div className="mx-6 mb-4 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Rows per page:</span>
          <div className="flex gap-1">
            {PAGE_SIZES.map((s) => (
              <button
                key={s}
                onClick={() => handlePageSizeChange(s)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  pageSize === s
                    ? "bg-[var(--brand)] text-white"
                    : "border border-zinc-300 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="mx-6 overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-700 dark:bg-[#1f2c33]">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                <th className="w-10 px-2 py-3">
                  <input
                    type="checkbox"
                    checked={transactions.length > 0 && selectedIds.size === transactions.length}
                    onChange={handleSelectAll}
                    className="accent-[var(--brand)]"
                  />
                </th>
                <th className="px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Date</th>
                <th className="px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Type</th>
                <th className="px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Store</th>
                <th className="px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Payment</th>
                <th className="px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Items</th>
                <th className="px-3 py-3 font-semibold text-zinc-500 dark:text-zinc-400">Notes</th>
                <th className="px-3 py-3 text-right font-semibold text-zinc-500 dark:text-zinc-400">Total</th>
                <th className="w-20 px-2 py-3 text-right font-semibold text-zinc-500 dark:text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-zinc-400">
                    Loading...
                  </td>
                </tr>
              ) : transactions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-zinc-400">
                    No transactions found.
                  </td>
                </tr>
              ) : (
                transactions.map((tx) => {
                  const selected = selectedIds.has(tx.id);
                  return (
                    <tr
                      key={tx.id}
                      className={`border-b border-zinc-100 transition dark:border-zinc-800 ${
                        selected
                          ? "bg-blue-50/60 dark:bg-blue-900/15"
                          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                      }`}
                    >
                      <td className="px-2 py-3">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleSelectOne(tx.id)}
                          className="accent-[var(--brand)]"
                        />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-zinc-600 dark:text-zinc-300">
                        {formatDate(tx.date)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            tx.type === "expense"
                              ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                              : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-zinc-700 dark:text-zinc-200">
                        {tx.store || "\u2014"}
                      </td>
                      <td className="px-3 py-3 text-zinc-600 dark:text-zinc-300">
                        {tx.payment_method || "\u2014"}
                      </td>
                      <td className="max-w-[200px] px-3 py-3">
                        {tx.items.length > 0 ? (
                          <ul className="text-xs text-zinc-500 dark:text-zinc-400">
                            {tx.items.map((item, i) => (
                              <li
                                key={item.id}
                                className={`rounded px-1 py-0.5 ${
                                  i % 2 === 0
                                    ? "bg-zinc-50 dark:bg-zinc-800/30"
                                    : "bg-white dark:bg-transparent"
                                }`}
                              >
                                {item.name}
                                {item.quantity > 1 && ` x${item.quantity}`}
                                {" \u2014 "}RM {item.amount.toLocaleString("en", { minimumFractionDigits: 2 })}
                              </li>
                            ))}
                          </ul>
                        ) : tx.type === "income" ? (
                          <span className="text-xs font-medium text-green-600 dark:text-green-400">Income</span>
                        ) : (
                          <span className="text-xs text-zinc-400">\u2014</span>
                        )}
                      </td>
                      <td className="max-w-[150px] truncate px-3 py-3 text-zinc-500 dark:text-zinc-400">
                        {tx.notes || "\u2014"}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-3 text-right font-mono text-sm font-semibold ${
                          tx.type === "expense" ? "text-red-500" : "text-green-500"
                        }`}
                      >
                        {tx.type === "expense" ? "-" : "+"}RM{" "}
                        {tx.total.toLocaleString("en", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {}}
                            className="rounded p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                            title="Edit"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                              <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(tx.id)}
                            className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                            title="Delete"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                              <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.256 1.478l-.209-.035-1.005 13.07a3 3 0 01-2.991 2.77H8.084a3 3 0 01-2.991-2.77L4.087 6.66l-.209.035a.75.75 0 01-.256-1.478A48.567 48.567 0 017.5 4.705v-.227c0-1.564 1.213-2.9 2.816-2.951a52.662 52.662 0 013.369 0c1.603.051 2.815 1.387 2.815 2.951zm-6.136-1.452a51.196 51.196 0 013.273 0C14.39 3.05 15 3.684 15 4.478v.113a49.488 49.488 0 00-6 0v-.113c0-.794.609-1.428 1.364-1.452zm-.355 5.945a.75.75 0 10-1.5.058l.347 9a.75.75 0 101.499-.058l-.346-9zm5.48.058a.75.75 0 10-1.498-.058l-.347 9a.75.75 0 001.5.058l.345-9z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Delete Selected Bar */}
        {selectedIds.size > 0 && (
          <div className="mx-6 mb-2 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2 dark:border-red-900/30 dark:bg-red-900/10">
            <span className="text-sm text-red-600 dark:text-red-400">
              {selectedIds.size} transaction{selectedIds.size !== 1 ? "s" : ""} selected
            </span>
            <button
              onClick={handleDeleteSelected}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {deleting ? "Deleting..." : "Delete Selected"}
            </button>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-xs text-zinc-500">
            Page {page} of {totalPages}
            {totalCount > 0 && (
              <span className="ml-2">({totalCount} total)</span>
            )}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(1)}
              disabled={page <= 1}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              First
            </button>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Prev
            </button>
            <span className="mx-2 text-xs text-zinc-500">{page}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Next
            </button>
            <button
              onClick={() => setPage(totalPages)}
              disabled={page >= totalPages}
              className="rounded-md border border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Last
            </button>
          </div>
        </div>

        {/* Import CSV Dialog */}
        {importDialogOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="dialog-enter mx-4 flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl ring-1 ring-black/5 dark:bg-[#1f2c33] dark:ring-white/10">
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-700">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)]/10">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-[var(--brand)]">
                      <path d="M11.47 1.72a.75.75 0 011.06 0l3 3a.75.75 0 01-1.06 1.06l-1.72-1.72V7.5h-1.5V4.06L9.53 5.78a.75.75 0 01-1.06-1.06l3-3zM11.25 7.5V15a.75.75 0 001.5 0V7.5h3.75a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9a3 3 0 013-3h3.75z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                    {previewData ? "Preview Import" : "Import .CSV File"}
                  </h2>
                </div>
                <button
                  onClick={() => { setImportDialogOpen(false); handleResetImport(); }}
                  className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                    <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="overflow-y-auto px-6 py-4">
                {importing ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-zinc-200 border-t-[var(--brand)]" />
                  </div>
                ) : previewData ? (
                  <>
                    <p className="mb-3 text-sm text-zinc-500 dark:text-zinc-400">
                      <strong>{csvFileName}</strong> — {previewData.length} transaction{previewData.length !== 1 ? "s" : ""} found. Review before importing.
                    </p>

                    <div className="mb-4 overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
                            <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Date</th>
                            <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Type</th>
                            <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Store</th>
                            <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Payment</th>
                            <th className="px-3 py-2 font-semibold text-zinc-500 dark:text-zinc-400">Items</th>
                            <th className="px-3 py-2 text-right font-semibold text-zinc-500 dark:text-zinc-400">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.map((g, idx) => (
                            <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-800">
                              <td className="whitespace-nowrap px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                                {formatDate(g.date)}
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                                  g.type === "expense"
                                    ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
                                }`}>
                                  {g.type}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-xs text-zinc-700 dark:text-zinc-200">
                                {g.store || "\u2014"}
                              </td>
                              <td className="px-3 py-2 text-xs text-zinc-600 dark:text-zinc-300">
                                {g.payment || "\u2014"}
                              </td>
                              <td className="max-w-[180px] px-3 py-2">
                                {g.items.length > 0 ? (
                                  <ul className="list-inside list-disc text-xs text-zinc-500 dark:text-zinc-400">
                                    {g.items.map((item, i) => (
                                      <li key={i}>
                                        {item.name}{item.quantity > 1 && ` x${item.quantity}`}
                                        {" \u2014 "}RM {item.amount.toLocaleString("en", { minimumFractionDigits: 2 })}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-xs text-zinc-400">\u2014</span>
                                )}
                              </td>
                              <td className={`whitespace-nowrap px-3 py-2 text-right text-xs font-semibold ${
                                g.type === "expense" ? "text-red-500" : "text-green-500"
                              }`}>
                                {g.type === "expense" ? "-" : "+"}RM{" "}
                                {g.total.toLocaleString("en", { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
                      You can use a CSV file to bulk import your transactions.
                    </p>

                    <div className="mb-4 flex justify-end">
                      <button
                        onClick={handleDownloadSample}
                        className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M12 1.5a.75.75 0 01.75.75v7.19l2.72-2.72a.75.75 0 111.06 1.06l-4 4a.75.75 0 01-1.06 0l-4-4a.75.75 0 011.06-1.06l2.72 2.72V2.25A.75.75 0 0112 1.5z" />
                          <path d="M3.75 15.75a.75.75 0 01.75.75V21h15v-4.5a.75.75 0 011.5 0v5.25a.75.75 0 01-.75.75H3a.75.75 0 01-.75-.75V16.5a.75.75 0 01.75-.75z" />
                        </svg>
                        Download Sample CSV
                      </button>
                    </div>

                    <div
                      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleFileDrop}
                      onClick={() => document.getElementById("csv-file-input")?.click()}
                      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition ${
                        dragOver
                          ? "border-[var(--brand)] bg-[var(--brand)]/5"
                          : "border-zinc-300 hover:border-zinc-400 dark:border-zinc-600 dark:hover:border-zinc-500"
                      }`}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 h-10 w-10 text-zinc-400">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.345-1.157 4.5 4.5 0 014.065 7.207A3.75 3.75 0 0118 19.5H6.75z" />
                      </svg>
                      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                        Drag and drop .csv file or upload from computer
                      </p>
                    </div>
                    <input
                      id="csv-file-input"
                      type="file"
                      accept=".csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                  </>
                )}

                {importMsg && (
                  <div className={`mt-4 rounded-lg px-4 py-3 text-sm ${
                    importMsg.ok
                      ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  }`}>
                    {importMsg.text}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="flex shrink-0 items-center justify-end gap-2 border-t border-zinc-200 px-6 py-4 dark:border-zinc-700">
                {previewData && !importing && (
                  <>
                    <button
                      onClick={handleResetImport}
                      className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Back
                    </button>
                    <button
                      onClick={confirmImport}
                      className="rounded-lg bg-[var(--brand)] px-4 py-2 text-sm font-medium text-white transition hover:bg-[var(--brand-dark)]"
                    >
                      Confirm Import
                    </button>
                  </>
                )}
                {!previewData && !importing && (
                  <button
                    onClick={() => { setImportDialogOpen(false); handleResetImport(); }}
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                )}
                {importing && (
                  <p className="text-sm text-zinc-400">Importing...</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Confirm Dialog */}
        {confirmDialog && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="dialog-enter mx-4 w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-[#1f2c33] dark:ring-white/10">
              <div className="mb-4 flex flex-col items-center gap-3">
                <div className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  confirmDialog.action === "confirm"
                    ? "bg-[var(--brand)]/10"
                    : "bg-red-50 dark:bg-red-900/20"
                }`}>
                  {confirmDialog.action === "confirm" ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-[var(--brand)]">
                      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 01.67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 11-.671-1.34l.041-.022zM12 9a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 text-red-500">
                      <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
                    </svg>
                  )}
                </div>
                <p className="text-center text-sm leading-relaxed text-zinc-700 dark:text-zinc-200">
                  {confirmDialog.message}
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setConfirmDialog(null)}
                  className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-700 active:scale-[0.97] dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDialog.onConfirm}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition active:scale-[0.97] ${
                    confirmDialog.action === "confirm"
                      ? "bg-[var(--brand)] shadow-sm shadow-[var(--brand)]/20 hover:bg-[var(--brand-dark)]"
                      : "bg-red-500 shadow-sm shadow-red-200 hover:bg-red-600 dark:shadow-red-900/30"
                  }`}
                >
                  {confirmDialog.action === "confirm" ? "Continue" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
