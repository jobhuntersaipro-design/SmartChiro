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
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
