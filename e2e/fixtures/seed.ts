// NOTE: this file imports ONLY from @prisma/* on purpose. Playwright's test
// transformer mis-handles CJS conditional exports for several common packages
// (bcryptjs, dotenv) when they're imported at module top-level here, throwing
// "exports is not defined in ES module scope" on test discovery. Workarounds:
// (a) the bcrypt password hash is precomputed and embedded as a constant, and
// (b) dotenv loading is the responsibility of playwright.config.ts (which runs
// in a normal Node ESM context where dotenv works fine). The standalone-run
// path at the bottom of this file dynamically imports dotenv so tsx-direct
// invocation still loads .env.test.
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

// Hash of the literal string 'e2e-test-password-12345' at bcrypt cost 6.
// Regenerate via:
//   node -e "(async()=>console.log(await require('bcryptjs').hash('PASSWORD', 6)))()"
// and update if E2E_USER_PASSWORD changes.
const E2E_PASSWORD_HASH =
  '$2b$06$0KrKv7/MWH4fVzmZ7WCPf.LyYp2KvuIOoz.emO.JQszW.Je8KC/5y'

function assertSafeConnectionString(s: string | undefined): asserts s is string {
  if (!s) {
    throw new Error(
      'DATABASE_URL_TEST is required for e2e seeding. ' +
        'Set it in .env.test to a non-prod Neon branch — see e2e/README.md. ' +
        'Refusing to fall back to DATABASE_URL because the seed runs destructive deleteMany.',
    )
  }
  // Note: we deliberately don't substring-match the URL. Neon endpoints are
  // random adjective-noun hashes that don't carry the branch name, so a
  // "test"/"dev" check would be useless theatre. The real safety is the
  // operator manually pasting the dev-branch URL into .env.test (an explicit
  // opt-in) and the no-fallback rule above. If you want belt-and-suspenders,
  // use Neon's IAM to give .env.test creds read-write only on the dev branch.
}

const E2E_USER_EMAIL = process.env.E2E_USER_EMAIL ?? 'e2e@smartchiro.test'
// E2E_USER_PASSWORD is read by auth.setup.ts to fill the login form. The hash
// stored in the user row is E2E_PASSWORD_HASH above — the two MUST stay in sync.
const E2E_BRANCH_ID = process.env.E2E_BRANCH_ID ?? 'e2e-test-branch'

export async function seedE2E(): Promise<void> {
  const connectionString = process.env.DATABASE_URL_TEST
  assertSafeConnectionString(connectionString)

  const adapter = new PrismaNeon({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    // Wipe WA + reminder state between runs (idempotent)
    await prisma.appointmentReminder.deleteMany({})
    await prisma.waSession.deleteMany({})

    const password = E2E_PASSWORD_HASH
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
  } finally {
    await prisma.$disconnect()
  }
}

// (Standalone CLI removed — Playwright's TS transformer can't handle
// `import.meta.url` in this file's module context. Operators who want to seed
// from the command line use the separate entry: `e2e/fixtures/seed-cli.ts`.)
