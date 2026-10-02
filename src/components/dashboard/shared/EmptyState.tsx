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
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-subtle mb-4">
        <Icon className="h-5 w-5 text-brand" strokeWidth={1.5} />
      </div>
      <h3 className="text-[16px] font-medium text-foreground mb-1">{title}</h3>
      <p className="text-[14px] text-fg-secondary max-w-75">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
