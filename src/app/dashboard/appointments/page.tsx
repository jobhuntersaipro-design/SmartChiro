import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppointmentsCalendarView } from "@/components/calendar/AppointmentsCalendarView";

export default async function AppointmentsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Resolve all branch memberships so the filter bar can offer the right options
  // and we can server-render the initial branch selection.
  const memberships = await prisma.branchMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      branch: {
        select: {
          id: true,
          name: true,
          members: {
            select: {
              role: true,
              user: { select: { id: true, name: true, image: true } },
            },
          },
        },
      },
    },
    orderBy: { branch: { name: "asc" } },
  });

  const userBranches = memberships.map((m) => ({
    id: m.branch.id,
    name: m.branch.name,
    role: m.role,
    doctors: m.branch.members
      .filter((mem) => mem.role === "DOCTOR" || mem.role === "OWNER" || mem.role === "ADMIN")
      .map((mem) => ({
        id: mem.user.id,
        name: mem.user.name ?? "Unnamed",
        image: mem.user.image,
      })),
  }));

  return (
    <AppointmentsCalendarView
      currentUserId={session.user.id}
      branches={userBranches}
    />
  );
}
