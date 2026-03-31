import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { Image, ExternalLink } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function XraysPage() {
  const xrays = await prisma.xray.findMany({
    include: {
      patient: { select: { firstName: true, lastName: true } },
      _count: { select: { annotations: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="px-8 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold" style={{ color: "#0A2540" }}>
            X-Rays
          </h1>
          <p className="text-sm" style={{ color: "#697386" }}>
            View and annotate patient X-ray images
          </p>
        </div>
      </div>

      {xrays.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center rounded-[6px] border py-16"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#E3E8EE",
          }}
        >
          <Image size={40} style={{ color: "#A3ACB9" }} />
          <p className="mt-3 text-sm font-medium" style={{ color: "#0A2540" }}>
            No X-rays yet
          </p>
          <p className="mt-1 text-sm" style={{ color: "#697386" }}>
            Upload an X-ray from a patient record to get started.
          </p>
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-[6px] border"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#E3E8EE",
          }}
        >
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: "1px solid #E3E8EE" }}>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "#697386" }}>
                  Title
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "#697386" }}>
                  Patient
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "#697386" }}>
                  Region
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "#697386" }}>
                  View
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "#697386" }}>
                  Annotations
                </th>
                <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "#697386" }}>
                  Status
                </th>
                <th className="px-4 py-2.5 text-right text-xs font-medium" style={{ color: "#697386" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {xrays.map((xray) => (
                <tr
                  key={xray.id}
                  className="transition-colors"
                  style={{ borderBottom: "1px solid #E3E8EE" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#F0F3F7")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <td className="px-4 py-2.5 text-sm font-medium" style={{ color: "#0A2540" }}>
                    {xray.title ?? "Untitled"}
                  </td>
                  <td className="px-4 py-2.5 text-sm" style={{ color: "#425466" }}>
                    {xray.patient.firstName} {xray.patient.lastName}
                  </td>
                  <td className="px-4 py-2.5 text-sm capitalize" style={{ color: "#425466" }}>
                    {xray.bodyRegion?.toLowerCase().replace("_", " ") ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-sm" style={{ color: "#425466" }}>
                    {xray.viewType ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 text-sm" style={{ color: "#425466" }}>
                    {xray._count.annotations}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: xray.status === "READY" ? "#E6F9E6" : "#FFF8E6",
                        color: xray.status === "READY" ? "#30B130" : "#F5A623",
                      }}
                    >
                      {xray.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/dashboard/xrays/${xray.id}/annotate`}
                      className="inline-flex items-center gap-1 text-sm font-medium transition-colors"
                      style={{ color: "#635BFF" }}
                    >
                      Annotate
                      <ExternalLink size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
