"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface HomeViewSettingsProps {
  open: boolean;
  preference: number | null;
  onClose: () => void;
}

export default function HomeViewSettings({ open, preference, onClose }: HomeViewSettingsProps) {
  const router = useRouter();
  const [draftPref, setDraftPref] = useState(preference ?? 0);
  const [savingPref, setSavingPref] = useState(false);

  if (!open) return null;

  async function handleSave() {
    const userId = localStorage.getItem("jokopay_user_id");
    if (!userId) return;

    setSavingPref(true);
    try {
      const { error } = await supabase
        .from("users")
        .update({ preference: draftPref })
        .eq("id", userId);
      if (error) throw error;
      onClose();
      router.push(draftPref === 1 ? "/dashboardview" : "/chatview");
    } catch (err) {
      console.error("Failed to update preference:", err);
    } finally {
      setSavingPref(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="dialog-enter mx-4 w-full max-w-md rounded-xl bg-white p-6 shadow-2xl ring-1 ring-black/5 dark:bg-[#1f2c33] dark:ring-white/10">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--brand)]/10">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-[var(--brand)]">
                <path d="M18 1.5c-2.485 0-4.5 2.015-4.5 4.5v.75h-9A2.25 2.25 0 002.25 9v.75h6.545A4.466 4.466 0 007.5 12.75H2.25v3.75A2.25 2.25 0 004.5 18h15a2.25 2.25 0 002.25-2.25V9a2.25 2.25 0 00-2.25-2.25h-9V6c0-1.654 1.346-3 3-3h.75a.75.75 0 010 1.5H18z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">
              Home View
            </h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <p className="mb-4 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
          Choose which page appears when tapping <strong>Home</strong> in the sidebar.
        </p>

        <div className="mb-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            <strong className="text-zinc-600 dark:text-zinc-300">On mobile,</strong> the app always uses
            Chat Only mode regardless of this setting.
          </p>
        </div>

        <div className="space-y-2">
          <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 transition ${
            draftPref === 0
              ? "border-[var(--brand)] bg-[var(--brand)]/5 dark:border-[var(--brand)] dark:bg-[var(--brand)]/10"
              : "border-zinc-200 hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 dark:border-zinc-700 dark:hover:border-[var(--brand)] dark:hover:bg-[var(--brand)]/10"
          }`}>
            <input
              type="radio"
              name="preference"
              checked={draftPref === 0}
              onChange={() => setDraftPref(0)}
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
          <label className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3.5 transition ${
            draftPref === 1
              ? "border-[var(--brand)] bg-[var(--brand)]/5 dark:border-[var(--brand)] dark:bg-[var(--brand)]/10"
              : "border-zinc-200 hover:border-[var(--brand)] hover:bg-[var(--brand)]/5 dark:border-zinc-700 dark:hover:border-[var(--brand)] dark:hover:bg-[var(--brand)]/10"
          }`}>
            <input
              type="radio"
              name="preference"
              checked={draftPref === 1}
              onChange={() => setDraftPref(1)}
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

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 hover:text-zinc-700 active:scale-[0.99] dark:border-zinc-600 dark:bg-transparent dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={savingPref}
            className="flex-1 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50 active:scale-[0.99]"
          >
            {savingPref ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}