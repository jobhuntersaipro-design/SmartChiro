import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaNeon({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Find the demo user and branch
  const user = await prisma.user.findUnique({ where: { email: 'demo@smartchiro.org' } })
  if (!user) throw new Error('Demo user not found. Run `npx prisma db seed` first.')

  const branch = await prisma.branch.findFirst({ where: { id: 'demo-branch-001' } })
  if (!branch) throw new Error('Demo branch not found. Run `npx prisma db seed` first.')

  console.log(`Using user: ${user.email}, branch: ${branch.name}\n`)

  const patients = [
    {
      firstName: 'Ahmad',
      lastName: 'Rahman',
      email: 'ahmad.rahman@gmail.com',
      phone: '+60 12-234 5678',
      dateOfBirth: new Date('1985-03-15'),
      gender: 'Male',
      address: '45 Jalan Bukit Bintang, Kuala Lumpur',
      medicalHistory: 'Chronic lower back pain for 3 years. Previous lumbar disc herniation L4-L5. No surgical history.',
      notes: 'Construction worker. Heavy lifting daily. Referred by Dr. Tan.',
    },
    {
      firstName: 'Siti',
      lastName: 'Aminah',
      email: 'siti.aminah@yahoo.com',
      phone: '+60 13-456 7890',
      dateOfBirth: new Date('1992-07-22'),
      gender: 'Female',
      address: '12 Taman Sri Hartamas, Kuala Lumpur',
      medicalHistory: 'Scoliosis diagnosed at age 14 (Cobb angle 22°). Neck stiffness from desk work.',
      notes: 'Software engineer. Sits 10+ hours/day. Interested in posture correction program.',
    },
    {
      firstName: 'Raj',
      lastName: 'Kumar',
      email: 'raj.kumar@outlook.com',
      phone: '+60 16-789 0123',
      dateOfBirth: new Date('1978-11-03'),
      gender: 'Male',
      address: '88 Jalan Ampang, Kuala Lumpur',
      medicalHistory: 'Cervical lordosis loss. Frequent headaches. Previous car accident in 2019 with whiplash injury.',
      notes: 'Uber driver. Spends 8-10 hours driving daily. Follow-up every 2 weeks.',
    },
    {
      firstName: 'Mei Ling',
      lastName: 'Tan',
      email: 'meiling.tan@gmail.com',
      phone: '+60 17-321 4567',
      dateOfBirth: new Date('2001-01-28'),
      gender: 'Female',
      address: '5 Bangsar South, Kuala Lumpur',
      medicalHistory: 'Mild thoracic kyphosis. No prior chiropractic treatment.',
      notes: 'University student. Complains of upper back pain from carrying heavy backpack. First-time patient.',
    },
    {
      firstName: 'Muthu',
      lastName: 'Selvam',
      email: 'muthu.s@hotmail.com',
      phone: '+60 19-876 5432',
      dateOfBirth: new Date('1965-05-10'),
      gender: 'Male',
      address: '33 Petaling Jaya, Selangor',
      medicalHistory: 'Degenerative disc disease L3-L5. Osteoarthritis in both knees. Type 2 diabetes (controlled).',
      notes: 'Retired teacher. Active lifestyle — walks 5km daily. Needs gentle adjustments only.',
    },
  ]

  for (const p of patients) {
    const patient = await prisma.patient.create({
      data: {
        ...p,
        branchId: branch.id,
        doctorId: user.id,
      },
    })
    console.log(`Created patient: ${patient.firstName} ${patient.lastName} (${patient.id})`)

    // Create a visit for each patient
    await prisma.visit.create({
      data: {
        patientId: patient.id,
        doctorId: user.id,
        visitDate: new Date(),
        subjective: `Patient complains of ${p.medicalHistory?.split('.')[0]?.toLowerCase() ?? 'pain'}.`,
        objective: 'Physical examination performed. Palpation and range of motion assessed.',
        assessment: 'Subluxation detected. X-ray recommended for further evaluation.',
        plan: 'Initial X-ray series. Begin treatment plan after X-ray analysis.',
      },
    })
    console.log(`  → Created initial visit`)
  }

  console.log(`\nDone! Created ${patients.length} patients with visits.`)
  console.log('Login as demo@smartchiro.org (password: 12345678) to view them.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
