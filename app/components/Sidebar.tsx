"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
}

export default function Sidebar({ isOpen, onClose, onOpenSettings }: SidebarProps) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    if (!isOpen) return;

    setUsername(
      typeof window !== "undefined"
        ? localStorage.getItem("jokopay_username") || "User"
        : "User"
    );

    const userId =
      typeof window !== "undefined"
        ? localStorage.getItem("jokopay_user_id")
        : null;
    if (userId) {
      supabase
        .from("users")
        .select("balance, username")
        .eq("id", userId)
        .single()
        .then(({ data }) => {
          if (data) {
            setBalance(Number(data.balance));
            setUsername(data.username || username);
          }
        });
    }
  }, [isOpen]);

  function handleLogout() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("jokopay_user_id");
      localStorage.removeItem("jokopay_username");
    }
    window.location.href = "/login";
  }

  function handleHome() {
    onClose();
    const userId =
      typeof window !== "undefined"
        ? localStorage.getItem("jokopay_user_id")
        : null;
    if (!userId) { router.push("/chatview"); return; }
    supabase
      .from("users")
      .select("preference")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        const pref = data?.preference ?? 0;
        router.push(pref === 1 ? "/dashboardview" : "/chatview");
      }, () => router.push("/chatview"));
  }

  const navItems = [
    {
      label: "Home",
      onClick: handleHome,
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-zinc-400">
          <path d="M11.47 3.84a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.06l-8.689-8.69a2.25 2.25 0 00-3.182 0l-8.69 8.69a.75.75 0 001.061 1.06l8.69-8.69z" />
          <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" />
        </svg>
      ),
    },
    {
      label: "Dashboard",
      onClick: () => { onClose(); router.push("/dashboard"); },
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-zinc-400">
          <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75zM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 01-1.875-1.875V8.625zM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 013 19.875v-6.75z" />
        </svg>
      ),
    },
    {
      label: "Transactions",
      onClick: () => { onClose(); router.push("/transactions"); },
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-zinc-400">
          <path d="M5.625 3.75a2.625 2.625 0 100 5.25h12.75a2.625 2.625 0 000-5.25H5.625zM3.75 11.25a.75.75 0 000 1.5h16.5a.75.75 0 000-1.5H3.75zM3 15.75a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75zM3.75 18.75a.75.75 0 000 1.5h16.5a.75.75 0 000-1.5H3.75z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed left-0 top-0 z-50 flex h-full w-72 flex-col bg-zinc-900 text-white shadow-2xl transition-transform duration-300 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5"
          >
            <path
              fillRule="evenodd"
              d="M5.47 5.47a.75.75 0 011.06 0L12 10.94l5.47-5.47a.75.75 0 111.06 1.06L13.06 12l5.47 5.47a.75.75 0 11-1.06 1.06L12 13.06l-5.47 5.47a.75.75 0 01-1.06-1.06L10.94 12 5.47 6.53a.75.75 0 010-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        {/* Logo */}
        <div className="flex items-center px-6 pt-8">
          <span className="font-brand text-xl tracking-wide text-[var(--brand)]">
            JokoPay
          </span>
        </div>

        {/* Nav items */}
        <nav className="mt-8 flex-1 space-y-1 px-4">
          {navItems.map((item) => (
            <button
              key={item.label}
              onClick={item.onClick}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white active:scale-[0.98]"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Bottom section */}
        <div className="border-t border-zinc-800 px-4 pb-6 pt-4">
          {/* Settings */}
          <button
            onClick={() => {
              onClose();
              setTimeout(() => onOpenSettings?.(), 300);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-300 transition hover:bg-zinc-800 hover:text-white active:scale-[0.98]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              className="h-5 w-5 text-zinc-500"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Settings
          </button>

          {/* Account profile */}
          <div className="mt-3 rounded-xl border border-zinc-700/50 bg-zinc-800/30 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold text-white">
                {username ? username[0].toUpperCase() : "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{username}</p>
                <p className="text-xs text-zinc-400">
                  RM{" "}
                  {balance.toLocaleString("en", {
                    minimumFractionDigits: 2,
                  })}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="mt-3 w-full rounded-lg border border-red-800/50 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-900/20 active:scale-[0.98]"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
