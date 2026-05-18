"use client";

interface NavbarProps {
  onMenuClick: () => void;
  hideLogo?: boolean;
}

export default function Navbar({ onMenuClick, hideLogo }: NavbarProps) {
  return (
    <nav className="fixed left-0 top-0 z-30 flex h-14 w-full items-center border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-700 dark:bg-zinc-900/80">
      <button
        onClick={onMenuClick}
        className="ml-4 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700"
        aria-label="Open sidebar"
      >
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-zinc-600 dark:text-zinc-300">
          <path fillRule="evenodd" d="M3 6.75A.75.75 0 013.75 6h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 6.75zM3 12a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75A.75.75 0 013 12zm0 5.25a.75.75 0 01.75-.75h16.5a.75.75 0 010 1.5H3.75a.75.75 0 01-.75-.75z" clipRule="evenodd" />
        </svg>
      </button>

      {!hideLogo && (
        <div className="ml-3 flex items-center">
          <span className="hidden font-brand text-lg tracking-wide text-[var(--brand)] md:block">
            JokoPay
          </span>
        </div>
      )}
    </nav>
  );
}
