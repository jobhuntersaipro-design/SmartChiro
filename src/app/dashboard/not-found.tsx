import { NotFoundPanel } from "@/components/dashboard/shared/NotFoundPanel";

/** 404 inside the dashboard shell, so the sidebar stays usable. */
export default function DashboardNotFound() {
  return (
    <div className="flex justify-center py-12">
      <NotFoundPanel />
    </div>
  );
}
