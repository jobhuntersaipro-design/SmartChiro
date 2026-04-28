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

  // ─── Visits ───
  // Cleared first to make re-runs idempotent (visits don't have natural unique keys)
  await prisma.visit.deleteMany({
    where: { patient: { id: { startsWith: 'personal-patient-' } } },
  })

  const now = new Date()
  const visitsData = [
    { patientIdx: 0, daysAgo: 2, visitType: 'follow_up', chiefComplaint: 'Lower back pain follow-up', subjective: 'Pain improved from 7/10 to 4/10. Sleeping better.', objective: 'Lumbar ROM improved 30%. L4-L5 still restricted.', assessment: 'Improving lumbar subluxation.', plan: 'Continue Gonstead biweekly.', areasAdjusted: 'L4, L5, SI', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 posterior body', bpSys: 124, bpDia: 80, hr: 70, weight: 75.0, temp: 36.6, recommendations: 'Core stability exercises.', nextVisitDays: 14, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 7, patientComments: 'Much better than before.' } },
    { patientIdx: 0, daysAgo: 16, visitType: 'initial', chiefComplaint: 'Acute lower back pain', subjective: 'Acute LBP after long flight. Pain 7/10.', objective: 'Antalgic posture. Reduced lordosis.', assessment: 'L4-L5 subluxation with disc involvement.', plan: 'Gonstead L4-L5. Ice protocol.', areasAdjusted: 'L4, L5', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 left rotation', bpSys: 134, bpDia: 86, hr: 78, weight: 75.5, temp: 36.5, recommendations: 'Ice 15min every 2 hrs. Avoid prolonged sitting.', nextVisitDays: 14, q: { painLevel: 7, mobilityScore: 3, sleepQuality: 4, dailyFunction: 4, overallImprovement: 3, patientComments: 'Pain quite bad after the flight.' } },
    { patientIdx: 1, daysAgo: 5, visitType: 'follow_up', chiefComplaint: 'Neck pain & headaches', subjective: 'Headaches reduced from daily to 2x/week.', objective: 'Cervical ROM improved.', assessment: 'Improving cervicogenic headaches.', plan: 'Continue diversified.', areasAdjusted: 'C4, C5, C6', techniqueUsed: 'Diversified', subluxationFindings: 'C4-C5 left lateral flexion restriction', bpSys: 110, bpDia: 70, hr: 64, weight: 54.0, temp: 36.4, recommendations: 'Screen breaks every 20 min.', nextVisitDays: 10, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 6, dailyFunction: 7, overallImprovement: 6, patientComments: 'Headaches getting better.' } },
    { patientIdx: 2, daysAgo: 1, visitType: 'follow_up', chiefComplaint: 'Maintenance visit', subjective: 'Mild thoracic stiffness.', objective: 'T5-T7 fixation.', assessment: 'Stable thoracic pattern.', plan: 'Thompson adjustment.', areasAdjusted: 'T5, T6, T7', techniqueUsed: 'Thompson', subluxationFindings: 'T5-T7 bilateral restriction', bpSys: 120, bpDia: 78, hr: 66, weight: 72.0, temp: 36.5, recommendations: 'Posture breaks at work.', nextVisitDays: 14, q: { painLevel: 2, mobilityScore: 8, sleepQuality: 8, dailyFunction: 9, overallImprovement: 8, patientComments: 'Feeling great.' } },
    { patientIdx: 3, daysAgo: 3, visitType: 'follow_up', chiefComplaint: 'Prenatal Webster technique', subjective: 'Sciatic pain much improved. 32 weeks.', objective: 'SI dysfunction right.', assessment: 'Pregnancy-related SI dysfunction.', plan: 'Continue Webster weekly.', areasAdjusted: 'SI joint, Sacrum', techniqueUsed: 'Diversified', subluxationFindings: 'Right SI posterior', bpSys: 116, bpDia: 72, hr: 82, weight: 72.0, temp: 36.7, recommendations: 'Pelvic support belt.', nextVisitDays: 7, q: { painLevel: 3, mobilityScore: 6, sleepQuality: 5, dailyFunction: 7, overallImprovement: 7, patientComments: 'Sciatica much better.' } },
    { patientIdx: 4, daysAgo: 4, visitType: 'follow_up', chiefComplaint: 'Sports rehab progress', subjective: 'Disc symptoms stable. Training at 70% intensity.', objective: 'SLR 60° (improved from 45°).', assessment: 'L4-L5 disc improving.', plan: 'Adjustment + shoulder girdle work.', areasAdjusted: 'L4, L5, R shoulder', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 improving', bpSys: 122, bpDia: 75, hr: 58, weight: 80.0, temp: 36.6, recommendations: 'Progress to 80% training. Rotator cuff exercises.', nextVisitDays: 7, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 8, dailyFunction: 8, overallImprovement: 8, patientComments: 'Feeling strong.' } },
    { patientIdx: 5, daysAgo: 6, visitType: 'follow_up', chiefComplaint: 'Stress-related neck tension', subjective: 'Tension still present after long meetings.', objective: 'Atlas laterality right.', assessment: 'Stress-related cervical pattern.', plan: 'Atlas adjustment. Stress management.', areasAdjusted: 'C1, C2', techniqueUsed: 'Gonstead', subluxationFindings: 'Atlas right', bpSys: 130, bpDia: 84, hr: 76, weight: 60.0, temp: 36.5, recommendations: 'Reduce caffeine.', nextVisitDays: 10, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 5, dailyFunction: 7, overallImprovement: 6 } },
    { patientIdx: 6, daysAgo: 8, visitType: 'follow_up', chiefComplaint: 'Cervical maintenance post-fusion', subjective: 'Neck stiffness improved.', objective: 'C5-C6 fusion stable.', assessment: 'Stable post-surgical cervical.', plan: 'Activator C3-C4, C7-T1.', areasAdjusted: 'C3, C4, C7, T1', techniqueUsed: 'Activator', subluxationFindings: 'C3-C4 restriction', bpSys: 140, bpDia: 86, hr: 70, weight: 68.0, temp: 36.5, recommendations: 'Gentle stretches only.', nextVisitDays: 14, q: { painLevel: 3, mobilityScore: 5, sleepQuality: 6, dailyFunction: 6, overallImprovement: 6, patientComments: 'Better than before.' } },
    { patientIdx: 7, daysAgo: 9, visitType: 'initial', chiefComplaint: 'Tension headaches and study posture', subjective: 'Daily headaches during exam period.', objective: 'Suboccipital tension. C1-C2 restriction.', assessment: 'Cervicogenic headaches.', plan: 'Cervical adjustment. Study posture education.', areasAdjusted: 'C1, C2, C3', techniqueUsed: 'Diversified', subluxationFindings: 'C1 right lateral, C2-C3 fixation', bpSys: 110, bpDia: 70, hr: 68, weight: 50.0, recommendations: 'Study breaks every 45 min.', nextVisitDays: 7, q: { painLevel: 6, mobilityScore: 5, sleepQuality: 4, dailyFunction: 6, overallImprovement: 4 } },
    { patientIdx: 8, daysAgo: 10, visitType: 'initial', chiefComplaint: 'Travel-related lumbar pain', subjective: 'LBP after 14-hour flights.', objective: 'Tight lumbar paraspinals.', assessment: 'Travel-related lumbar dysfunction.', plan: 'Gonstead. Travel ergonomics.', areasAdjusted: 'L4, L5', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 fixation', bpSys: 128, bpDia: 80, hr: 72, weight: 82.0, recommendations: 'Inflight stretches. Lumbar pillow.', nextVisitDays: 14 },
    { patientIdx: 9, daysAgo: 7, visitType: 'initial', chiefComplaint: 'Text neck and mouse shoulder', subjective: 'Neck hurts after long design sessions.', objective: 'Forward head posture.', assessment: 'Postural distortion.', plan: 'Postural correction. Workstation review.', areasAdjusted: 'C5, C6, T1, R shoulder', techniqueUsed: 'Diversified', recommendations: 'Monitor height raise. 20-20-20 rule.', nextVisitDays: 14, q: { painLevel: 5, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 5, patientComments: 'Posture is bad.' } },
    { patientIdx: 10, daysAgo: 11, visitType: 'initial', chiefComplaint: 'Sciatica and hip tightness', subjective: 'Right-side sciatica.', objective: 'Positive SLR 50° right.', assessment: 'L5-S1 with sciatic irritation.', plan: 'Gonstead. Piriformis release.', areasAdjusted: 'L5, S1, R piriformis', techniqueUsed: 'Gonstead', subluxationFindings: 'L5-S1 right posterior body', bpSys: 134, bpDia: 86, hr: 76, weight: 70.0, recommendations: 'Piriformis stretch 3x daily.', nextVisitDays: 4, q: { painLevel: 7, mobilityScore: 4, sleepQuality: 5, dailyFunction: 4, overallImprovement: 3, patientComments: 'Pain wakes me at night.' } },
    { patientIdx: 11, daysAgo: 12, visitType: 'follow_up', chiefComplaint: 'Upper back pain', subjective: 'Improving after last session.', objective: 'T2-T3 still restricted.', assessment: 'Improving thoracic pattern.', plan: 'Continue weekly.', areasAdjusted: 'T2, T3', techniqueUsed: 'Diversified', bpSys: 116, bpDia: 72, hr: 64, weight: 56.0, recommendations: 'Stretch routine.', nextVisitDays: 14, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 7, dailyFunction: 8, overallImprovement: 7 } },
    { patientIdx: 12, daysAgo: 14, visitType: 'initial', chiefComplaint: 'Plantar fasciitis & low back pain', subjective: 'Feet hurt waking up.', objective: 'Plantar fascia tenderness.', assessment: 'Foot-back biomechanical chain dysfunction.', plan: 'Lumbar adjustment. Foot mobilisation.', areasAdjusted: 'L5, SI, Both feet', techniqueUsed: 'Diversified', recommendations: 'Arch supports. Anti-fatigue mats.', nextVisitDays: 7 },
    { patientIdx: 13, daysAgo: 6, visitType: 'initial', chiefComplaint: 'Hip impingement and posture optimisation', subjective: 'Tight hips after teaching all day.', objective: 'Bilateral hip flexor tightness.', assessment: 'Functional hip impingement.', plan: 'Hip mobility work.', areasAdjusted: 'Bilateral hips, L5', techniqueUsed: 'Diversified', subluxationFindings: 'Hip flexor tightness', bpSys: 110, bpDia: 68, hr: 56, weight: 54.0, recommendations: 'Hip mobility routine 2x daily.', nextVisitDays: 7, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 8, dailyFunction: 8, overallImprovement: 6 } },
    { patientIdx: 14, daysAgo: 25, visitType: 'follow_up', chiefComplaint: 'Lumbar maintenance', subjective: 'Stable. No new complaints.', objective: 'Mild lumbar stiffness.', assessment: 'Stable elderly lumbar pattern.', plan: 'Activator monthly.', areasAdjusted: 'L3, L4', techniqueUsed: 'Activator', bpSys: 144, bpDia: 86, hr: 78, weight: 65.0, recommendations: 'Daily walking.', nextVisitDays: 30 },
  ]

  let visitCount = 0
  let qCount = 0
  for (const v of visitsData) {
    const vAny = v as Record<string, unknown>
    const patientId = `personal-patient-${String(v.patientIdx + 1).padStart(3, '0')}`
    const patient = patientsData[v.patientIdx]
    const doctor = allDoctors[patient.doctorIdx]
    const visitDate = new Date(now)
    visitDate.setDate(visitDate.getDate() - v.daysAgo)

    const q = vAny.q as
      | { painLevel: number; mobilityScore: number; sleepQuality: number; dailyFunction: number; overallImprovement: number; patientComments?: string }
      | undefined

    await prisma.visit.create({
      data: {
        visitDate,
        visitType: v.visitType,
        chiefComplaint: v.chiefComplaint,
        subjective: (vAny.subjective as string | undefined) ?? null,
        objective: (vAny.objective as string | undefined) ?? null,
        assessment: (vAny.assessment as string | undefined) ?? null,
        plan: (vAny.plan as string | undefined) ?? null,
        areasAdjusted: v.areasAdjusted,
        techniqueUsed: v.techniqueUsed,
        subluxationFindings: (vAny.subluxationFindings as string | undefined) ?? null,
        bloodPressureSys: (vAny.bpSys as number | undefined) ?? null,
        bloodPressureDia: (vAny.bpDia as number | undefined) ?? null,
        heartRate: (vAny.hr as number | undefined) ?? null,
        weight: (vAny.weight as number | undefined) ?? null,
        temperature: (vAny.temp as number | undefined) ?? null,
        recommendations: (vAny.recommendations as string | undefined) ?? null,
        nextVisitDays: (vAny.nextVisitDays as number | undefined) ?? null,
        patientId,
        doctorId: doctor.id,
        ...(q
          ? {
              questionnaire: {
                create: {
                  painLevel: q.painLevel,
                  mobilityScore: q.mobilityScore,
                  sleepQuality: q.sleepQuality,
                  dailyFunction: q.dailyFunction,
                  overallImprovement: q.overallImprovement,
                  patientComments: q.patientComments ?? null,
                },
              },
            }
          : {}),
      },
    })
    visitCount++
    if (q) qCount++
  }
  console.log(`Seeded ${visitCount} visits (${qCount} with questionnaires)`)

  console.log('\n✓ Task 5 complete (visits)')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
