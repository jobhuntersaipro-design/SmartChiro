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

  // ─── Doctors ───
  const doctorsData = [
    {
      id: 'personal-doctor-001',
      email: 'dr.tan.personal@smartchiro.test',
      name: 'Dr. Tan Wei Hong',
      phone: '+60 12-321 4400',
      branchIdx: 0,
      role: 'ADMIN' as const,
      profile: {
        licenseNumber: 'DC-MY-2017-3201',
        specialties: ['Gonstead Technique', 'Sports Chiropractic'],
        yearsExperience: 9,
        education: 'Doctor of Chiropractic, Murdoch University Perth',
        bio: 'Sports-focused chiropractor with experience treating professional athletes.',
        languages: ['English', 'Mandarin', 'Malay'],
        insurancePlans: ['AIA', 'Great Eastern'],
        consultationFee: 160,
        treatmentRoom: 'KLCC Room A',
        workingSchedule: {
          monday: { start: '09:00', end: '18:00' },
          tuesday: { start: '09:00', end: '18:00' },
          wednesday: { start: '09:00', end: '18:00' },
          thursday: { start: '09:00', end: '18:00' },
          friday: { start: '09:00', end: '17:00' },
          saturday: { start: '09:00', end: '13:00' },
        },
      },
    },
    {
      id: 'personal-doctor-002',
      email: 'dr.fatimah.personal@smartchiro.test',
      name: 'Dr. Fatimah Zahra',
      phone: '+60 17-666 8821',
      branchIdx: 1,
      role: 'DOCTOR' as const,
      profile: {
        licenseNumber: 'DC-MY-2019-5610',
        specialties: ['Diversified Technique', 'Prenatal Chiropractic', 'Webster Technique'],
        yearsExperience: 6,
        education: 'Doctor of Chiropractic, IMU Malaysia',
        bio: 'Webster-certified prenatal specialist. Passionate about pregnancy care.',
        languages: ['English', 'Malay'],
        insurancePlans: ['AIA', 'Allianz'],
        consultationFee: 140,
        treatmentRoom: 'Bangsar Room 1',
        workingSchedule: {
          monday: { start: '10:00', end: '19:00' },
          tuesday: { start: '10:00', end: '19:00' },
          wednesday: null,
          thursday: { start: '10:00', end: '19:00' },
          friday: { start: '10:00', end: '18:00' },
          saturday: { start: '10:00', end: '14:00' },
        },
      },
    },
    {
      id: 'personal-doctor-003',
      email: 'dr.suresh.personal@smartchiro.test',
      name: 'Dr. Suresh Menon',
      phone: '+60 16-244 7733',
      branchIdx: 0,
      role: 'DOCTOR' as const,
      profile: {
        licenseNumber: 'DC-MY-2014-1882',
        specialties: ['Thompson Technique', 'Activator Method', 'Geriatric Chiropractic'],
        yearsExperience: 12,
        education: 'Doctor of Chiropractic, RMIT Melbourne',
        bio: 'Senior chiropractor specialising in gentle techniques for elderly patients.',
        languages: ['English', 'Tamil', 'Malay'],
        insurancePlans: ['Great Eastern', 'Prudential', 'AXA'],
        consultationFee: 180,
        treatmentRoom: 'KLCC Room B',
        workingSchedule: {
          monday: { start: '08:00', end: '16:00' },
          tuesday: { start: '08:00', end: '16:00' },
          wednesday: { start: '08:00', end: '16:00' },
          thursday: { start: '08:00', end: '16:00' },
          friday: { start: '08:00', end: '14:00' },
          saturday: null,
        },
      },
    },
  ]

  const doctorUsers: { id: string; name: string; branchIdx: number }[] = []
  for (const d of doctorsData) {
    const user = await prisma.user.upsert({
      where: { id: d.id },
      update: {},
      create: {
        id: d.id,
        email: d.email,
        name: d.name,
        password: hashedPassword,
        phoneNumber: d.phone,
        emailVerified: new Date(),
        activeBranchId: branches[d.branchIdx].id,
      },
    })

    await prisma.branchMember.upsert({
      where: { userId_branchId: { userId: user.id, branchId: branches[d.branchIdx].id } },
      update: { role: d.role },
      create: { userId: user.id, branchId: branches[d.branchIdx].id, role: d.role },
    })

    await prisma.doctorProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        licenseNumber: d.profile.licenseNumber,
        specialties: d.profile.specialties,
        yearsExperience: d.profile.yearsExperience,
        education: d.profile.education,
        bio: d.profile.bio,
        languages: d.profile.languages,
        insurancePlans: d.profile.insurancePlans,
        consultationFee: d.profile.consultationFee,
        treatmentRoom: d.profile.treatmentRoom,
        workingSchedule: d.profile.workingSchedule,
        isActive: true,
      },
    })

    doctorUsers.push({ id: user.id, name: d.name, branchIdx: d.branchIdx })
    console.log(`Seeded doctor: ${d.name} (${d.role} @ ${branches[d.branchIdx].name})`)
  }

  // Owner counts as a doctor too — assigned to first branch
  const allDoctors = [
    { id: owner.id, name: owner.name ?? 'Job Hunter', branchIdx: 0 },
    ...doctorUsers,
  ]

  console.log('\n✓ Task 3 complete (doctors)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
