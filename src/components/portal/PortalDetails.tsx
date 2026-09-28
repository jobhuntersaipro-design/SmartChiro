import type { PortalMe } from "@/types/portal";
import { buildTelUrl } from "@/lib/format";
import { CARD, LINK } from "@/components/portal/styles";
import { cn } from "@/lib/utils";

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="py-2.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-[14px] text-[#697386]">{label}</dt>
      <dd className="text-[15px] text-[#0A2540] sm:col-span-2">{value || "—"}</dd>
    </div>
  );
}

/** Contact details on file, read-only: changes go through the clinic. */
export function PortalDetails({ me }: { me: PortalMe }) {
  return (
    <div className="space-y-3">
      {me.patients.map((p) => {
        const tel = buildTelUrl(p.branch.phone);
        return (
          <div key={p.id} className={cn(CARD, "p-4")}>
            <h2 className="text-[18px] font-medium text-[#0A2540]">{p.name}</h2>
            <p className="text-[14px] text-[#697386]">Patient at {p.branch.name}</p>
            <dl className="mt-2 divide-y divide-[#E3E8EE]">
              <Row label="Email" value={p.email} />
              <Row label="Phone" value={p.phone} />
              <Row label="Address" value={p.address} />
            </dl>
            <p className="mt-3 rounded-[4px] bg-[#F6F9FC] px-3 py-2 text-[14px] text-[#425466]">
              Something wrong? Ask the clinic to change these
              {p.branch.phone && tel ? (
                <>
                  {" "}— call{" "}
                  <a href={tel} className={LINK}>
                    {p.branch.phone}
                  </a>
                </>
              ) : null}
              .
            </p>
          </div>
        );
      })}
    </div>
  );
}
