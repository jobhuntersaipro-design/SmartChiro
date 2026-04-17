import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SettingsView } from "@/components/dashboard/settings/SettingsView";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { userId } = await params;

  // Only allow users to view their own settings
  if (session.user.id !== userId) {
    notFound();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phoneNumber: true,
      password: true,
      createdAt: true,
      accounts: {
        select: { provider: true },
      },
      branchMemberships: {
        include: { branch: { select: { id: true, name: true } } },
      },
    },
  });

  if (!user) notFound();

  const hasPassword = !!user.password;
  const linkedProviders = user.accounts.map((a) => a.provider);

  return (
    <div className="px-8 py-6">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-[14px] text-[#64748d] hover:text-[#533afd] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          Back to Dashboard
        </Link>
        <h1 className="text-[23px] font-light text-[#061b31] mt-1">
          Settings
        </h1>
        <p className="text-[14px] text-[#64748d] mt-0.5">
          Manage your account preferences and security
        </p>
      </div>

      <SettingsView
        user={{
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          phone: user.phoneNumber,
          hasPassword,
          linkedProviders,
          memberSince: user.createdAt.toISOString(),
          branches: user.branchMemberships.map((m) => ({
            id: m.branch.id,
            name: m.branch.name,
            role: m.role,
          })),
        }}
      />
    </div>
  );
}
