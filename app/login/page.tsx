"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type DialogState =
  | null
  | { type: "new"; username: string }
  | { type: "existing"; username: string; userId: string; preference: number };

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [selectedPref, setSelectedPref] = useState(0);
  const [startingBalance, setStartingBalance] = useState("");
  const [showUserList, setShowUserList] = useState(false);
  const [userList, setUserList] = useState<{ username: string; id: string }[]>([]);
  const [fetchingUsers, setFetchingUsers] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!showUserList || userList.length > 0) return;
    async function fetchUsers() {
      setFetchingUsers(true);
      const { data } = await supabase
        .from("users")
        .select("id, username")
        .order("created_at", { ascending: false });
      if (data) setUserList(data);
      setFetchingUsers(false);
    }
    fetchUsers();
  }, [showUserList, userList.length]);

  function navigateToHome(route: string) {
    setDialog(null);
    setIsTransitioning(true);
    window.setTimeout(() => {
      sessionStorage.setItem("jokopay_route_fade", "1");
      router.push(route);
    }, 1000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setLoading(true);

    try {
      const { data: existing } = await supabase
        .from("users")
        .select("id, preference")
        .eq("username", username.trim())
        .maybeSingle();

      if (!existing) {
        setDialog({ type: "new", username: username.trim() });
      } else {
        setDialog({
          type: "existing",
          username: username.trim(),
          userId: existing.id,
          preference: existing.preference,
        });
      }
    } catch (err) {
      console.error("Login error:", err);
      alert("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser() {
    const d = dialog;
    if (!d || d.type !== "new") return;

    const balance = Number(startingBalance) || 0;

    try {
      const { data: newUser, error } = await supabase
        .from("users")
        .insert({ username: d.username, preference: selectedPref, balance })
        .select("id")
        .single();

      if (error) throw error;

      localStorage.setItem("jokopay_user_id", newUser.id);
      localStorage.setItem("jokopay_username", d.username);
      const route = selectedPref === 1 ? "/dashboardview" : "/chatview";
      navigateToHome(route);
    } catch (err) {
      console.error("Create user error:", err);
      alert("Failed to create user.");
    }
  }

  async function handleContinueWithHistory() {
    const d = dialog;
    if (!d || d.type !== "existing") return;
    localStorage.setItem("jokopay_user_id", d.userId);
    localStorage.setItem("jokopay_username", d.username);
    const route = d.preference === 1 ? "/dashboardview" : "/chatview";
    navigateToHome(route);
  }

  async function handleResetData() {
    const d = dialog;
    if (!d || d.type !== "existing") return;

    try {
      const { data: txs } = await supabase
        .from("transactions")
        .select("id")
        .eq("user_id", d.userId);
      const ids = txs?.map((t) => t.id) ?? [];

      if (ids.length > 0) {
        await supabase.from("transaction_items").delete().in("transaction_id", ids);
      }
      await supabase.from("transactions").delete().eq("user_id", d.userId);

      localStorage.setItem("jokopay_user_id", d.userId);
      localStorage.setItem("jokopay_username", d.username);
      const route = d.preference === 1 ? "/dashboardview" : "/chatview";
      navigateToHome(route);
    } catch (err) {
      console.error("Reset error:", err);
    }
  }

  async function handleDeleteUser() {
    const d = dialog;
    if (!d || d.type !== "existing") return;

    try {
      const { data: txs } = await supabase
        .from("transactions")
        .select("id")
        .eq("user_id", d.userId);
      const ids = txs?.map((t) => t.id) ?? [];

      if (ids.length > 0) {
        await supabase.from("transaction_items").delete().in("transaction_id", ids);
      }
      await supabase.from("transactions").delete().eq("user_id", d.userId);
      await supabase.from("users").delete().eq("id", d.userId);
    } catch (err) {
      console.error("Delete error:", err);
    }
    window.location.reload();
  }

  function handleCancel() {
    setDialog(null);
    setUsername("");
  }

  function handleSelectUser(u: string) {
    setUsername(u);
    setShowUserList(false);
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="grid min-h-screen grid-cols-1 overflow-hidden lg:grid-cols-[3fr_2fr]">
        <section className="relative flex min-h-[38vh] overflow-hidden rounded-b-[1.5rem] bg-[linear-gradient(135deg,var(--brand)_0%,color-mix(in_srgb,var(--brand)_72%,var(--brand-dark))_45%,var(--brand-dark)_100%)] px-5 py-5 text-white sm:min-h-[46vh] sm:rounded-b-[2rem] sm:px-10 sm:py-8 lg:min-h-screen lg:rounded-b-none lg:rounded-r-[2rem] lg:px-16">
          <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:radial-gradient(currentColor_1px,transparent_1px)] [background-size:4px_4px]" />
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(115deg,transparent_0%,transparent_44%,currentColor_44.2%,transparent_44.6%,transparent_100%)]" />
          <div className="auth-float pointer-events-none absolute -right-24 top-12 h-44 w-44 rounded-full border border-white/30 sm:top-20 sm:h-72 sm:w-72" />
          <div className="auth-float pointer-events-none absolute bottom-10 left-[58%] h-28 w-28 rounded-full border border-white/20 [animation-delay:-4s] sm:bottom-20 sm:left-[52%] sm:h-48 sm:w-48" />
          <div className="pointer-events-none absolute left-8 top-1/3 h-36 w-[24rem] rounded-[100%] border border-white/20 sm:left-12 sm:h-56 sm:w-[42rem]" />

          <div className="relative z-10 flex w-full flex-col">
            <div className="flex h-8 w-8 items-center justify-center text-3xl font-semibold leading-none text-white/90 sm:h-11 sm:w-11 sm:text-4xl">
              *
            </div>

            <div className="flex flex-1 items-center py-7 sm:py-16">
              <div className="max-w-2xl lg:ml-8">
                <h1 className="text-[2rem] font-bold leading-[1.08] tracking-tight sm:text-5xl xl:text-6xl">
                  Welcome to{" "}
                  <span className="font-brand font-normal tracking-wide">JokoPay</span>
                </h1>
                <p className="mt-4 max-w-xl text-sm leading-6 text-white/80 sm:mt-6 sm:text-lg sm:leading-8">
                  Skip repetitive money tracking and manual transaction notes. Stay productive with a simple finance workspace that helps you record spending, income, and balances faster.
                </p>
              </div>
            </div>

            <p className="text-xs text-white/70 sm:text-sm">
              &copy;2026 Vixwoke. All rights reserved.
            </p>
          </div>
        </section>

        <section className="flex min-h-[62vh] items-start justify-center bg-[var(--background)] px-5 py-7 sm:min-h-[54vh] sm:items-center sm:px-10 sm:py-10 lg:min-h-screen">
          <div className="auth-fade-in w-full max-w-md">
            <div className="mb-6 text-center sm:mb-10">
              <p className="font-brand text-3xl tracking-wide text-[var(--brand)] sm:text-4xl">
                JokoPay
              </p>
              <h2 className="mt-5 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:mt-8 sm:text-3xl">
                Welcome Back!
              </h2>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 sm:mt-3">
                Pick any username.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex w-full flex-col gap-4 sm:gap-6"
            >
              <label className="group block">
                <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Username
                </span>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full rounded-xl border border-zinc-200 bg-transparent px-3.5 py-3 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/10 disabled:opacity-50 dark:border-zinc-700 dark:text-white sm:px-4 sm:py-3.5 sm:text-base"
                  autoFocus
                  disabled={loading}
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-[var(--brand)]/20 transition hover:-translate-y-0.5 hover:bg-[var(--brand-dark)] hover:shadow-md disabled:translate-y-0 disabled:opacity-50 sm:px-5 sm:py-3.5 sm:text-base"
              >
                {loading ? "Loading..." : "Let's Go"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => setShowUserList((v) => !v)}
              className="mt-4 w-full text-center text-xs font-medium text-zinc-400 underline-offset-4 transition hover:text-[var(--brand)] hover:underline sm:mt-6 sm:text-sm"
            >
              {showUserList ? "Close user list" : "List tracked username"}
            </button>

            {showUserList && (
              <div className="mt-3 max-h-44 w-full overflow-y-auto rounded-2xl bg-white/80 p-3 shadow-sm ring-1 ring-zinc-200/70 backdrop-blur dark:bg-[#1f2c33]/80 dark:ring-zinc-700 sm:mt-4 sm:max-h-none sm:p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                  Previously used usernames
                </p>
                {fetchingUsers ? (
                  <p className="text-sm text-zinc-400">Loading...</p>
                ) : userList.length === 0 ? (
                  <p className="text-sm text-zinc-400">No tracked users yet.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {userList.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => handleSelectUser(u.username)}
                        className="rounded-xl px-3 py-1.5 text-left text-sm text-zinc-700 transition hover:bg-[var(--brand)]/10 hover:text-[var(--brand-dark)] dark:text-zinc-300 dark:hover:bg-[var(--brand)]/15 dark:hover:text-zinc-100 sm:py-2"
                      >
                        {u.username}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* New user dialog */}
      {dialog?.type === "new" && (
        <div className="fixed inset-0 z-50 grid grid-cols-1 bg-black/40 backdrop-blur-sm lg:grid-cols-[3fr_2fr]">
          <div className="hidden lg:block" />
          <div className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="dialog-enter mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-[#1f2c33] dark:ring-white/10">
            <div className="mb-5 flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)]/10">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-[var(--brand)]">
                  <path d="M5.25 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM2.25 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM18.75 7.5a.75.75 0 00-1.5 0v2.25H15a.75.75 0 000 1.5h2.25v2.25a.75.75 0 001.5 0v-2.25H21a.75.75 0 000-1.5h-2.25V7.5z" />
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                  Welcome, {dialog.username}!
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  New account. Set up your preferences.
                </p>
              </div>
            </div>
            <div className="mb-5 space-y-2">
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 p-3.5 transition hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 dark:border-zinc-700 dark:hover:border-[var(--brand)] dark:hover:bg-[var(--brand)]/10">
                <input
                  type="radio"
                  name="preference"
                  checked={selectedPref === 0}
                  onChange={() => setSelectedPref(0)}
                  className="accent-[var(--brand)]"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    Chat Only
                  </p>
                  <p className="text-xs text-zinc-400">
                    Simple chat interface to log transactions
                  </p>
                </div>
              </label>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-zinc-200 p-3.5 transition hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 dark:border-zinc-700 dark:hover:border-[var(--brand)] dark:hover:bg-[var(--brand)]/10">
                <input
                  type="radio"
                  name="preference"
                  checked={selectedPref === 1}
                  onChange={() => setSelectedPref(1)}
                  className="accent-[var(--brand)]"
                />
                <div>
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    Chat + Dashboard
                  </p>
                  <p className="text-xs text-zinc-400">
                    Chat interface with charts and analytics
                  </p>
                </div>
              </label>
            </div>
            <div className="mb-5">
              <label className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Starting Balance
              </label>
              <p className="mb-2 text-xs text-zinc-400">Initial wallet amount</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">RM</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                  placeholder="0.00"
                  className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-base outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white"
                />
              </div>
              <button
                type="button"
                onClick={() => setStartingBalance("0.00")}
                className="mt-2 text-xs text-zinc-400 underline underline-offset-2 transition hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Set to RM 0.00
              </button>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleCancel}
                className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-700 active:scale-[0.98] dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={!startingBalance}
                className="flex-1 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50 active:scale-[0.98]"
              >
                Continue
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {/* Existing user dialog */}
      {dialog?.type === "existing" && (
        <div className="fixed inset-0 z-50 grid grid-cols-1 bg-black/40 backdrop-blur-sm lg:grid-cols-[3fr_2fr]">
          <div className="hidden lg:block" />
          <div className="flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="dialog-enter mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-[#1f2c33] dark:ring-white/10">
            <div className="mb-5 flex flex-col items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 text-amber-500">
                  <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="text-center">
                <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
                  Welcome back, {dialog.username}!
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  This user has previous data. Choose an action:
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={handleContinueWithHistory}
                className="rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-green-700 active:scale-[0.98]"
              >
                Continue with existing history
              </button>
              <button
                onClick={handleResetData}
                className="rounded-lg bg-red-400 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-500 active:scale-[0.98]"
              >
                Continue with clean history (delete old data)
              </button>
              <button
                onClick={handleDeleteUser}
                className="rounded-lg bg-red-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-800 active:scale-[0.98]"
              >
                Delete this user permanently
              </button>
              <button
                onClick={handleCancel}
                className="mt-1 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-700 active:scale-[0.98] dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
            </div>
          </div>
          </div>
        </div>
      )}

      {isTransitioning && (
        <div className="login-fade-out fixed inset-0 z-[70] bg-black" />
      )}
    </div>
  );
}
