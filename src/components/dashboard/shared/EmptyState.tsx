import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#ededfc] mb-4">
        <Icon className="h-5 w-5 text-[#533afd]" strokeWidth={1.5} />
      </div>
      <h3 className="text-[16px] font-medium text-[#061b31] mb-1">{title}</h3>
      <p className="text-[14px] text-[#64748d] max-w-[300px]">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
