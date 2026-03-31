import { recentActivity } from "@/lib/mock-data";

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hours ago`;
  return date.toLocaleDateString();
}

function highlightName(description: string): React.ReactNode {
  // Bold patient/doctor names — match patterns like "for John Doe" or "Dr. Smith"
  const parts = description.split(/((?:Dr\.\s)?\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/g);
  return parts.map((part, i) => {
    if (/^(?:Dr\.\s)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)+$/.test(part)) {
      return (
        <span key={i} className="font-medium text-[#0A2540]">
          {part}
        </span>
      );
    }
    return part;
  });
}

export function RecentActivity() {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[18px] font-semibold tracking-[-0.01em] text-[#0A2540]">
          Recent Activity
        </h3>
        <button className="text-[13px] font-medium text-[#635BFF] hover:text-[#5851EB]">
          Filter
        </button>
      </div>

      <div className="space-y-0">
        {recentActivity.map((activity) => (
          <div
            key={activity.id}
            className="flex gap-3 py-3 border-b border-[#E3E8EE] last:border-b-0"
          >
            {/* Dot indicator */}
            <div className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[#635BFF]" />

            <div className="min-w-0">
              <p className="text-[15px] leading-relaxed text-[#425466]">
                {highlightName(activity.description)}
              </p>
              <p className="mt-0.5 text-[13px] text-[#697386]">
                {formatTimestamp(activity.timestamp)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
