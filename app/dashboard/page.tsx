"use client";

import { useState } from "react";
import DashboardPanel from "../components/DashboardPanel";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

export default function DashboardOnlyPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleOpenSettings() {
    setSidebarOpen(false);
  }

  return (
    <div className="flex h-full min-w-0 flex-1 overflow-x-hidden">
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenSettings={handleOpenSettings}
      />

      <Navbar onMenuClick={() => setSidebarOpen(true)} />

      <div className="min-w-0 flex-1 px-4 pb-4 pt-[4.5rem]">
        <DashboardPanel refreshKey={refreshKey} />
      </div>
    </div>
  );
}
