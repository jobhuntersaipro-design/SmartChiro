import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { hash } from 'bcryptjs'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL!

const adapter = new PrismaNeon({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const hashedPassword = await hash('12345678', 12)

  const user = await prisma.user.upsert({
    where: { email: 'demo@smartchiro.org' },
    update: {},
    create: {
      email: 'demo@smartchiro.org',
      name: 'Demo Wojak',
      password: hashedPassword,
      isPro: false,
      emailVerified: new Date(),
    },
  })

  console.log(`Seeded user: ${user.email} (id: ${user.id})`)

  // Create demo branch
  const branch = await prisma.branch.upsert({
    where: { id: 'demo-branch-001' },
    update: {},
    create: {
      id: 'demo-branch-001',
      name: 'SmartChiro Demo Branch',
      address: '123 Main Street, Kuala Lumpur',
      phone: '+60 12-345 6789',
      email: 'branch@smartchiro.org',
    },
  })

  console.log(`Seeded branch: ${branch.name} (id: ${branch.id})`)

  // Link user as branch OWNER
  const membership = await prisma.branchMember.upsert({
    where: {
      userId_branchId: { userId: user.id, branchId: branch.id },
    },
    update: { role: 'OWNER' },
    create: {
      userId: user.id,
      branchId: branch.id,
      role: 'OWNER',
    },
  })

  console.log(`Seeded membership: ${user.email} → ${branch.name} (${membership.role})`)

  // Set active branch on user
  await prisma.user.update({
    where: { id: user.id },
    data: { activeBranchId: branch.id },
  })

  console.log(`Set active branch for ${user.email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
