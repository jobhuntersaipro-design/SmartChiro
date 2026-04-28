import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { hash } from 'bcryptjs'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error('DATABASE_URL is not set')

const SEED_EMAIL = process.env.SEED_USER_EMAIL
const SEED_PASSWORD = process.env.SEED_USER_PASSWORD
if (!SEED_EMAIL || !SEED_PASSWORD) {
  throw new Error('SEED_USER_EMAIL and SEED_USER_PASSWORD must be set in .env')
}

const adapter = new PrismaNeon({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  const hashedPassword = await hash(SEED_PASSWORD!, 12)

  // ─── Owner ───
  const owner = await prisma.user.upsert({
    where: { email: SEED_EMAIL! },
    update: { password: hashedPassword, emailVerified: new Date() },
    create: {
      email: SEED_EMAIL!,
      name: 'Job Hunter',
      password: hashedPassword,
      isPro: true,
      emailVerified: new Date(),
    },
  })
  console.log(`Seeded owner: ${owner.email} (id: ${owner.id})`)

  // ─── Branches ───
  const branchesData = [
    {
      id: 'personal-branch-001',
      name: 'SmartChiro KLCC',
      address: 'Suite 12-A, Menara KLCC',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      zip: '50088',
      phone: '+60 3-2161 5500',
      email: 'klcc@smartchiro.test',
      ownerName: 'Job Hunter',
      clinicType: 'group',
      operatingHours: 'Mon-Fri 9am-7pm, Sat 9am-2pm',
      treatmentRooms: 5,
      specialties: 'Gonstead, Diversified, Sports Chiropractic',
      insuranceProviders: 'AIA, Great Eastern, Allianz',
    },
    {
      id: 'personal-branch-002',
      name: 'SmartChiro Bangsar',
      address: '88 Jalan Maarof',
      city: 'Bangsar',
      state: 'Wilayah Persekutuan',
      zip: '59000',
      phone: '+60 3-2282 7700',
      email: 'bangsar@smartchiro.test',
      ownerName: 'Job Hunter',
      clinicType: 'group',
      operatingHours: 'Mon-Sat 10am-8pm',
      treatmentRooms: 3,
      specialties: 'Activator, Thompson, Prenatal',
      insuranceProviders: 'AIA, Prudential, AXA',
    },
  ]

  const branches: { id: string; name: string }[] = []
  for (const b of branchesData) {
    const branch = await prisma.branch.upsert({
      where: { id: b.id },
      update: {},
      create: b,
    })
    branches.push({ id: branch.id, name: branch.name })
    console.log(`Seeded branch: ${branch.name}`)
  }

  // Owner is OWNER of both branches; activeBranch = first one
  for (const b of branches) {
    await prisma.branchMember.upsert({
      where: { userId_branchId: { userId: owner.id, branchId: b.id } },
      update: { role: 'OWNER' },
      create: { userId: owner.id, branchId: b.id, role: 'OWNER' },
    })
  }
  await prisma.user.update({
    where: { id: owner.id },
    data: { activeBranchId: branches[0].id },
  })
  console.log(`Linked owner → ${branches.length} branches`)

  console.log('\n✓ Task 2 complete (owner + branches)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
