import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, getUserBranchRole } from "@/lib/auth-utils";
import type { AppointmentStatus, InvoiceStatus, Prisma } from "@prisma/client";

type RouteCtx = { params: Promise<{ patientId: string }> };

interface PastAppointmentInvoiceDto {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: InvoiceStatus;
}

interface PastAppointmentDto {
  id: string;
  dateTime: string;
  duration: number;
  status: AppointmentStatus;
  isStale: boolean;
  notes: string | null;
  doctor: { id: string; name: string };
  branch: { id: string; name: string };
  visit: { id: string; visitDate: string } | null;
  invoices: PastAppointmentInvoiceDto[];
}

interface PastAppointmentStatsDto {
  completed: number;
  cancelled: number;
  noShow: number;
  stale: number;
  paid: number;
  outstanding: number;
  currency: "MYR";
}

interface PastAppointmentsResponse {
  stats: PastAppointmentStatsDto;
  appointments: PastAppointmentDto[];
  total: number;
  page: number;
  pageSize: number;
}

const VALID_STATUS_FILTERS = new Set([
  "COMPLETED",
  "CANCELLED",
  "NO_SHOW",
  "STALE",
]);

const VALID_SORT = new Set(["when", "doctor", "branch", "status"]);

export async function GET(req: Request, ctx: RouteCtx): Promise<Response> {
  const { patientId } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, branchId: true, doctorId: true },
  });
  // Branch isolation: if user has no membership at the patient's branch (and is not assigned doctor),
  // return 404 to avoid leaking existence.
  if (!patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const role = await getUserBranchRole(user.id, patient.branchId);
  const isAssignedDoctor = patient.doctorId === user.id;
  if (!role && !isAssignedDoctor) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const params = url.searchParams;

  // Filters
  const now = new Date();
  const statusParam = params.get("status");
  const requestedStatuses = statusParam
    ? statusParam.split(",").map((s) => s.trim().toUpperCase()).filter((s) => VALID_STATUS_FILTERS.has(s))
    : [];

  const doctorId = params.get("doctorId");
  const fromStr = params.get("from");
  const toStr = params.get("to");

  const sortKey = (params.get("sort") ?? "when").toLowerCase();
  const sort = VALID_SORT.has(sortKey) ? sortKey : "when";
  const dir = (params.get("dir") ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";

  const pageRaw = parseInt(params.get("page") ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSizeRaw = parseInt(params.get("pageSize") ?? "10", 10);
  const pageSize = Math.min(
    50,
    Number.isFinite(pageSizeRaw) && pageSizeRaw > 0 ? pageSizeRaw : 10
  );

  // Base: past appointments (dateTime < now)
  const where: Prisma.AppointmentWhereInput = {
    patientId,
    dateTime: { lt: now },
  };

  // Status filter — note STALE = SCHEDULED + dateTime<now (already filtered)
  if (requestedStatuses.length > 0) {
    const statusOr: Prisma.AppointmentWhereInput[] = [];
    const concrete: AppointmentStatus[] = [];
    for (const s of requestedStatuses) {
      if (s === "STALE") {
        // SCHEDULED OR IN_PROGRESS, dateTime<now (the base where already enforces past)
        statusOr.push({ status: { in: ["SCHEDULED", "IN_PROGRESS"] } });
      } else if (s === "COMPLETED" || s === "CANCELLED" || s === "NO_SHOW") {
        concrete.push(s as AppointmentStatus);
      }
    }
    if (concrete.length > 0) statusOr.push({ status: { in: concrete } });
    if (statusOr.length === 1) {
      Object.assign(where, statusOr[0]);
    } else if (statusOr.length > 1) {
      where.OR = statusOr;
    }
  }

  if (doctorId) where.doctorId = doctorId;

  if (fromStr || toStr) {
    const range: { gte?: Date; lt?: Date } = { lt: now };
    if (fromStr) {
      const f = new Date(fromStr);
      if (!Number.isNaN(f.getTime())) range.gte = f;
    }
    if (toStr) {
      const t = new Date(toStr);
      if (!Number.isNaN(t.getTime())) range.lt = t < now ? t : now;
    }
    where.dateTime = range;
  }

  // Sorting
  let orderBy: Prisma.AppointmentOrderByWithRelationInput;
  if (sort === "doctor") {
    orderBy = { doctor: { name: dir } };
  } else if (sort === "branch") {
    orderBy = { branch: { name: dir } };
  } else if (sort === "status") {
    orderBy = { status: dir };
  } else {
    orderBy = { dateTime: dir };
  }

  const total = await prisma.appointment.count({ where });

  const rows = await prisma.appointment.findMany({
    where,
    orderBy,
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      doctor: { select: { id: true, name: true } },
      branch: { select: { id: true, name: true } },
      visit: { select: { id: true, visitDate: true } },
      invoices: {
        select: { id: true, invoiceNumber: true, amount: true, status: true },
      },
    },
  });

  const appointments: PastAppointmentDto[] = rows.map((a) => ({
    id: a.id,
    dateTime: a.dateTime.toISOString(),
    duration: a.duration,
    status: a.status,
    isStale: a.status === "SCHEDULED" && a.dateTime < now,
    notes: a.notes ?? null,
    doctor: { id: a.doctor.id, name: a.doctor.name ?? "Unknown" },
    branch: { id: a.branch.id, name: a.branch.name },
    visit: a.visit ? { id: a.visit.id, visitDate: a.visit.visitDate.toISOString() } : null,
    invoices: a.invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      amount: Number(i.amount),
      status: i.status,
    })),
  }));

  // Stats — patient-scoped, NOT filter-scoped (per spec §3.3 / §8.8)
  const [statusGroups, paidAgg, outstandingAgg] = await Promise.all([
    prisma.appointment.groupBy({
      by: ["status"],
      where: { patientId, dateTime: { lt: now } },
      _count: { _all: true },
    }),
    prisma.invoice.aggregate({
      where: { patientId, status: "PAID" },
      _sum: { amount: true },
    }),
    prisma.invoice.aggregate({
      where: { patientId, status: { in: ["SENT", "OVERDUE"] } },
      _sum: { amount: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of statusGroups) counts[g.status] = g._count._all;

  const stats: PastAppointmentStatsDto = {
    completed: counts["COMPLETED"] ?? 0,
    cancelled: counts["CANCELLED"] ?? 0,
    noShow: counts["NO_SHOW"] ?? 0,
    stale: (counts["SCHEDULED"] ?? 0) + (counts["IN_PROGRESS"] ?? 0),
    paid: Number(paidAgg._sum.amount ?? 0),
    outstanding: Number(outstandingAgg._sum.amount ?? 0),
    currency: "MYR",
  };

  const body: PastAppointmentsResponse = {
    stats,
    appointments,
    total,
    page,
    pageSize,
  };
  return NextResponse.json(body);
}
