"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import ChartCard, { ChartDataPoint } from "./ChartCard";

interface RecentTx {
  id: string;
  date: string;
  type: "expense" | "income";
  store: string | null;
  payment_method: string | null;
  total: number | string;
  notes: string | null;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [totalTxCount, setTotalTxCount] = useState(0);
  const [transactionCount, setTransactionCount] = useState(10);
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceData, setBalanceData] = useState<ChartDataPoint[]>([]);
  const [expenseData, setExpenseData] = useState<ChartDataPoint[]>([]);
  const [incomeData, setIncomeData] = useState<ChartDataPoint[]>([]);
  const [recents, setRecents] = useState<RecentTx[]>([]);
  const [chartKey, setChartKey] = useState(0);

  useEffect(() => {
    async function fetchData() {
      const userId = localStorage.getItem("jokopay_user_id");
      if (!userId) return;

      const [balanceResult, txResult, recentResult, countResult] = await Promise.all([
        supabase.from("users").select("balance").eq("id", userId).single(),
        supabase
          .from("transactions")
          .select("id, date, type, store, total")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(transactionCount),
        supabase
          .from("transactions")
          .select("id, date, type, store, payment_method, total, notes")
          .eq("user_id", userId)
          .order("date", { ascending: false })
          .limit(10),
        supabase
          .from("transactions")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId),
      ]);

      const total = countResult.count ?? 0;
      setTotalTxCount(total);
      if (total > 0 && transactionCount > total) {
        setTransactionCount(total);
      }

      if (balanceResult.data) {
        setBalance(Number(balanceResult.data.balance));
      }

      if (txResult.data && txResult.data.length > 0) {
        const txs = [...txResult.data].reverse();
        const currentBalance = Number(balanceResult.data?.balance ?? 0);
        const totalChange = txs.reduce((sum, t) => {
          return sum + (t.type === "income" ? Number(t.total) : -Number(t.total));
        }, 0);
        let running = currentBalance - totalChange;

        const balanceArr: ChartDataPoint[] = [];
        const expenses: ChartDataPoint[] = [];
        const incomes: ChartDataPoint[] = [];

        for (const t of txs) {
          const val = Number(t.total);
          const prev = running;
          running += t.type === "income" ? val : -val;
          const change = running - prev;
          const label = t.store || `${t.type} #${balanceArr.length + 1}`;
          balanceArr.push({ label, balance: running, change });
          if (t.type === "expense") expenses.push({ label, value: val });
          if (t.type === "income") incomes.push({ label, value: val });
        }

        setBalanceData(balanceArr);
        setExpenseData(expenses);
        setIncomeData(incomes);
      } else {
        setBalanceData([]);
        setExpenseData([]);
        setIncomeData([]);
      }

      if (recentResult.data) {
        setRecents(recentResult.data);
      }

      setChartKey((k) => k + 1);
    }

    fetchData();
  }, [transactionCount, refreshKey]);

  function handleManualInput(e: React.ChangeEvent<HTMLInputElement>) {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val)) {
      const max = totalTxCount > 0 ? totalTxCount : 20;
      setTransactionCount(Math.max(2, Math.min(max, val)));
    }
  }

  function adjustCount(delta: number) {
    setTransactionCount((prev) => {
      const max = totalTxCount > 0 ? totalTxCount : 20;
      return Math.max(2, Math.min(max, prev + delta));
    });
  }

  const balanceValues = balanceData.map((d) => d.balance ?? 0);
  const minBalance = balanceValues.length > 0 ? Math.min(...balanceValues) : 0;
  const maxBalance = balanceValues.length > 0 ? Math.max(...balanceValues) : 0;
  const balPad = Math.max(Math.abs(maxBalance - minBalance) * 0.1, 10);
  const balanceDomain: [number, number] = [
    Math.floor(minBalance - balPad),
    Math.ceil(maxBalance + balPad),
  ];

  const expenseValues = expenseData.map((d) => d.value ?? 0);
  const maxExpense = expenseValues.length > 0 ? Math.max(...expenseValues) : 0;
  const expenseDomain: [number, number] = [0, maxExpense * 1.15 || 1];

  const incomeValues = incomeData.map((d) => d.value ?? 0);
  const maxIncome = incomeValues.length > 0 ? Math.max(...incomeValues) : 0;
  const incomeDomain: [number, number] = [0, maxIncome * 1.15 || 1];

  const atMax = totalTxCount > 0 && transactionCount >= totalTxCount;
  const atMin = transactionCount <= 2;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-y-auto overflow-x-hidden border-r border-zinc-200 bg-white dark:border-zinc-700 dark:bg-[#111b21]">
      <div className="px-4 py-4 sm:px-6 sm:py-6">
        {/* Balance Display */}
        <div className="mb-5 rounded-xl border border-zinc-200 bg-gradient-to-br from-[var(--brand)] to-[var(--brand-dark)] p-4 text-white shadow-sm dark:border-zinc-600 sm:mb-6 sm:p-5">
        <p className="text-xs font-medium uppercase tracking-wider opacity-80">Current Balance</p>
        <p className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">
          RM {balance !== null ? Number(balance).toLocaleString("en", { minimumFractionDigits: 2 }) : "---"}
        </p>
      </div>

      {/* Transaction Count Selector */}
      <div className="mb-6">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Transactions to show
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => adjustCount(-100)}
            disabled={atMin}
            className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-zinc-300 px-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-9 sm:flex-none sm:px-0 sm:text-[11px]"
          >
            -100
          </button>
          <button
            onClick={() => adjustCount(-10)}
            disabled={atMin}
            className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-zinc-300 px-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-9 sm:flex-none sm:px-0 sm:text-[11px]"
          >
            -10
          </button>
          <button
            onClick={() => adjustCount(-1)}
            disabled={atMin}
            className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-zinc-300 px-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-9 sm:flex-none sm:px-0 sm:text-[11px]"
          >
            -1
          </button>
          <input
            type="number"
            min={2}
            max={totalTxCount || 20}
            value={transactionCount}
            onChange={handleManualInput}
            className="w-11 shrink-0 rounded-md border border-zinc-300 px-1 py-1.5 text-center text-xs font-bold outline-none focus:border-[var(--brand)] dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white sm:mx-1 sm:w-14 sm:px-2 sm:text-sm"
          />
          <button
            onClick={() => adjustCount(1)}
            disabled={atMax}
            className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-zinc-300 px-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-9 sm:flex-none sm:px-0 sm:text-[11px]"
          >
            +1
          </button>
          <button
            onClick={() => adjustCount(10)}
            disabled={atMax}
            className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-zinc-300 px-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-9 sm:flex-none sm:px-0 sm:text-[11px]"
          >
            +10
          </button>
          <button
            onClick={() => adjustCount(100)}
            disabled={atMax}
            className="flex h-8 min-w-0 flex-1 items-center justify-center rounded-md border border-zinc-300 px-1 text-[10px] font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-30 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800 sm:w-9 sm:flex-none sm:px-0 sm:text-[11px]"
          >
            +100
          </button>
        </div>
        {totalTxCount > 0 && (
          <p className="mt-1 text-xs text-zinc-400">
            {transactionCount} of {totalTxCount} transaction{totalTxCount !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      {/* Charts + Recents side by side */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Charts (left) */}
        <div className="min-w-0 flex-1">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-[#1f2c33]">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Charts
            </h2>
            <div className="flex flex-col gap-4">
              <ChartCard title="Balance" type="area" color="#3b82f6" data={balanceData} dataKey="balance" chartKey={chartKey} domain={balanceDomain} baseValue={balanceDomain[0]} />
              <ChartCard title="Expenses" type="bar" color="#ef4444" data={expenseData} domain={expenseDomain} chartKey={chartKey} />
              <ChartCard title="Income" type="bar" color="#22c55e" data={incomeData} domain={incomeDomain} chartKey={chartKey} />
            </div>
          </div>
        </div>

        {/* Recent Transactions (right) */}
        <div className="w-full shrink-0 lg:w-80">
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-[#1f2c33]">
            <h2 className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Recent Transactions
            </h2>
            <div className="space-y-2">
              {recents.length === 0 ? (
                <p className="text-xs text-zinc-400">No transactions yet.</p>
              ) : (
                recents.map((tx) => (
                  <div
                    key={tx.id}
                    className="group relative flex items-center justify-between rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-800/50"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="truncate text-sm font-medium text-zinc-700 dark:text-zinc-200">
                        {tx.store || tx.type}
                      </span>
                      <p className="mt-0.5 truncate text-xs text-zinc-400">
                        {formatTime(tx.date)}
                      </p>
                    </div>
                    <span
                      className={`ml-3 shrink-0 font-mono text-sm font-semibold ${
                        tx.type === "expense" ? "text-red-500" : "text-green-500"
                      }`}
                    >
                      {tx.type === "expense" ? "-" : "+"}RM{" "}
                      {Number(tx.total).toLocaleString("en", { minimumFractionDigits: 2 })}
                    </span>
                    {/* Hover tooltip */}
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56 -translate-x-1/2 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-xs text-white shadow-lg opacity-0 transition-opacity group-hover:opacity-100">
                      <p className="font-medium">{tx.store || tx.type}</p>
                      <p className="mt-0.5 text-zinc-400">{formatTime(tx.date)}</p>
                      <hr className="my-1 border-zinc-700" />
                      <p>
                        Type: <span className="capitalize">{tx.type}</span>
                      </p>
                      {tx.payment_method && <p>Payment: {tx.payment_method}</p>}
                      {tx.notes && <p>Notes: {tx.notes}</p>}
                      <p>
                        Amount:{" "}
                        <span
                          className={
                            tx.type === "expense" ? "text-red-400" : "text-green-400"
                          }
                        >
                          {tx.type === "expense" ? "-" : "+"}RM{" "}
                          {Number(tx.total).toLocaleString("en", {
                            minimumFractionDigits: 2,
                          })}
                        </span>
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
