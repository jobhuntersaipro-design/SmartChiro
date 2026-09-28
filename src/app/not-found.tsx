import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/dashboard/shared/NotFoundPanel";

export const metadata: Metadata = { title: "Page not found · SmartChiro" };

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-[#F6F9FC] px-4 py-12">
      <NotFoundPanel />
    </main>
  );
}
