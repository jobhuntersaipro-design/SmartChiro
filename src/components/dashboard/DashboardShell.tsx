"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import type { BranchRole } from "@prisma/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface SidebarUser {
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
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          user={user}
        />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto px-8 py-6">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  );
}
