"use client";

import { useState, useEffect, Suspense } from "react";
import ChatView from "../components/ChatView";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import HomeViewSettings from "../components/HomeViewSettings";
import { supabase } from "@/lib/supabase";

export default function ChatPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preference, setPreference] = useState<number | null>(null);

  useEffect(() => {
    const userId = localStorage.getItem("jokopay_user_id");
    if (!userId) return;
    supabase
      .from("users")
      .select("preference")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data) setPreference(data.preference);
      });
  }, []);

  function handleOpenSettings() {
    setSidebarOpen(false);
    setTimeout(() => setSettingsOpen(true), 300);
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-x-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={handleOpenSettings}
      />

      <Navbar onMenuClick={() => setSidebarOpen(true)} hideLogo />

      <main className="flex min-w-0 flex-1 px-4 pb-4 pt-[4.5rem]">
        <Suspense fallback={<div className="flex flex-1 items-center justify-center text-sm text-zinc-400">Loading...</div>}>
          <ChatView />
        </Suspense>
      </main>

      <HomeViewSettings open={settingsOpen} preference={preference} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
