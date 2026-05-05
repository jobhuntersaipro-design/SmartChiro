import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

const SEED_EMAIL = process.env.SEED_USER_EMAIL
if (!SEED_EMAIL) {
  console.error('SEED_USER_EMAIL not set in .env')
  process.exit(1)
}

const PERSONAL_BRANCH_IDS = ['personal-branch-001', 'personal-branch-002', 'personal-branch-003']
const PERSONAL_DOCTOR_IDS = ['personal-doctor-001', 'personal-doctor-002', 'personal-doctor-003']

const owner = await prisma.user.findUnique({ where: { email: SEED_EMAIL } })
if (!owner) {
  console.error(`Owner not found: ${SEED_EMAIL}`)
  process.exit(1)
}
console.log(`Owner: ${owner.email} (${owner.id})`)

// Restore OWNER memberships for the 3 personal branches
let ownerLinks = 0
for (const branchId of PERSONAL_BRANCH_IDS) {
  const branch = await prisma.branch.findUnique({ where: { id: branchId } })
  if (!branch) {
    console.warn(`  ⚠ Branch ${branchId} not found — skipping`)
    continue
  }
  await prisma.branchMember.upsert({
    where: { userId_branchId: { userId: owner.id, branchId } },
    update: { role: 'OWNER' },
    create: { userId: owner.id, branchId, role: 'OWNER' },
  })
  ownerLinks++
  console.log(`  ✓ ${owner.email} → ${branch.name} (OWNER)`)
}

// Restore DOCTOR memberships (each doctor → one branch by index)
let doctorLinks = 0
for (let i = 0; i < PERSONAL_DOCTOR_IDS.length; i++) {
  const doctor = await prisma.user.findUnique({ where: { id: PERSONAL_DOCTOR_IDS[i] } })
  const branchId = PERSONAL_BRANCH_IDS[i]
  if (!doctor) {
    console.warn(`  ⚠ Doctor ${PERSONAL_DOCTOR_IDS[i]} not found — skipping`)
    continue
  }
  const branch = await prisma.branch.findUnique({ where: { id: branchId } })
  if (!branch) {
    console.warn(`  ⚠ Branch ${branchId} not found — skipping`)
    continue
  }
  await prisma.branchMember.upsert({
    where: { userId_branchId: { userId: doctor.id, branchId } },
    update: { role: 'DOCTOR' },
    create: { userId: doctor.id, branchId, role: 'DOCTOR' },
  })
  doctorLinks++
  console.log(`  ✓ ${doctor.email} → ${branch.name} (DOCTOR)`)
}

// Set activeBranchId so dashboard lands on a real branch
if (!owner.activeBranchId || !PERSONAL_BRANCH_IDS.includes(owner.activeBranchId)) {
  await prisma.user.update({
    where: { id: owner.id },
    data: { activeBranchId: PERSONAL_BRANCH_IDS[0] },
  })
  console.log(`  ✓ Set activeBranchId → personal-branch-001 (KLCC)`)
}

console.log(`\nDone — restored ${ownerLinks} OWNER + ${doctorLinks} DOCTOR memberships`)

// Verify
const verifyUser = await prisma.user.findUnique({
  where: { email: SEED_EMAIL },
  include: { branchMemberships: { include: { branch: { select: { name: true } } } } },
})
console.log('\nVerify:', verifyUser.branchMemberships.map(m => `${m.branch.name} [${m.role}]`).join(', '))

await prisma.$disconnect()
