import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Find user
const user = await prisma.user.findUnique({
  where: { email: 'jobhunters.ai.pro@gmail.com' },
  include: {
    branchMemberships: { include: { branch: { select: { name: true } } } },
  },
})
console.log('User:', user ? { id: user.id, email: user.email, name: user.name, memberships: user.branchMemberships.map(m => ({ branch: m.branch.name, role: m.role })) } : 'NOT FOUND')

// Total memberships in DB
const totalMembers = await prisma.branchMember.count()
const memberRoles = await prisma.branchMember.groupBy({ by: ['role'], _count: true })
console.log('Total BranchMember rows:', totalMembers)
console.log('By role:', memberRoles)

// First 10 branches with name + member count
const top = await prisma.branch.findMany({
  take: 15,
  select: { id: true, name: true, _count: { select: { members: true, patients: true } } },
  orderBy: { name: 'asc' },
})
console.log('Sample branches:', JSON.stringify(top, null, 2))

await prisma.$disconnect()
