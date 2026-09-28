import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadBranchContext } from "@/lib/branch-context";
import { InvoiceListView } from "@/components/invoices/InvoiceListView";

export default async function InvoicesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { activeBranchId, branchRole, branches } = await loadBranchContext(session.user.id);
  const branchName = branches.find((b) => b.id === activeBranchId)?.name ?? null;

  if (!activeBranchId || (branchRole !== "OWNER" && branchRole !== "ADMIN")) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="text-[23px] font-light text-[#061b31]">Invoices</h1>
        <p className="mt-2 text-[15px] text-[#64748d]">
          Billing is handled by the branch owner and admins. Ask them if you need an invoice for a patient.
        </p>
      </div>
    );
  }

  return <InvoiceListView branchId={activeBranchId} branchName={branchName} />;
}
