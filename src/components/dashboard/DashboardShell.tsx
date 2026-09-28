"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { BranchRole } from "@prisma/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface SidebarUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  branchRole: BranchRole | null;
  activeBranchId: string | null;
  branches: { id: string; name: string; role: BranchRole }[];
}

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: SidebarUser;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Phones/small tablets: the sidebar is a drawer instead of a fixed column
  // (it used to leave ~170 px for content on a 390 px phone).
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer after navigating, and on Esc.
  const [navPath, setNavPath] = useState(pathname);
  if (navPath !== pathname) {
    setNavPath(pathname);
    setMobileNavOpen(false);
  }
  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  // Full-screen mode for annotation pages — skip sidebar and topbar
  const isAnnotatePage = pathname.includes("/annotate");
  if (isAnnotatePage) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen overflow-hidden bg-background">
        <div className="hidden md:flex">
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
            user={user}
          />
        </div>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileNavOpen(false)} />
            <div className="relative shadow-xl">
              <Sidebar collapsed={false} onToggle={() => setMobileNavOpen(false)} user={user} />
            </div>
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar onOpenMenu={() => setMobileNavOpen(true)} />
          <main className="flex-1 overflow-y-auto px-4 py-4 md:px-8 md:py-6">{children}</main>
        </div>
      </div>
      {/* One toast host for every dashboard page (the full-screen viewer has its own). */}
      <Toaster richColors closeButton position="bottom-right" />
    </TooltipProvider>
  );
}
