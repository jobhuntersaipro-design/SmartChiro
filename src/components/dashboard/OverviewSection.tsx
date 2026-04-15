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
        <h2 className="text-[23px] font-light tracking-[-0.01em] text-[#061b31]">
          Your overview
        </h2>
        <div className="flex items-center gap-2">
          <button className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2.5 text-[14px] font-normal text-[#273951] transition-colors hover:bg-[#f6f9fc]">
            + Add
          </button>
          <button className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2.5 text-[14px] font-normal text-[#273951] transition-colors hover:bg-[#f6f9fc]">
            Edit
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex items-center gap-2">
        <button className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2.5 text-[14px] font-normal text-[#061b31] transition-colors hover:bg-[#f6f9fc]">
          Date range
        </button>
        <button className="h-7 rounded-[4px] border border-[#e5edf5] bg-[#ededfc] px-2.5 text-[14px] font-normal text-[#533afd] transition-colors hover:bg-[#E8E5FF]">
          Last 7 days
        </button>
        <button className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2.5 text-[14px] font-normal text-[#273951] transition-colors hover:bg-[#f6f9fc]">
          Daily
        </button>
        <button className="h-7 rounded-[4px] border border-[#e5edf5] bg-white px-2.5 text-[14px] font-normal text-[#273951] transition-colors hover:bg-[#f6f9fc]">
          Compare
        </button>
      </div>

      {/* Stat Cards Grid — 3 columns top, 2+1 bottom to match screenshot */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="rounded-[6px] border border-[#e5edf5] bg-white p-4"
            style={{
              boxShadow:
                "rgba(50,50,93,0.25) 0px 30px 45px -30px, rgba(0,0,0,0.1) 0px 18px 36px -18px",
            }}
          >
            {/* Card header */}
            <div className="flex items-center gap-1 mb-3">
              <span className="text-[14px] font-medium text-[#273951]">
                {card.label}
              </span>
              <Info className="h-3.5 w-3.5 text-[#64748d]" strokeWidth={1.5} />
            </div>

            {card.value !== null ? (
              <>
                {/* Value */}
                <div className="text-[23px] font-light tracking-[-0.01em] text-[#061b31]">
                  {card.value}
                </div>
                {card.subtext && (
                  <div className="mt-0.5 text-[14px] text-[#64748d]">
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
                <div className="mt-3 flex items-center justify-between border-t border-[#e5edf5] pt-3">
                  <span className="text-[13px] text-[#64748d]">
                    Updated 8 hours ago
                  </span>
                  <button className="text-[13px] font-medium text-[#533afd] hover:text-[#4434d4]">
                    More details
                  </button>
                </div>
              </>
            ) : (
              /* No data state */
              <div className="flex flex-col items-center justify-center py-8">
                <div className="text-[15px] text-[#64748d]">No data</div>
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
          className="flex-1 rounded-[1px] bg-[#e5edf5]"
          style={{ height: `${height * 7}px` }}
        />
      ))}
    </div>
  );
}
