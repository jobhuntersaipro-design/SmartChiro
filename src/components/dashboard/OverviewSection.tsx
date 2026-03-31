import { Info } from "lucide-react";
import { dashboardStats } from "@/lib/mock-data";

const statCards = [
  {
    label: "Payments",
    value: `MYR ${dashboardStats.revenueMTD.value.toLocaleString()}.00`,
    subtext: "MYR 0.00 previous period",
    hasChart: true,
    span: 1,
  },
  {
    label: "Net volume",
    value: `MYR ${dashboardStats.revenueMTD.value.toLocaleString()}.00`,
    subtext: `MYR 0.00 previous period`,
    hasChart: true,
    span: 1,
  },
  {
    label: "MRR",
    value: "MYR 0.00",
    subtext: "MYR 0.00 previous period",
    hasChart: true,
    span: 1,
  },
  {
    label: "Failed payments",
    value: null,
    subtext: null,
    hasChart: false,
    span: 1,
  },
  {
    label: "New customers",
    value: `${dashboardStats.totalPatients.value}`,
    subtext: "0 previous period",
    hasChart: true,
    span: 1,
  },
];

export function OverviewSection() {
  return (
    <section>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[23px] font-semibold tracking-[-0.01em] text-[#0A2540]">
          Your overview
        </h2>
        <div className="flex items-center gap-2">
          <button className="h-7 rounded-[4px] border border-[#E3E8EE] bg-white px-2.5 text-[14px] font-medium text-[#425466] transition-colors hover:bg-[#F0F3F7]">
            + Add
          </button>
          <button className="h-7 rounded-[4px] border border-[#E3E8EE] bg-white px-2.5 text-[14px] font-medium text-[#425466] transition-colors hover:bg-[#F0F3F7]">
            Edit
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2">
        <button className="h-7 rounded-[4px] border border-[#E3E8EE] bg-white px-2.5 text-[14px] font-medium text-[#0A2540] transition-colors hover:bg-[#F0F3F7]">
          Date range
        </button>
        <button className="h-7 rounded-[4px] border border-[#E3E8EE] bg-[#F0EEFF] px-2.5 text-[14px] font-medium text-[#635BFF] transition-colors hover:bg-[#E8E5FF]">
          Last 7 days
        </button>
        <button className="h-7 rounded-[4px] border border-[#E3E8EE] bg-white px-2.5 text-[14px] font-medium text-[#425466] transition-colors hover:bg-[#F0F3F7]">
          Daily
        </button>
        <button className="h-7 rounded-[4px] border border-[#E3E8EE] bg-white px-2.5 text-[14px] font-medium text-[#425466] transition-colors hover:bg-[#F0F3F7]">
          Compare
        </button>
      </div>

      {/* Stat Cards Grid — 3 columns top, 2+1 bottom to match screenshot */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-[6px] border border-[#E3E8EE] bg-white p-4"
            style={{
              boxShadow:
                "0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)",
            }}
          >
            {/* Card header */}
            <div className="flex items-center gap-1 mb-3">
              <span className="text-[14px] font-medium text-[#425466]">
                {card.label}
              </span>
              <Info className="h-3.5 w-3.5 text-[#697386]" strokeWidth={1.5} />
            </div>

            {card.value !== null ? (
              <>
                {/* Value */}
                <div className="text-[23px] font-semibold tracking-[-0.01em] text-[#0A2540]">
                  {card.value}
                </div>
                {card.subtext && (
                  <div className="mt-0.5 text-[14px] text-[#697386]">
                    {card.subtext}
                  </div>
                )}

                {/* Chart placeholder */}
                {card.hasChart && (
                  <div className="mt-4 flex items-end justify-between h-[60px]">
                    <ChartPlaceholder />
                  </div>
                )}

                {/* Footer */}
                <div className="mt-3 flex items-center justify-between border-t border-[#E3E8EE] pt-3">
                  <span className="text-[13px] text-[#697386]">
                    Updated 8 hours ago
                  </span>
                  <button className="text-[13px] font-medium text-[#635BFF] hover:text-[#5851EB]">
                    More details
                  </button>
                </div>
              </>
            ) : (
              /* No data state */
              <div className="flex flex-col items-center justify-center py-8">
                <div className="text-[15px] text-[#697386]">No data</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function ChartPlaceholder() {
  // Simple bar chart placeholder matching the screenshot style
  const bars = [3, 5, 2, 7, 4, 6, 3, 5, 8, 4, 6, 3];
  return (
    <div className="flex w-full items-end gap-[3px] h-[60px]">
      {bars.map((height, i) => (
        <div
          key={i}
          className="flex-1 rounded-[1px] bg-[#E3E8EE]"
          style={{ height: `${height * 7}px` }}
        />
      ))}
    </div>
  );
}
