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

  // Create a test clinic
  const clinic = await prisma.clinic.create({
    data: {
      name: 'Test Clinic',
      address: '123 Main St',
      phone: '+60123456789',
    },
  })
  console.log('Created clinic:', clinic)

  // Link user to clinic as OWNER
  const membership = await prisma.clinicMember.create({
    data: {
      userId: user.id,
      clinicId: clinic.id,
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
      clinicId: clinic.id,
    },
  })
  console.log('Created patient:', patient)

  // Verify relations
  const clinicWithMembers = await prisma.clinic.findUnique({
    where: { id: clinic.id },
    include: {
      members: { include: { user: true } },
      patients: true,
    },
  })
  console.log('\nClinic with relations:', JSON.stringify(clinicWithMembers, null, 2))

  // Clean up test data
  await prisma.patient.delete({ where: { id: patient.id } })
  await prisma.clinicMember.delete({ where: { id: membership.id } })
  await prisma.clinic.delete({ where: { id: clinic.id } })
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
