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

  // Create demo clinic
  const clinic = await prisma.clinic.upsert({
    where: { id: 'demo-clinic-001' },
    update: {},
    create: {
      id: 'demo-clinic-001',
      name: 'SmartChiro Demo Clinic',
      address: '123 Main Street, Kuala Lumpur',
      phone: '+60 12-345 6789',
      email: 'clinic@smartchiro.org',
    },
  })

  console.log(`Seeded clinic: ${clinic.name} (id: ${clinic.id})`)

  // Link user as clinic OWNER
  const membership = await prisma.clinicMember.upsert({
    where: {
      userId_clinicId: { userId: user.id, clinicId: clinic.id },
    },
    update: { role: 'OWNER' },
    create: {
      userId: user.id,
      clinicId: clinic.id,
      role: 'OWNER',
    },
  })

  console.log(`Seeded membership: ${user.email} → ${clinic.name} (${membership.role})`)

  // Set active clinic on user
  await prisma.user.update({
    where: { id: user.id },
    data: { activeClinicId: clinic.id },
  })

  console.log(`Set active clinic for ${user.email}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
