import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { hash } from 'bcryptjs'
import { config as loadDotenv } from 'dotenv'

// Load .env.test FIRST (so its values win), then .env as fallback for anything missing.
// Without this explicit load, dotenv defaults to .env only and DATABASE_URL_TEST from
// .env.test would be invisible — silently routing the wipe to the prod DB.
loadDotenv({ path: '.env.test' })
loadDotenv()

const connectionString = process.env.DATABASE_URL_TEST
if (!connectionString) {
  throw new Error(
    'DATABASE_URL_TEST is required for e2e seeding. ' +
      'Create a Neon test branch and set it in .env.test — see e2e/README.md. ' +
      'Refusing to fall back to DATABASE_URL because the seed runs destructive deleteMany.',
  )
}
if (!/test/i.test(connectionString) && !/localhost|127\.0\.0\.1/.test(connectionString)) {
  throw new Error(
    'Refusing to seed: DATABASE_URL_TEST must contain "test" or point at localhost. ' +
      'Got: ' +
      connectionString.replace(/:[^:@]+@/, ':****@'),
  )
}

const adapter = new PrismaNeon({ connectionString })
const prisma = new PrismaClient({ adapter })

const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? 'e2e@smartchiro.test'
const E2E_USER_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'e2e-test-password-12345'
const E2E_BRANCH_ID = process.env.E2E_BRANCH_ID ?? 'e2e-test-branch'

export async function seedE2E(): Promise<void> {
  // Wipe WA + reminder state between runs (idempotent)
  await prisma.appointmentReminder.deleteMany({})
  await prisma.waSession.deleteMany({})

  // bcrypt cost 6 — throwaway test password, ~16ms vs ~250ms at cost 12
  const password = await hash(E2E_USER_PASSWORD, 6)
  const user = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: { password, emailVerified: new Date() },
    create: {
      email: E2E_USER_EMAIL,
      name: 'E2E Test User',
      password,
      emailVerified: new Date(),
    },
  })

  const branch = await prisma.branch.upsert({
    where: { id: E2E_BRANCH_ID },
    update: {},
    create: {
      id: E2E_BRANCH_ID,
      name: 'E2E Test Branch',
      ownerName: 'E2E Test User',
    },
  })

  await prisma.branchMember.upsert({
    where: { userId_branchId: { userId: user.id, branchId: branch.id } },
    update: { role: 'OWNER' },
    create: { userId: user.id, branchId: branch.id, role: 'OWNER' },
  })

  await prisma.user.update({
    where: { id: user.id },
    data: { activeBranchId: branch.id },
  })

  // Reminder settings: enabled with 120-min offset (used by reminder-send.spec)
  await prisma.branchReminderSettings.upsert({
    where: { branchId: branch.id },
    update: { enabled: true, offsetsMin: [120], templates: {} },
    create: {
      branchId: branch.id,
      enabled: true,
      offsetsMin: [120],
      templates: {},
    },
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedE2E().then(() => prisma.$disconnect())
}
