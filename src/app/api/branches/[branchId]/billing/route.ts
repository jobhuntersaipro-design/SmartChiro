import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import { documentPrefix, formatDocumentNumber } from "@/lib/invoices";
import { clinicParts } from "@/lib/clinic-time";

type RouteCtx = { params: Promise<{ branchId: string }> };

const SELECT = {
  id: true,
  name: true,
  legalName: true,
  ssmRegNo: true,
  tin: true,
  sstRegNo: true,
  sstEnabled: true,
  sstRate: true,
  invoicePrefix: true,
  paymentInstructions: true,
  invoiceSeq: true,
  receiptSeq: true,
} as const;

type BillingRow = {
  id: string;
  name: string;
  legalName: string | null;
  ssmRegNo: string | null;
  tin: string | null;
  sstRegNo: string | null;
  sstEnabled: boolean;
  sstRate: { toString(): string };
  invoicePrefix: string | null;
  paymentInstructions: string | null;
  invoiceSeq: number;
  receiptSeq: number;
};

function serialize(b: BillingRow, role: string) {
  const prefix = documentPrefix(b);
  const year = clinicParts(new Date()).year;
  return {
    billing: {
      branchId: b.id,
      legalName: b.legalName,
      ssmRegNo: b.ssmRegNo,
      tin: b.tin,
      sstRegNo: b.sstRegNo,
      sstEnabled: b.sstEnabled,
      sstRate: Number(b.sstRate.toString()),
      invoicePrefix: b.invoicePrefix,
      paymentInstructions: b.paymentInstructions,
      /** What the next numbers will look like (prefix defaults to the branch initials). */
      effectivePrefix: prefix,
      nextInvoiceNumber: formatDocumentNumber("invoice", prefix, year, b.invoiceSeq + 1),
      nextReceiptNumber: formatDocumentNumber("receipt", prefix, year, b.receiptSeq + 1),
    },
    canEdit: role === "OWNER",
  };
}

/** Billing & tax settings printed on invoices and receipts. OWNER/ADMIN read. */
export async function GET(_req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // TODO(front-desk): FRONT_DESK doesn't need these settings; keep OWNER/ADMIN.
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: SELECT });
  if (!branch) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(serialize(branch, role));
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v === undefined ? undefined : v || null));

const Body = z
  .object({
    legalName: optionalText(200),
    ssmRegNo: optionalText(50),
    tin: optionalText(30),
    sstRegNo: optionalText(50),
    sstEnabled: z.boolean().optional(),
    sstRate: z
      .number()
      .min(0)
      .max(100)
      .refine((v) => Math.round(v * 100) === Number((v * 100).toFixed(6)), "at most 2 decimals")
      .optional(),
    invoicePrefix: z
      .string()
      .trim()
      .transform((v) => v.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{0,8}$/, "1–8 letters or digits"))
      .nullable()
      .optional()
      .transform((v) => (v === undefined ? undefined : v || null)),
    paymentInstructions: optionalText(1000),
  })
  .strict();

/** Update billing & tax settings (fields omitted stay as they are). OWNER only. */
export async function PUT(req: Request, ctx: RouteCtx): Promise<Response> {
  const { branchId } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const role = await getUserBranchRole(user.id, branchId);
  if (!role) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (role !== "OWNER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation", details: parsed.error.flatten() }, { status: 422 });
  }
  const data = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));

  const branch = await prisma.branch.update({ where: { id: branchId }, data, select: SELECT });
  return NextResponse.json(serialize(branch, role));
}
