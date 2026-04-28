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

  // ─── Patients ───
  // doctorIdx: 0=owner, 1=Dr.Tan(KLCC), 2=Dr.Fatimah(Bangsar), 3=Dr.Suresh(KLCC)
  const patientsData = [
    { firstName: 'Adam', lastName: 'bin Yusoff', email: 'adam.yusoff.jh@example.com', phone: '+60 11-2200 0001', icNumber: '880101-14-1101', dob: new Date('1988-01-01'), gender: 'Male', occupation: 'Software Architect', race: 'Malay', maritalStatus: 'Married', bloodType: 'O+', allergies: null, referralSource: 'Google Search', addressLine1: '20, Jalan Pinang', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50450', emergencyName: 'Aishah Yusoff', emergencyPhone: '+60 12-300 1101', emergencyRelation: 'Wife', medicalHistory: 'Lower back pain from desk work. No prior chiropractic treatment.', notes: 'Prefers morning slots. Tech worker.', status: 'active', doctorIdx: 1, branchIdx: 0 },
    { firstName: 'Bella', lastName: 'Chong', email: 'bella.chong.jh@example.com', phone: '+60 11-2200 0002', icNumber: '930512-10-2202', dob: new Date('1993-05-12'), gender: 'Female', occupation: 'UX Designer', race: 'Chinese', maritalStatus: 'Single', bloodType: 'A+', allergies: 'Penicillin', referralSource: 'Friend', addressLine1: '8, Jalan SS21/1', city: 'Petaling Jaya', state: 'Selangor', postcode: '47400', emergencyName: 'Chong Wei', emergencyPhone: '+60 12-300 1102', emergencyRelation: 'Brother', medicalHistory: 'Neck pain and tension headaches.', notes: 'First-time patient. Anxious about adjustments.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    { firstName: 'Carlos', lastName: 'Devaraj', email: 'carlos.devaraj.jh@example.com', phone: '+60 11-2200 0003', icNumber: '760822-08-3303', dob: new Date('1976-08-22'), gender: 'Male', occupation: 'Architect', race: 'Indian', maritalStatus: 'Married', bloodType: 'B+', allergies: null, referralSource: 'Wife is a patient', addressLine1: '14, Lorong Maarof', city: 'Bangsar', state: 'Wilayah Persekutuan', postcode: '59000', emergencyName: 'Anita Devaraj', emergencyPhone: '+60 12-300 1103', emergencyRelation: 'Wife', medicalHistory: 'Chronic thoracic stiffness. Cervical spondylosis.', notes: 'Comes biweekly for maintenance.', status: 'active', doctorIdx: 3, branchIdx: 0 },
    { firstName: 'Diana', lastName: 'Ng', email: 'diana.ng.jh@example.com', phone: '+60 11-2200 0004', icNumber: '910630-14-4404', dob: new Date('1991-06-30'), gender: 'Female', occupation: 'Nurse', race: 'Chinese', maritalStatus: 'Married', bloodType: 'AB+', allergies: null, referralSource: 'Hospital colleague', addressLine1: '3, Jalan Tun Razak', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50400', emergencyName: 'Ng Boon Hock', emergencyPhone: '+60 12-300 1104', emergencyRelation: 'Husband', medicalHistory: '32 weeks pregnant. SI joint dysfunction.', notes: 'Webster Technique referral.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    { firstName: 'Ethan', lastName: 'bin Hashim', email: 'ethan.hashim.jh@example.com', phone: '+60 11-2200 0005', icNumber: '960215-01-5505', dob: new Date('1996-02-15'), gender: 'Male', occupation: 'Personal Trainer', race: 'Malay', maritalStatus: 'Single', bloodType: 'O+', allergies: null, referralSource: 'Instagram', addressLine1: '11, Jalan Ampang', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50450', emergencyName: 'Hashim bin Daud', emergencyPhone: '+60 12-300 1105', emergencyRelation: 'Father', medicalHistory: 'Sports injury — herniated disc L4-L5. Rotator cuff strain.', notes: 'Active lifestyle. Wants sports rehab program.', status: 'active', doctorIdx: 1, branchIdx: 0 },
    { firstName: 'Farah', lastName: 'Hassan', email: 'farah.hassan.jh@example.com', phone: '+60 11-2200 0006', icNumber: '850903-14-6606', dob: new Date('1985-09-03'), gender: 'Female', occupation: 'Marketing Director', race: 'Malay', maritalStatus: 'Married', bloodType: 'A-', allergies: 'Ibuprofen', referralSource: 'Google Search', addressLine1: '7, Persiaran KLCC', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50088', emergencyName: 'Hassan bin Omar', emergencyPhone: '+60 12-300 1106', emergencyRelation: 'Husband', medicalHistory: 'Chronic stress-related neck and shoulder tension.', notes: 'Executive client. Prefers Saturday slots.', status: 'active', doctorIdx: 0, branchIdx: 0 },
    { firstName: 'Gerald', lastName: 'Liew', email: 'gerald.liew.jh@example.com', phone: '+60 11-2200 0007', icNumber: '680407-07-7707', dob: new Date('1968-04-07'), gender: 'Male', occupation: 'Retired Engineer', race: 'Chinese', maritalStatus: 'Married', bloodType: 'B-', allergies: 'Aspirin', referralSource: 'Daughter', addressLine1: '22, Jalan Bangsar', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '59200', emergencyName: 'Liew Kar Mun', emergencyPhone: '+60 12-300 1107', emergencyRelation: 'Daughter', medicalHistory: 'Degenerative disc disease. Previous cervical fusion C5-C6.', notes: 'Gentle technique only.', status: 'active', doctorIdx: 3, branchIdx: 0 },
    { firstName: 'Hana', lastName: 'binti Ramli', email: 'hana.ramli.jh@example.com', phone: '+60 11-2200 0008', icNumber: '020730-14-8808', dob: new Date('2002-07-30'), gender: 'Female', occupation: 'University Student', race: 'Malay', maritalStatus: 'Single', bloodType: 'A+', allergies: null, referralSource: 'University clinic', addressLine1: '5, Jalan Universiti', city: 'Petaling Jaya', state: 'Selangor', postcode: '46200', emergencyName: 'Ramli bin Ali', emergencyPhone: '+60 12-300 1108', emergencyRelation: 'Father', medicalHistory: 'Poor study posture. Tension headaches.', notes: 'Student rate.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    { firstName: 'Ian', lastName: 'McKenzie', email: 'ian.mckenzie.jh@example.com', phone: '+60 11-2200 0009', icNumber: '770612-10-9909', dob: new Date('1977-06-12'), gender: 'Male', occupation: 'Expat Consultant', race: 'Other', maritalStatus: 'Married', bloodType: 'O+', allergies: null, referralSource: 'Hotel concierge', addressLine1: '88, Jalan Sultan Ismail', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50250', emergencyName: 'Sarah McKenzie', emergencyPhone: '+60 12-300 1109', emergencyRelation: 'Wife', medicalHistory: 'Travel-related lumbar pain. Long-haul flights frequent.', notes: 'Prefers English-speaking doctor.', status: 'active', doctorIdx: 1, branchIdx: 0 },
    { firstName: 'Jasmine', lastName: 'Lim', email: 'jasmine.lim.jh@example.com', phone: '+60 11-2200 0010', icNumber: '981125-14-1010', dob: new Date('1998-11-25'), gender: 'Female', occupation: 'Graphic Designer', race: 'Chinese', maritalStatus: 'Single', bloodType: 'O+', allergies: null, referralSource: 'TikTok', addressLine1: '14, Jalan Imbi', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '55100', emergencyName: 'Lim Ah Beng', emergencyPhone: '+60 12-300 1110', emergencyRelation: 'Father', medicalHistory: 'Text neck syndrome. Right wrist carpal tunnel signs.', notes: 'Digital creative.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    { firstName: 'Kishore', lastName: 'Pillai', email: 'kishore.pillai.jh@example.com', phone: '+60 11-2200 0011', icNumber: '820318-07-1111', dob: new Date('1982-03-18'), gender: 'Male', occupation: 'E-hailing Driver', race: 'Indian', maritalStatus: 'Married', bloodType: 'A+', allergies: null, referralSource: 'Family', addressLine1: '17, Jalan Sentul', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '51000', emergencyName: 'Lakshmi Pillai', emergencyPhone: '+60 12-300 1111', emergencyRelation: 'Wife', medicalHistory: 'Right-side sciatica. Hip flexor tightness.', notes: 'Walk-in preferred — irregular hours.', status: 'active', doctorIdx: 3, branchIdx: 0 },
    { firstName: 'Lina', lastName: 'binti Salleh', email: 'lina.salleh.jh@example.com', phone: '+60 11-2200 0012', icNumber: '900418-14-1212', dob: new Date('1990-04-18'), gender: 'Female', occupation: 'Flight Attendant', race: 'Malay', maritalStatus: 'Married', bloodType: 'B+', allergies: null, referralSource: 'Crew member', addressLine1: '28, Jalan Kia Peng', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50450', emergencyName: 'Salleh bin Ahmad', emergencyPhone: '+60 12-300 1112', emergencyRelation: 'Husband', medicalHistory: 'Upper back pain from luggage handling. Jet lag tension.', notes: 'Travel-heavy schedule.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    { firstName: 'Marcus', lastName: 'Wong', email: 'marcus.wong.jh@example.com', phone: '+60 11-2200 0013', icNumber: '730922-10-1313', dob: new Date('1973-09-22'), gender: 'Male', occupation: 'Restaurant Owner', race: 'Chinese', maritalStatus: 'Married', bloodType: 'O-', allergies: null, referralSource: 'Walk-in', addressLine1: '11, Jalan Alor', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50200', emergencyName: 'Wong Mei', emergencyPhone: '+60 12-300 1113', emergencyRelation: 'Wife', medicalHistory: 'Prolonged standing — plantar fasciitis. Lower back pain.', notes: 'Only available before 11am or Mondays.', status: 'active', doctorIdx: 3, branchIdx: 0 },
    { firstName: 'Nadia', lastName: 'binti Karim', email: 'nadia.karim.jh@example.com', phone: '+60 11-2200 0014', icNumber: '951030-14-1414', dob: new Date('1995-10-30'), gender: 'Female', occupation: 'Pilates Instructor', race: 'Malay', maritalStatus: 'Single', bloodType: 'A+', allergies: null, referralSource: 'Studio recommendation', addressLine1: '2, Jalan Bangsar Utama', city: 'Bangsar', state: 'Wilayah Persekutuan', postcode: '59100', emergencyName: 'Karim bin Hassan', emergencyPhone: '+60 12-300 1114', emergencyRelation: 'Father', medicalHistory: 'Hip impingement. Posture optimisation.', notes: 'Fitness professional. Wants performance-focused care.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    { firstName: 'Oliver', lastName: 'Tan', email: 'oliver.tan.jh@example.com', phone: '+60 11-2200 0015', icNumber: '670211-10-1515', dob: new Date('1967-02-11'), gender: 'Male', occupation: 'Retired Banker', race: 'Chinese', maritalStatus: 'Widowed', bloodType: 'B+', allergies: 'Codeine', referralSource: 'Newspaper ad', addressLine1: '6, Jalan Damansara', city: 'Petaling Jaya', state: 'Selangor', postcode: '47400', emergencyName: 'Tan Jing Wei', emergencyPhone: '+60 12-300 1115', emergencyRelation: 'Son', medicalHistory: 'Mild kyphosis. Lumbar stiffness. Hypertension (controlled).', notes: 'VIP — punctuality important.', status: 'inactive', doctorIdx: 3, branchIdx: 0 },
  ]

  const pricingTiers = [
    { initial: 280, first: 200, followup: 130 },
    { initial: 320, first: 220, followup: 150 },
    { initial: 240, first: 170, followup: 110 },
    null,
  ]

  let patientCount = 0
  for (const p of patientsData) {
    const doctor = allDoctors[p.doctorIdx]
    const pricing = pricingTiers[patientCount % pricingTiers.length]
    const id = `personal-patient-${String(patientCount + 1).padStart(3, '0')}`

    await prisma.patient.upsert({
      where: { id },
      update: {},
      create: {
        id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        icNumber: p.icNumber,
        dateOfBirth: p.dob,
        gender: p.gender,
        occupation: p.occupation,
        race: p.race,
        maritalStatus: p.maritalStatus,
        bloodType: p.bloodType,
        allergies: p.allergies,
        referralSource: p.referralSource,
        initialTreatmentFee: pricing?.initial ?? null,
        firstTreatmentFee: pricing?.first ?? null,
        standardFollowUpFee: pricing?.followup ?? null,
        addressLine1: p.addressLine1,
        city: p.city,
        state: p.state,
        postcode: p.postcode,
        country: 'Malaysia',
        emergencyName: p.emergencyName,
        emergencyPhone: p.emergencyPhone,
        emergencyRelation: p.emergencyRelation,
        medicalHistory: p.medicalHistory,
        notes: p.notes,
        status: p.status,
        branchId: branches[p.branchIdx].id,
        doctorId: doctor.id,
      },
    })
    patientCount++
  }
  console.log(`Seeded ${patientCount} patients`)

  console.log('\n✓ Task 4 complete (patients)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
