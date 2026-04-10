import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Test connection by counting users
  const userCount = await prisma.user.count()
  console.log(`Users: ${userCount}`)

  // Create a test user
  const user = await prisma.user.create({
    data: {
      email: 'test@smartchiro.com',
      name: 'Test User',
    },
  })
  console.log('Created user:', user)

  // Create a test branch
  const branch = await prisma.branch.create({
    data: {
      name: 'Test Branch',
      address: '123 Main St',
      phone: '+60123456789',
    },
  })
  console.log('Created branch:', branch)

  // Link user to branch as OWNER
  const membership = await prisma.branchMember.create({
    data: {
      userId: user.id,
      branchId: branch.id,
      role: 'OWNER',
    },
  })
  console.log('Created membership:', membership)

  // Create a test patient
  const patient = await prisma.patient.create({
    data: {
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      branchId: branch.id,
      doctorId: user.id,
    },
  })
  console.log('Created patient:', patient)

  // Verify relations
  const branchWithMembers = await prisma.branch.findUnique({
    where: { id: branch.id },
    include: {
      members: { include: { user: true } },
      patients: true,
    },
  })
  console.log('\nBranch with relations:', JSON.stringify(branchWithMembers, null, 2))

  // Clean up test data
  await prisma.patient.delete({ where: { id: patient.id } })
  await prisma.branchMember.delete({ where: { id: membership.id } })
  await prisma.branch.delete({ where: { id: branch.id } })
  await prisma.user.delete({ where: { id: user.id } })
  console.log('\nTest data cleaned up.')
}

main()
  .catch((e) => {
    console.error('Error:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
