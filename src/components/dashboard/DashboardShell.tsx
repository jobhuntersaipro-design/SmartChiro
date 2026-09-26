"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { BranchRole } from "@prisma/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { MobileNav } from "./MobileNav";

interface SidebarUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  branchRole: BranchRole | null;
}

export function DashboardShell({
  children,
  user,
}: {
  children: React.ReactNode;
  user: SidebarUser;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();

  // Full-screen mode for annotation pages — skip sidebar and topbar
  const isAnnotatePage = pathname.includes("/annotate");
  if (isAnnotatePage) {
    return <>{children}</>;
  }

  return (
    <TooltipProvider>
      <div className="flex h-dvh overflow-hidden bg-background">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          user={user}
        />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-4 py-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-6">
            <div key={pathname} className="animate-page-in min-w-0">
              {children}
            </div>
          </main>
          <MobileNav userId={user.id} />
        </div>
      </div>
    </TooltipProvider>
  );
}
