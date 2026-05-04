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
    {
      id: 'personal-branch-003',
      name: 'SmartChiro Penang Georgetown',
      address: '102 Lebuh Pantai',
      city: 'George Town',
      state: 'Pulau Pinang',
      zip: '10300',
      phone: '+60 4-261 8800',
      email: 'penang@smartchiro.test',
      ownerName: 'Job Hunter',
      clinicType: 'group',
      operatingHours: 'Mon-Fri 9am-7pm, Sat 9am-3pm',
      treatmentRooms: 4,
      specialties: 'Gonstead, Diversified, Geriatric, Sports',
      insuranceProviders: 'AIA, Great Eastern, AXA',
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
    {
      id: 'personal-doctor-004',
      email: 'dr.lee.personal@smartchiro.test',
      name: 'Dr. Lee Mei Han',
      phone: '+60 12-887 5544',
      branchIdx: 1,
      role: 'ADMIN' as const,
      profile: {
        licenseNumber: 'DC-MY-2016-2745',
        specialties: ['Activator Method', 'Pediatric Chiropractic', 'Functional Movement'],
        yearsExperience: 10,
        education: 'Doctor of Chiropractic, AECC University College UK',
        bio: 'Activator-certified pediatric specialist. Loves working with families.',
        languages: ['English', 'Mandarin', 'Cantonese', 'Malay'],
        insurancePlans: ['AIA', 'Prudential', 'AXA'],
        consultationFee: 150,
        treatmentRoom: 'Bangsar Room 2',
        workingSchedule: {
          monday: { start: '10:00', end: '19:00' },
          tuesday: null,
          wednesday: { start: '10:00', end: '19:00' },
          thursday: { start: '10:00', end: '19:00' },
          friday: { start: '10:00', end: '18:00' },
          saturday: { start: '10:00', end: '14:00' },
        },
      },
    },
    {
      id: 'personal-doctor-005',
      email: 'dr.gopal.personal@smartchiro.test',
      name: 'Dr. Gopal Krishnan',
      phone: '+60 17-433 9988',
      branchIdx: 2,
      role: 'ADMIN' as const,
      profile: {
        licenseNumber: 'DC-MY-2013-0921',
        specialties: ['Gonstead Technique', 'Sports Chiropractic', 'Spinal Decompression'],
        yearsExperience: 13,
        education: 'Doctor of Chiropractic, Macquarie University Sydney',
        bio: 'Penang-based senior chiropractor. Former team chiropractor for Penang FA.',
        languages: ['English', 'Tamil', 'Malay', 'Hokkien'],
        insurancePlans: ['AIA', 'Great Eastern', 'AXA'],
        consultationFee: 170,
        treatmentRoom: 'Penang Room 1',
        workingSchedule: {
          monday: { start: '09:00', end: '18:00' },
          tuesday: { start: '09:00', end: '18:00' },
          wednesday: { start: '09:00', end: '18:00' },
          thursday: { start: '09:00', end: '18:00' },
          friday: { start: '09:00', end: '17:00' },
          saturday: { start: '09:00', end: '14:00' },
        },
      },
    },
    {
      id: 'personal-doctor-006',
      email: 'dr.khoo.personal@smartchiro.test',
      name: 'Dr. Khoo Sze Yuan',
      phone: '+60 16-779 2233',
      branchIdx: 2,
      role: 'DOCTOR' as const,
      profile: {
        licenseNumber: 'DC-MY-2021-7102',
        specialties: ['Diversified Technique', 'Postural Rehabilitation', 'Headache Management'],
        yearsExperience: 4,
        education: 'Doctor of Chiropractic, IMU Malaysia',
        bio: 'Younger chiropractor focused on postural correction and tension headaches.',
        languages: ['English', 'Mandarin', 'Hokkien', 'Malay'],
        insurancePlans: ['AIA', 'Prudential'],
        consultationFee: 130,
        treatmentRoom: 'Penang Room 2',
        workingSchedule: {
          monday: { start: '10:00', end: '19:00' },
          tuesday: { start: '10:00', end: '19:00' },
          wednesday: { start: '10:00', end: '19:00' },
          thursday: null,
          friday: { start: '10:00', end: '18:00' },
          saturday: { start: '09:00', end: '14:00' },
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
  // doctorIdx: 0=owner(KLCC), 1=Dr.Tan(KLCC), 2=Dr.Fatimah(Bangsar), 3=Dr.Suresh(KLCC),
  //           4=Dr.Lee(Bangsar), 5=Dr.Gopal(Penang), 6=Dr.Khoo(Penang)
  // branchIdx: 0=KLCC, 1=Bangsar, 2=Penang
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
    // ─── Bangsar branch (more) ───
    { firstName: 'Priscilla', lastName: 'Chew', email: 'priscilla.chew.jh@example.com', phone: '+60 11-2200 0016', icNumber: '870825-14-1616', dob: new Date('1987-08-25'), gender: 'Female', occupation: 'Lawyer', race: 'Chinese', maritalStatus: 'Married', bloodType: 'A+', allergies: null, referralSource: 'Google Search', addressLine1: '12, Jalan Telawi 5', city: 'Bangsar', state: 'Wilayah Persekutuan', postcode: '59100', emergencyName: 'Chew Boon Lim', emergencyPhone: '+60 12-300 1116', emergencyRelation: 'Husband', medicalHistory: 'TMJ tension. Cervical strain from desk work.', notes: 'High-stress job. Prefers evening slots.', status: 'active', doctorIdx: 4, branchIdx: 1 },
    { firstName: 'Razak', lastName: 'bin Ibrahim', email: 'razak.ibrahim.jh@example.com', phone: '+60 11-2200 0017', icNumber: '720402-08-1717', dob: new Date('1972-04-02'), gender: 'Male', occupation: 'Civil Engineer', race: 'Malay', maritalStatus: 'Married', bloodType: 'O+', allergies: null, referralSource: 'Wife referral', addressLine1: '34, Jalan Bangsar Baru', city: 'Bangsar', state: 'Wilayah Persekutuan', postcode: '59100', emergencyName: 'Aishah binti Razak', emergencyPhone: '+60 12-300 1117', emergencyRelation: 'Wife', medicalHistory: 'Site work injuries. Right knee pain. Lumbar disc protrusion.', notes: 'On-site frequently. Books in advance.', status: 'active', doctorIdx: 4, branchIdx: 1 },
    { firstName: 'Sophie', lastName: 'Wong', email: 'sophie.wong.jh@example.com', phone: '+60 11-2200 0018', icNumber: '940715-14-1818', dob: new Date('1994-07-15'), gender: 'Female', occupation: 'Yoga Teacher', race: 'Chinese', maritalStatus: 'Single', bloodType: 'O-', allergies: null, referralSource: 'Studio referral', addressLine1: '7, Jalan Bukit Bandaraya', city: 'Bangsar', state: 'Wilayah Persekutuan', postcode: '59100', emergencyName: 'Wong Mei Ling', emergencyPhone: '+60 12-300 1118', emergencyRelation: 'Mother', medicalHistory: 'Hypermobility syndrome. Hip stability work.', notes: 'Body aware. Articulate about findings.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    { firstName: 'Tariq', lastName: 'bin Aziz', email: 'tariq.aziz.jh@example.com', phone: '+60 11-2200 0019', icNumber: '650118-01-1919', dob: new Date('1965-01-18'), gender: 'Male', occupation: 'Restaurateur', race: 'Malay', maritalStatus: 'Married', bloodType: 'B+', allergies: 'Peanuts', referralSource: 'Friend', addressLine1: '15, Lorong Maarof', city: 'Bangsar', state: 'Wilayah Persekutuan', postcode: '59000', emergencyName: 'Salmiah binti Yusof', emergencyPhone: '+60 12-300 1119', emergencyRelation: 'Wife', medicalHistory: 'Long-standing low back pain. Standing all day at restaurant.', notes: 'Likes to chat about food during sessions.', status: 'active', doctorIdx: 4, branchIdx: 1 },
    { firstName: 'Uma', lastName: 'Devi', email: 'uma.devi.jh@example.com', phone: '+60 11-2200 0020', icNumber: '890506-10-2020', dob: new Date('1989-05-06'), gender: 'Female', occupation: 'Pharmacist', race: 'Indian', maritalStatus: 'Married', bloodType: 'A-', allergies: 'Sulfa drugs', referralSource: 'Pharmacy customer', addressLine1: '22, Jalan Telawi 3', city: 'Bangsar', state: 'Wilayah Persekutuan', postcode: '59100', emergencyName: 'Sanjay Kumar', emergencyPhone: '+60 12-300 1120', emergencyRelation: 'Husband', medicalHistory: 'Postpartum back pain. 6 months post-delivery.', notes: 'Mother of newborn. Limited availability.', status: 'active', doctorIdx: 2, branchIdx: 1 },
    // ─── Penang branch (NEW) ───
    { firstName: 'Vincent', lastName: 'Khoo', email: 'vincent.khoo.jh@example.com', phone: '+60 11-2200 0021', icNumber: '780211-07-2121', dob: new Date('1978-02-11'), gender: 'Male', occupation: 'Hotel Manager', race: 'Chinese', maritalStatus: 'Married', bloodType: 'O+', allergies: null, referralSource: 'Hotel guest', addressLine1: '88, Jalan Burma', city: 'George Town', state: 'Pulau Pinang', postcode: '10350', emergencyName: 'Khoo Lai Peng', emergencyPhone: '+60 12-400 2121', emergencyRelation: 'Wife', medicalHistory: 'Long hours standing. Lumbar stiffness. Mild hypertension.', notes: 'Hospitality professional. Public-facing role.', status: 'active', doctorIdx: 5, branchIdx: 2 },
    { firstName: 'Wendy', lastName: 'Lim Pei Shan', email: 'wendy.limps.jh@example.com', phone: '+60 11-2200 0022', icNumber: '951119-07-2222', dob: new Date('1995-11-19'), gender: 'Female', occupation: 'Software Developer', race: 'Chinese', maritalStatus: 'Single', bloodType: 'AB+', allergies: null, referralSource: 'Tech meetup friend', addressLine1: '23, Lebuh Carnarvon', city: 'George Town', state: 'Pulau Pinang', postcode: '10100', emergencyName: 'Lim Wee Beng', emergencyPhone: '+60 12-400 2222', emergencyRelation: 'Brother', medicalHistory: 'Carpal tunnel symptoms. Forward head posture. Low back pain.', notes: 'Remote worker. Flexible scheduling.', status: 'active', doctorIdx: 6, branchIdx: 2 },
    { firstName: 'Xavier', lastName: 'Ramachandran', email: 'xavier.r.jh@example.com', phone: '+60 11-2200 0023', icNumber: '690705-07-2323', dob: new Date('1969-07-05'), gender: 'Male', occupation: 'Retired Teacher', race: 'Indian', maritalStatus: 'Married', bloodType: 'B-', allergies: null, referralSource: 'Daughter', addressLine1: '5, Jalan Larut', city: 'George Town', state: 'Pulau Pinang', postcode: '10460', emergencyName: 'Priya Ramachandran', emergencyPhone: '+60 12-400 2323', emergencyRelation: 'Daughter', medicalHistory: 'Cervical spondylosis. Knee osteoarthritis bilateral.', notes: 'Senior patient. Speaks Tamil and English.', status: 'active', doctorIdx: 5, branchIdx: 2 },
    { firstName: 'Yasmin', lastName: 'binti Ariffin', email: 'yasmin.ariffin.jh@example.com', phone: '+60 11-2200 0024', icNumber: '910223-07-2424', dob: new Date('1991-02-23'), gender: 'Female', occupation: 'Pediatric Nurse', race: 'Malay', maritalStatus: 'Married', bloodType: 'O+', allergies: 'Latex', referralSource: 'Hospital colleague', addressLine1: '17, Jalan Sultan Ahmad Shah', city: 'George Town', state: 'Pulau Pinang', postcode: '10050', emergencyName: 'Ariffin bin Hassan', emergencyPhone: '+60 12-400 2424', emergencyRelation: 'Father', medicalHistory: '36 weeks pregnant. SI joint pain. History of scoliosis.', notes: 'Webster Technique candidate. High-priority comfort.', status: 'active', doctorIdx: 6, branchIdx: 2 },
    { firstName: 'Zachary', lastName: 'Tay', email: 'zachary.tay.jh@example.com', phone: '+60 11-2200 0025', icNumber: '030918-07-2525', dob: new Date('2003-09-18'), gender: 'Male', occupation: 'College Student (Engineering)', race: 'Chinese', maritalStatus: 'Single', bloodType: 'A+', allergies: null, referralSource: 'University clinic', addressLine1: '40, Jalan Sungai Pinang', city: 'George Town', state: 'Pulau Pinang', postcode: '10150', emergencyName: 'Tay Soon Hock', emergencyPhone: '+60 12-400 2525', emergencyRelation: 'Father', medicalHistory: 'Skateboarding injury — wrist and lower back. Postural issues from gaming.', notes: 'Active student. Budget-conscious.', status: 'active', doctorIdx: 6, branchIdx: 2 },
    { firstName: 'Aaron', lastName: 'Quah', email: 'aaron.quah.jh@example.com', phone: '+60 11-2200 0026', icNumber: '850330-07-2626', dob: new Date('1985-03-30'), gender: 'Male', occupation: 'Marketing Director', race: 'Chinese', maritalStatus: 'Married', bloodType: 'A+', allergies: null, referralSource: 'Google Search', addressLine1: '78, Jalan Kelawei', city: 'George Town', state: 'Pulau Pinang', postcode: '10250', emergencyName: 'Quah Mei Yi', emergencyPhone: '+60 12-400 2626', emergencyRelation: 'Wife', medicalHistory: 'Stress headaches. Cervical-thoracic tension. Work travel.', notes: 'Executive — books in batches when in town.', status: 'active', doctorIdx: 5, branchIdx: 2 },
    { firstName: 'Bibi', lastName: 'Aishah', email: 'bibi.aishah.jh@example.com', phone: '+60 11-2200 0027', icNumber: '740612-07-2727', dob: new Date('1974-06-12'), gender: 'Female', occupation: 'Boutique Owner', race: 'Malay', maritalStatus: 'Divorced', bloodType: 'B+', allergies: null, referralSource: 'Walk-in', addressLine1: '12, Jalan Macalister', city: 'George Town', state: 'Pulau Pinang', postcode: '10400', emergencyName: 'Bibi Mariam', emergencyPhone: '+60 12-400 2727', emergencyRelation: 'Sister', medicalHistory: 'Frozen shoulder right. Past whiplash from accident.', notes: 'Self-employed. Pays cash. Prefers gentle techniques.', status: 'active', doctorIdx: 5, branchIdx: 2 },
    { firstName: 'Caleb', lastName: 'Goh', email: 'caleb.goh.jh@example.com', phone: '+60 11-2200 0028', icNumber: '880801-07-2828', dob: new Date('1988-08-01'), gender: 'Male', occupation: 'F&B Owner', race: 'Chinese', maritalStatus: 'Single', bloodType: 'O+', allergies: null, referralSource: 'Instagram', addressLine1: '6, Lebuh Armenian', city: 'George Town', state: 'Pulau Pinang', postcode: '10200', emergencyName: 'Goh Ah Seng', emergencyPhone: '+60 12-400 2828', emergencyRelation: 'Father', medicalHistory: 'Repetitive strain in wrists and shoulders from cooking. Lumbar fatigue.', notes: 'Chef-owner. Available mornings only.', status: 'active', doctorIdx: 6, branchIdx: 2 },
    // ─── KLCC branch (more) ───
    { firstName: 'Daisy', lastName: 'Subramaniam', email: 'daisy.s.jh@example.com', phone: '+60 11-2200 0029', icNumber: '870914-10-2929', dob: new Date('1987-09-14'), gender: 'Female', occupation: 'Investment Analyst', race: 'Indian', maritalStatus: 'Married', bloodType: 'O+', allergies: null, referralSource: 'Colleague', addressLine1: '50, Jalan Stonor', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50450', emergencyName: 'Vijay Subramaniam', emergencyPhone: '+60 12-300 1129', emergencyRelation: 'Husband', medicalHistory: 'Chronic neck pain. Recent migraine onset.', notes: 'High-stress finance career. Books month ahead.', status: 'active', doctorIdx: 1, branchIdx: 0 },
    { firstName: 'Edwin', lastName: 'bin Mansor', email: 'edwin.mansor.jh@example.com', phone: '+60 11-2200 0030', icNumber: '780525-14-3030', dob: new Date('1978-05-25'), gender: 'Male', occupation: 'Airline Pilot', race: 'Malay', maritalStatus: 'Married', bloodType: 'A+', allergies: null, referralSource: 'Crew member', addressLine1: '15, Persiaran KLCC', city: 'Kuala Lumpur', state: 'Wilayah Persekutuan', postcode: '50088', emergencyName: 'Sarah binti Mansor', emergencyPhone: '+60 12-300 1130', emergencyRelation: 'Wife', medicalHistory: 'Cervical pain from cockpit posture. Mild lumbar fatigue.', notes: 'International pilot. Layover bookings only.', status: 'active', doctorIdx: 0, branchIdx: 0 },
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
    { patientIdx: 0, daysAgo: 2, visitType: 'FOLLOW_UP', chiefComplaint: 'Lower back pain follow-up', subjective: 'Pain improved from 7/10 to 4/10. Sleeping better.', objective: 'Lumbar ROM improved 30%. L4-L5 still restricted.', assessment: 'Improving lumbar subluxation.', plan: 'Continue Gonstead biweekly.', areasAdjusted: 'L4, L5, SI', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 posterior body', bpSys: 124, bpDia: 80, hr: 70, weight: 75.0, temp: 36.6, recommendations: 'Core stability exercises.', nextVisitDays: 14, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 7, patientComments: 'Much better than before.' } },
    { patientIdx: 0, daysAgo: 16, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Acute lower back pain', subjective: 'Acute LBP after long flight. Pain 7/10.', objective: 'Antalgic posture. Reduced lordosis.', assessment: 'L4-L5 subluxation with disc involvement.', plan: 'Gonstead L4-L5. Ice protocol.', areasAdjusted: 'L4, L5', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 left rotation', bpSys: 134, bpDia: 86, hr: 78, weight: 75.5, temp: 36.5, recommendations: 'Ice 15min every 2 hrs. Avoid prolonged sitting.', nextVisitDays: 14, q: { painLevel: 7, mobilityScore: 3, sleepQuality: 4, dailyFunction: 4, overallImprovement: 3, patientComments: 'Pain quite bad after the flight.' } },
    { patientIdx: 1, daysAgo: 5, visitType: 'FOLLOW_UP', chiefComplaint: 'Neck pain & headaches', subjective: 'Headaches reduced from daily to 2x/week.', objective: 'Cervical ROM improved.', assessment: 'Improving cervicogenic headaches.', plan: 'Continue diversified.', areasAdjusted: 'C4, C5, C6', techniqueUsed: 'Diversified', subluxationFindings: 'C4-C5 left lateral flexion restriction', bpSys: 110, bpDia: 70, hr: 64, weight: 54.0, temp: 36.4, recommendations: 'Screen breaks every 20 min.', nextVisitDays: 10, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 6, dailyFunction: 7, overallImprovement: 6, patientComments: 'Headaches getting better.' } },
    { patientIdx: 2, daysAgo: 1, visitType: 'FOLLOW_UP', chiefComplaint: 'Maintenance visit', subjective: 'Mild thoracic stiffness.', objective: 'T5-T7 fixation.', assessment: 'Stable thoracic pattern.', plan: 'Thompson adjustment.', areasAdjusted: 'T5, T6, T7', techniqueUsed: 'Thompson', subluxationFindings: 'T5-T7 bilateral restriction', bpSys: 120, bpDia: 78, hr: 66, weight: 72.0, temp: 36.5, recommendations: 'Posture breaks at work.', nextVisitDays: 14, q: { painLevel: 2, mobilityScore: 8, sleepQuality: 8, dailyFunction: 9, overallImprovement: 8, patientComments: 'Feeling great.' } },
    { patientIdx: 3, daysAgo: 3, visitType: 'FOLLOW_UP', chiefComplaint: 'Prenatal Webster technique', subjective: 'Sciatic pain much improved. 32 weeks.', objective: 'SI dysfunction right.', assessment: 'Pregnancy-related SI dysfunction.', plan: 'Continue Webster weekly.', areasAdjusted: 'SI joint, Sacrum', techniqueUsed: 'Diversified', subluxationFindings: 'Right SI posterior', bpSys: 116, bpDia: 72, hr: 82, weight: 72.0, temp: 36.7, recommendations: 'Pelvic support belt.', nextVisitDays: 7, q: { painLevel: 3, mobilityScore: 6, sleepQuality: 5, dailyFunction: 7, overallImprovement: 7, patientComments: 'Sciatica much better.' } },
    { patientIdx: 4, daysAgo: 4, visitType: 'FOLLOW_UP', chiefComplaint: 'Sports rehab progress', subjective: 'Disc symptoms stable. Training at 70% intensity.', objective: 'SLR 60° (improved from 45°).', assessment: 'L4-L5 disc improving.', plan: 'Adjustment + shoulder girdle work.', areasAdjusted: 'L4, L5, R shoulder', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 improving', bpSys: 122, bpDia: 75, hr: 58, weight: 80.0, temp: 36.6, recommendations: 'Progress to 80% training. Rotator cuff exercises.', nextVisitDays: 7, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 8, dailyFunction: 8, overallImprovement: 8, patientComments: 'Feeling strong.' } },
    { patientIdx: 5, daysAgo: 6, visitType: 'FOLLOW_UP', chiefComplaint: 'Stress-related neck tension', subjective: 'Tension still present after long meetings.', objective: 'Atlas laterality right.', assessment: 'Stress-related cervical pattern.', plan: 'Atlas adjustment. Stress management.', areasAdjusted: 'C1, C2', techniqueUsed: 'Gonstead', subluxationFindings: 'Atlas right', bpSys: 130, bpDia: 84, hr: 76, weight: 60.0, temp: 36.5, recommendations: 'Reduce caffeine.', nextVisitDays: 10, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 5, dailyFunction: 7, overallImprovement: 6 } },
    { patientIdx: 6, daysAgo: 8, visitType: 'FOLLOW_UP', chiefComplaint: 'Cervical maintenance post-fusion', subjective: 'Neck stiffness improved.', objective: 'C5-C6 fusion stable.', assessment: 'Stable post-surgical cervical.', plan: 'Activator C3-C4, C7-T1.', areasAdjusted: 'C3, C4, C7, T1', techniqueUsed: 'Activator', subluxationFindings: 'C3-C4 restriction', bpSys: 140, bpDia: 86, hr: 70, weight: 68.0, temp: 36.5, recommendations: 'Gentle stretches only.', nextVisitDays: 14, q: { painLevel: 3, mobilityScore: 5, sleepQuality: 6, dailyFunction: 6, overallImprovement: 6, patientComments: 'Better than before.' } },
    { patientIdx: 7, daysAgo: 9, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Tension headaches and study posture', subjective: 'Daily headaches during exam period.', objective: 'Suboccipital tension. C1-C2 restriction.', assessment: 'Cervicogenic headaches.', plan: 'Cervical adjustment. Study posture education.', areasAdjusted: 'C1, C2, C3', techniqueUsed: 'Diversified', subluxationFindings: 'C1 right lateral, C2-C3 fixation', bpSys: 110, bpDia: 70, hr: 68, weight: 50.0, recommendations: 'Study breaks every 45 min.', nextVisitDays: 7, q: { painLevel: 6, mobilityScore: 5, sleepQuality: 4, dailyFunction: 6, overallImprovement: 4 } },
    { patientIdx: 8, daysAgo: 10, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Travel-related lumbar pain', subjective: 'LBP after 14-hour flights.', objective: 'Tight lumbar paraspinals.', assessment: 'Travel-related lumbar dysfunction.', plan: 'Gonstead. Travel ergonomics.', areasAdjusted: 'L4, L5', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 fixation', bpSys: 128, bpDia: 80, hr: 72, weight: 82.0, recommendations: 'Inflight stretches. Lumbar pillow.', nextVisitDays: 14 },
    { patientIdx: 9, daysAgo: 7, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Text neck and mouse shoulder', subjective: 'Neck hurts after long design sessions.', objective: 'Forward head posture.', assessment: 'Postural distortion.', plan: 'Postural correction. Workstation review.', areasAdjusted: 'C5, C6, T1, R shoulder', techniqueUsed: 'Diversified', recommendations: 'Monitor height raise. 20-20-20 rule.', nextVisitDays: 14, q: { painLevel: 5, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 5, patientComments: 'Posture is bad.' } },
    { patientIdx: 10, daysAgo: 11, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Sciatica and hip tightness', subjective: 'Right-side sciatica.', objective: 'Positive SLR 50° right.', assessment: 'L5-S1 with sciatic irritation.', plan: 'Gonstead. Piriformis release.', areasAdjusted: 'L5, S1, R piriformis', techniqueUsed: 'Gonstead', subluxationFindings: 'L5-S1 right posterior body', bpSys: 134, bpDia: 86, hr: 76, weight: 70.0, recommendations: 'Piriformis stretch 3x daily.', nextVisitDays: 4, q: { painLevel: 7, mobilityScore: 4, sleepQuality: 5, dailyFunction: 4, overallImprovement: 3, patientComments: 'Pain wakes me at night.' } },
    { patientIdx: 11, daysAgo: 12, visitType: 'FOLLOW_UP', chiefComplaint: 'Upper back pain', subjective: 'Improving after last session.', objective: 'T2-T3 still restricted.', assessment: 'Improving thoracic pattern.', plan: 'Continue weekly.', areasAdjusted: 'T2, T3', techniqueUsed: 'Diversified', bpSys: 116, bpDia: 72, hr: 64, weight: 56.0, recommendations: 'Stretch routine.', nextVisitDays: 14, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 7, dailyFunction: 8, overallImprovement: 7 } },
    { patientIdx: 12, daysAgo: 14, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Plantar fasciitis & low back pain', subjective: 'Feet hurt waking up.', objective: 'Plantar fascia tenderness.', assessment: 'Foot-back biomechanical chain dysfunction.', plan: 'Lumbar adjustment. Foot mobilisation.', areasAdjusted: 'L5, SI, Both feet', techniqueUsed: 'Diversified', recommendations: 'Arch supports. Anti-fatigue mats.', nextVisitDays: 7 },
    { patientIdx: 13, daysAgo: 6, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Hip impingement and posture optimisation', subjective: 'Tight hips after teaching all day.', objective: 'Bilateral hip flexor tightness.', assessment: 'Functional hip impingement.', plan: 'Hip mobility work.', areasAdjusted: 'Bilateral hips, L5', techniqueUsed: 'Diversified', subluxationFindings: 'Hip flexor tightness', bpSys: 110, bpDia: 68, hr: 56, weight: 54.0, recommendations: 'Hip mobility routine 2x daily.', nextVisitDays: 7, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 8, dailyFunction: 8, overallImprovement: 6 } },
    { patientIdx: 14, daysAgo: 25, visitType: 'FOLLOW_UP', chiefComplaint: 'Lumbar maintenance', subjective: 'Stable. No new complaints.', objective: 'Mild lumbar stiffness.', assessment: 'Stable elderly lumbar pattern.', plan: 'Activator monthly.', areasAdjusted: 'L3, L4', techniqueUsed: 'Activator', bpSys: 144, bpDia: 86, hr: 78, weight: 65.0, recommendations: 'Daily walking.', nextVisitDays: 30 },
    // ─── New Bangsar patients ───
    { patientIdx: 15, daysAgo: 4, visitType: 'FOLLOW_UP', chiefComplaint: 'TMJ tension follow-up', subjective: 'Jaw clicking improved. Less morning tension.', objective: 'TMJ ROM improved. Cervical C1-C2 still mildly restricted.', assessment: 'Improving TMJ-cervical pattern.', plan: 'Continue activator monthly.', areasAdjusted: 'C1, C2, TMJ', techniqueUsed: 'Activator', bpSys: 122, bpDia: 78, hr: 70, weight: 56.0, recommendations: 'Jaw relaxation exercises. Reduce caffeine.', nextVisitDays: 21, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 7, dailyFunction: 8, overallImprovement: 7, patientComments: 'Less jaw pain, sleeping better.' } },
    { patientIdx: 15, daysAgo: 18, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'TMJ + neck pain', subjective: 'Jaw clicks daily. Tension headaches.', objective: 'TMJ dysfunction right. C1-C2 restriction. Trigger points.', assessment: 'TMJ-cervical complex from stress.', plan: 'Activator + TMJ release.', areasAdjusted: 'C1, C2, TMJ right', techniqueUsed: 'Activator', subluxationFindings: 'Atlas right, C2 rotation', bpSys: 134, bpDia: 88, hr: 80, weight: 56.5, recommendations: 'Jaw exercises 3x daily.', nextVisitDays: 14, q: { painLevel: 6, mobilityScore: 5, sleepQuality: 4, dailyFunction: 6, overallImprovement: 3, patientComments: 'Jaw pain wakes me up.' } },
    { patientIdx: 16, daysAgo: 5, visitType: 'FOLLOW_UP', chiefComplaint: 'Knee + lumbar follow-up', subjective: 'Knee pain reduced. Lumbar still tight after long site visits.', objective: 'Right knee ROM full. Lumbar paraspinal tightness.', assessment: 'Improving knee strain. Persistent lumbar.', plan: 'Lumbar adjustment. Knee mobilization.', areasAdjusted: 'L4, L5, Right knee', techniqueUsed: 'Diversified', bpSys: 128, bpDia: 82, hr: 72, weight: 78.0, recommendations: 'Stretches before site visits. Knee braces if needed.', nextVisitDays: 10 },
    { patientIdx: 17, daysAgo: 3, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Hypermobility hip work', subjective: 'Hip "popping" during yoga. Wants stability work.', objective: 'Beighton score 6/9. Hip joint laxity bilateral.', assessment: 'Hypermobility syndrome. Functional hip instability.', plan: 'Stability-focused adjustments. Strengthening over mobility.', areasAdjusted: 'Bilateral hips, SI joint', techniqueUsed: 'Diversified', subluxationFindings: 'SI joint hypermobility', bpSys: 110, bpDia: 68, hr: 62, weight: 52.0, recommendations: 'Glute strengthening. Avoid extreme ranges of motion.', nextVisitDays: 7, q: { painLevel: 3, mobilityScore: 9, sleepQuality: 8, dailyFunction: 8, overallImprovement: 4, patientComments: 'Want to feel more stable, not more flexible.' } },
    { patientIdx: 18, daysAgo: 7, visitType: 'FOLLOW_UP', chiefComplaint: 'Long-standing low back pain', subjective: 'Improving. Can stand for full shifts again.', objective: 'Lumbar flexion 80% normal. Reduced paraspinal guarding.', assessment: 'Chronic mechanical low back pain — improving.', plan: 'Continue weekly Diversified.', areasAdjusted: 'L4, L5, SI', techniqueUsed: 'Diversified', subluxationFindings: 'L4-L5 fixation reducing', bpSys: 138, bpDia: 86, hr: 74, weight: 88.0, recommendations: 'Anti-fatigue mats. Standing breaks.', nextVisitDays: 14, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 6, dailyFunction: 7, overallImprovement: 6 } },
    { patientIdx: 19, daysAgo: 4, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Postpartum back pain', subjective: 'LBP since giving birth 6 months ago. Worse when lifting baby.', objective: 'SI joint dysfunction left. Diastasis recti minor.', assessment: 'Postpartum SI dysfunction with weakened core.', plan: 'SI mobilization. Core rehab plan.', areasAdjusted: 'L5, SI joint left, Sacrum', techniqueUsed: 'Diversified', subluxationFindings: 'Left SI posterior', bpSys: 116, bpDia: 72, hr: 68, weight: 60.0, temp: 36.6, recommendations: 'Pelvic floor exercises. Proper baby-lifting technique.', nextVisitDays: 7, q: { painLevel: 5, mobilityScore: 5, sleepQuality: 5, dailyFunction: 5, overallImprovement: 4, patientComments: 'Hard to take care of baby with this pain.' } },
    // ─── New Penang patients ───
    { patientIdx: 20, daysAgo: 6, visitType: 'FOLLOW_UP', chiefComplaint: 'Lumbar maintenance for hotel work', subjective: 'Pain manageable now. Standing meetings less painful.', objective: 'Lumbar ROM near normal. SI mobility improved.', assessment: 'Stable lumbar mechanics with prolonged standing.', plan: 'Monthly maintenance.', areasAdjusted: 'L4, L5, SI', techniqueUsed: 'Gonstead', bpSys: 132, bpDia: 84, hr: 70, weight: 80.0, recommendations: 'Compression socks during long shifts.', nextVisitDays: 30 },
    { patientIdx: 20, daysAgo: 28, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'LBP from standing all day', subjective: 'LBP worsens through day. Pain 6/10 by evening.', objective: 'L5-S1 fixation. Bilateral paraspinal tightness.', assessment: 'Mechanical LBP from prolonged standing.', plan: 'Gonstead L5-S1. Lifestyle modification.', areasAdjusted: 'L5, S1', techniqueUsed: 'Gonstead', bpSys: 138, bpDia: 88, hr: 76, weight: 80.5, temp: 36.5, recommendations: 'Sit when possible. Hydration.', nextVisitDays: 14, q: { painLevel: 6, mobilityScore: 4, sleepQuality: 5, dailyFunction: 5, overallImprovement: 3, patientComments: 'Pain affects my work performance.' } },
    { patientIdx: 21, daysAgo: 2, visitType: 'FOLLOW_UP', chiefComplaint: 'Carpal tunnel + posture follow-up', subjective: 'Wrist tingling reduced. Posture awareness improved.', objective: 'Cervical curve improving. Wrist Phalen test less symptomatic.', assessment: 'Improving upper-quarter dysfunction.', plan: 'Continue cervical adjustments. Wrist mobilization.', areasAdjusted: 'C5, C6, T1, Right wrist', techniqueUsed: 'Diversified', subluxationFindings: 'C5-C6 still mild restriction', bpSys: 112, bpDia: 70, hr: 64, weight: 54.0, recommendations: 'Ergonomic keyboard. Frequent wrist breaks.', nextVisitDays: 10, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 8, dailyFunction: 7, overallImprovement: 7, patientComments: 'Wrist tingling much better!' } },
    { patientIdx: 21, daysAgo: 16, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Carpal tunnel and forward head posture', subjective: 'Numbness in fingers. Neck strain from coding.', objective: 'Forward head 4cm. Phalen test positive right wrist.', assessment: 'Upper-cross syndrome with carpal tunnel signs.', plan: 'Postural correction. Wrist mobilization.', areasAdjusted: 'C5, C6, T1, T2, Both wrists', techniqueUsed: 'Diversified', subluxationFindings: 'C5-T2 forward translation', bpSys: 118, bpDia: 74, hr: 68, weight: 54.5, recommendations: 'Standing desk. 20-20-20 rule.', nextVisitDays: 14, q: { painLevel: 5, mobilityScore: 6, sleepQuality: 7, dailyFunction: 6, overallImprovement: 4, patientComments: 'Worried about long-term hand damage.' } },
    { patientIdx: 22, daysAgo: 9, visitType: 'FOLLOW_UP', chiefComplaint: 'Cervical-knee maintenance', subjective: 'Knees more comfortable during morning walks.', objective: 'Cervical ROM stable. Knee crepitus mild.', assessment: 'Stable degenerative pattern with improvement.', plan: 'Monthly Activator.', areasAdjusted: 'C3, C4, Bilateral knees', techniqueUsed: 'Activator', bpSys: 142, bpDia: 84, hr: 72, weight: 70.0, recommendations: 'Continue daily walking. Glucosamine supplement.', nextVisitDays: 30, q: { painLevel: 3, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 7, patientComments: 'Walking is much easier now.' } },
    { patientIdx: 23, daysAgo: 3, visitType: 'FOLLOW_UP', chiefComplaint: 'Webster Technique 36-week', subjective: 'Baby in good position. Sciatica much improved.', objective: 'SI joint mobile. Pelvis level. Baby cephalic.', assessment: 'Pregnancy-related SI dysfunction managed well.', plan: 'Continue Webster weekly until delivery.', areasAdjusted: 'SI joint, Sacrum', techniqueUsed: 'Diversified', bpSys: 118, bpDia: 74, hr: 84, weight: 70.5, temp: 36.7, recommendations: 'Birth ball exercises. Side-lying sleep.', nextVisitDays: 7, q: { painLevel: 2, mobilityScore: 7, sleepQuality: 6, dailyFunction: 8, overallImprovement: 8, patientComments: 'So thankful — sciatica is gone!' } },
    { patientIdx: 23, daysAgo: 17, visitType: 'FOLLOW_UP', chiefComplaint: 'Webster prep mid-pregnancy', subjective: 'Sciatic pain improving. 34 weeks.', objective: 'Right SI dysfunction. Baby breech.', assessment: 'Webster Technique progress.', plan: 'Weekly Webster.', areasAdjusted: 'SI, Sacrum', techniqueUsed: 'Diversified', bpSys: 120, bpDia: 75, hr: 86, weight: 69.0, temp: 36.7, recommendations: 'Cat-cow exercises. Pregnancy pillow.', nextVisitDays: 7, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 5, dailyFunction: 6, overallImprovement: 6 } },
    { patientIdx: 24, daysAgo: 5, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Skateboarding wrist + lumbar', subjective: 'Fell off board. Right wrist sore. LBP from bracing fall.', objective: 'Wrist no fracture. Lumbar paraspinal spasm.', assessment: 'Acute soft-tissue from skateboarding fall.', plan: 'Wrist mobilization. Lumbar adjustment.', areasAdjusted: 'Right wrist, L4, L5', techniqueUsed: 'Diversified', bpSys: 118, bpDia: 72, hr: 68, weight: 65.0, recommendations: 'Ice wrist. Avoid skating 2 weeks.', nextVisitDays: 7, q: { painLevel: 5, mobilityScore: 5, sleepQuality: 6, dailyFunction: 6, overallImprovement: 4 } },
    { patientIdx: 25, daysAgo: 8, visitType: 'FOLLOW_UP', chiefComplaint: 'Stress headaches follow-up', subjective: 'Headaches frequency dropping. Travel lighter than expected.', objective: 'Cervical ROM improved. Trigger points reducing.', assessment: 'Cervicogenic headaches improving.', plan: 'Continue 2-week cycle.', areasAdjusted: 'C1, C2, T1', techniqueUsed: 'Gonstead', subluxationFindings: 'C1 mildly restricted', bpSys: 130, bpDia: 84, hr: 72, weight: 76.0, recommendations: 'Continue meditation. Hydrate during travel.', nextVisitDays: 14, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 7, dailyFunction: 8, overallImprovement: 7, patientComments: 'Productivity is much better.' } },
    { patientIdx: 26, daysAgo: 10, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Frozen shoulder + whiplash legacy', subjective: 'Right shoulder cannot lift. Old neck injury flared up.', objective: 'Shoulder abduction 70°. Cervical fixation C5-C6.', assessment: 'Adhesive capsulitis with cervical compensation.', plan: 'Gentle Activator + shoulder mobilization.', areasAdjusted: 'C5, C6, Right shoulder', techniqueUsed: 'Activator', subluxationFindings: 'Right shoulder capsular restriction', bpSys: 134, bpDia: 86, hr: 76, weight: 60.0, recommendations: 'Pendulum exercises. Heat before sessions.', nextVisitDays: 7, q: { painLevel: 6, mobilityScore: 4, sleepQuality: 5, dailyFunction: 5, overallImprovement: 3, patientComments: 'Cannot reach overhead at all.' } },
    { patientIdx: 27, daysAgo: 6, visitType: 'FOLLOW_UP', chiefComplaint: 'Cooking-related strain check', subjective: 'Wrists better. Lumbar fatigue still present after busy nights.', objective: 'Wrist ROM full. Lumbar mild paraspinal tightness.', assessment: 'Improving repetitive strain pattern.', plan: 'Continue 2-week cycle.', areasAdjusted: 'L4, L5, Both wrists', techniqueUsed: 'Diversified', bpSys: 124, bpDia: 78, hr: 70, weight: 75.0, recommendations: 'Wrist stretches between services. Anti-fatigue mats.', nextVisitDays: 14, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 7, dailyFunction: 8, overallImprovement: 7 } },
    // ─── New KLCC patients ───
    { patientIdx: 28, daysAgo: 4, visitType: 'FOLLOW_UP', chiefComplaint: 'Migraine + neck pain follow-up', subjective: 'Migraines fewer. Neck pain still during long calls.', objective: 'Cervical ROM near full. C2 mild restriction.', assessment: 'Migraine prophylaxis with cervical correction.', plan: 'Continue cervical adjustments.', areasAdjusted: 'C1, C2, C3', techniqueUsed: 'Gonstead', subluxationFindings: 'C2 right rotation', bpSys: 118, bpDia: 74, hr: 68, weight: 58.0, recommendations: 'Migraine diary. Avoid known triggers.', nextVisitDays: 14, q: { painLevel: 3, mobilityScore: 7, sleepQuality: 7, dailyFunction: 8, overallImprovement: 7, patientComments: 'Migraines down 50%.' } },
    { patientIdx: 28, daysAgo: 18, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'New migraine onset + chronic neck', subjective: 'Migraines started 3 months ago. Daily neck pain.', objective: 'Cervical fixation C1-C3. Trigger points bilateral upper trap.', assessment: 'Cervicogenic migraines.', plan: 'Cervical adjustment series.', areasAdjusted: 'C1, C2, C3', techniqueUsed: 'Gonstead', bpSys: 124, bpDia: 80, hr: 72, weight: 58.5, recommendations: 'Track migraine triggers. Stress management.', nextVisitDays: 14, q: { painLevel: 6, mobilityScore: 5, sleepQuality: 5, dailyFunction: 6, overallImprovement: 3, patientComments: 'Migraines are scaring me — very disruptive.' } },
    { patientIdx: 29, daysAgo: 11, visitType: 'INITIAL_CONSULTATION', chiefComplaint: 'Cockpit-induced cervical strain', subjective: 'Cervical pain after long-haul flights. Asymmetric.', objective: 'C5-C6 right rotation restriction. Forward head posture.', assessment: 'Occupational cervical dysfunction.', plan: 'Gonstead + neck mobility.', areasAdjusted: 'C5, C6, T1', techniqueUsed: 'Gonstead', subluxationFindings: 'C5-C6 right rotation fixation', bpSys: 122, bpDia: 78, hr: 64, weight: 78.0, recommendations: 'Inflight neck mobility. Headrest adjustment.', nextVisitDays: 21, q: { painLevel: 4, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 5 } },
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

  // ─── Appointments ───
  // Clear & re-create for idempotency
  await prisma.appointment.deleteMany({
    where: { patient: { id: { startsWith: 'personal-patient-' } } },
  })

  const appointmentData = [
    // ─── KLCC branch — today ───
    { patientIdx: 0, daysFromNow: 0, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 3, daysFromNow: 0, hour: 11, duration: 30, status: 'CHECKED_IN' as const },
    { patientIdx: 5, daysFromNow: 0, hour: 14, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 9, daysFromNow: 0, hour: 16, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 28, daysFromNow: 0, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 29, daysFromNow: 0, hour: 13, duration: 30, status: 'SCHEDULED' as const },
    // ─── Bangsar branch — today ───
    { patientIdx: 1, daysFromNow: 0, hour: 12, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 15, daysFromNow: 0, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 19, daysFromNow: 0, hour: 17, duration: 30, status: 'SCHEDULED' as const },
    // ─── Penang branch — today ───
    { patientIdx: 21, daysFromNow: 0, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 23, daysFromNow: 0, hour: 11, duration: 30, status: 'CHECKED_IN' as const },
    { patientIdx: 26, daysFromNow: 0, hour: 15, duration: 45, status: 'SCHEDULED' as const },
    // ─── Tomorrow ───
    { patientIdx: 4, daysFromNow: 1, hour: 9, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 6, daysFromNow: 1, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 7, daysFromNow: 1, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 16, daysFromNow: 1, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 17, daysFromNow: 1, hour: 15, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 20, daysFromNow: 1, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 24, daysFromNow: 1, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 25, daysFromNow: 1, hour: 16, duration: 30, status: 'SCHEDULED' as const },
    // ─── Day +2 ───
    { patientIdx: 2, daysFromNow: 2, hour: 15, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 10, daysFromNow: 2, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 18, daysFromNow: 2, hour: 11, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 22, daysFromNow: 2, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 27, daysFromNow: 2, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    // ─── Day +3 ───
    { patientIdx: 6, daysFromNow: 3, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 11, daysFromNow: 3, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 19, daysFromNow: 3, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 21, daysFromNow: 3, hour: 15, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 28, daysFromNow: 3, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    // ─── Day +4 ───
    { patientIdx: 0, daysFromNow: 4, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 8, daysFromNow: 4, hour: 11, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 17, daysFromNow: 4, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 23, daysFromNow: 4, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    // ─── Day +5 ───
    { patientIdx: 13, daysFromNow: 5, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 15, daysFromNow: 5, hour: 16, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 24, daysFromNow: 5, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 25, daysFromNow: 5, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    // ─── Day +6 ───
    { patientIdx: 12, daysFromNow: 6, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 18, daysFromNow: 6, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 20, daysFromNow: 6, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    // ─── Day +7 ───
    { patientIdx: 16, daysFromNow: 7, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 22, daysFromNow: 7, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 26, daysFromNow: 7, hour: 14, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 29, daysFromNow: 7, hour: 13, duration: 30, status: 'SCHEDULED' as const },
    // ─── Days +10 to +14 ───
    { patientIdx: 0, daysFromNow: 14, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 4, daysFromNow: 11, hour: 11, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 23, daysFromNow: 10, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 27, daysFromNow: 13, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    // ─── Past completed (for activity feed) ───
    { patientIdx: 0, daysFromNow: -2, hour: 10, duration: 30, status: 'COMPLETED' as const },
    { patientIdx: 1, daysFromNow: -5, hour: 11, duration: 30, status: 'COMPLETED' as const },
    { patientIdx: 4, daysFromNow: -4, hour: 15, duration: 45, status: 'COMPLETED' as const },
    { patientIdx: 14, daysFromNow: -25, hour: 14, duration: 30, status: 'COMPLETED' as const },
    { patientIdx: 15, daysFromNow: -4, hour: 14, duration: 30, status: 'COMPLETED' as const },
    { patientIdx: 21, daysFromNow: -2, hour: 10, duration: 30, status: 'COMPLETED' as const },
    { patientIdx: 23, daysFromNow: -3, hour: 11, duration: 30, status: 'COMPLETED' as const },
    { patientIdx: 28, daysFromNow: -4, hour: 9, duration: 30, status: 'COMPLETED' as const },
  ]

  let apptCount = 0
  for (const a of appointmentData) {
    const patientId = `personal-patient-${String(a.patientIdx + 1).padStart(3, '0')}`
    const patient = patientsData[a.patientIdx]
    const doctor = allDoctors[patient.doctorIdx]
    const dateTime = new Date(now)
    dateTime.setDate(dateTime.getDate() + a.daysFromNow)
    dateTime.setHours(a.hour, 0, 0, 0)

    await prisma.appointment.create({
      data: {
        dateTime,
        duration: a.duration,
        status: a.status,
        patientId,
        branchId: branches[patient.branchIdx].id,
        doctorId: doctor.id,
      },
    })
    apptCount++
  }
  console.log(`Seeded ${apptCount} appointments`)

  // ─── Invoices ───
  // Clear & re-create for idempotency (invoiceNumber is unique)
  await prisma.invoice.deleteMany({
    where: { patient: { id: { startsWith: 'personal-patient-' } } },
  })

  const invoicesData = [
    { patientIdx: 0, daysAgo: 2, status: 'PAID' as const, items: [{ description: 'Follow-up adjustment (Gonstead)', quantity: 1, unitPrice: 130, total: 130 }], amount: 130 },
    { patientIdx: 0, daysAgo: 16, status: 'PAID' as const, items: [{ description: 'Initial consultation + adjustment', quantity: 1, unitPrice: 280, total: 280 }], amount: 280 },
    { patientIdx: 1, daysAgo: 5, status: 'PAID' as const, items: [{ description: 'Follow-up adjustment (Diversified)', quantity: 1, unitPrice: 150, total: 150 }], amount: 150 },
    { patientIdx: 2, daysAgo: 1, status: 'SENT' as const, items: [{ description: 'Maintenance adjustment (Thompson)', quantity: 1, unitPrice: 110, total: 110 }], amount: 110 },
    { patientIdx: 3, daysAgo: 3, status: 'PAID' as const, items: [{ description: 'Webster Technique session', quantity: 1, unitPrice: 150, total: 150 }], amount: 150 },
    { patientIdx: 4, daysAgo: 4, status: 'PAID' as const, items: [{ description: 'Sports rehab session', quantity: 1, unitPrice: 130, total: 130 }, { description: 'Soft tissue therapy', quantity: 1, unitPrice: 80, total: 80 }], amount: 210 },
    { patientIdx: 5, daysAgo: 6, status: 'OVERDUE' as const, items: [{ description: 'Stress-related cervical adjustment', quantity: 1, unitPrice: 130, total: 130 }], amount: 130 },
    { patientIdx: 6, daysAgo: 8, status: 'PAID' as const, items: [{ description: 'Activator gentle adjustment', quantity: 1, unitPrice: 150, total: 150 }], amount: 150 },
    { patientIdx: 7, daysAgo: 9, status: 'PAID' as const, items: [{ description: 'Initial consultation (Student rate)', quantity: 1, unitPrice: 170, total: 170 }], amount: 170 },
    { patientIdx: 8, daysAgo: 10, status: 'SENT' as const, items: [{ description: 'Initial consultation', quantity: 1, unitPrice: 320, total: 320 }], amount: 320 },
    { patientIdx: 14, daysAgo: 25, status: 'PAID' as const, items: [{ description: 'Maintenance adjustment (gentle)', quantity: 1, unitPrice: 150, total: 150 }], amount: 150 },
    { patientIdx: 12, daysAgo: 14, status: 'DRAFT' as const, items: [{ description: 'Initial consultation + foot work', quantity: 1, unitPrice: 280, total: 280 }], amount: 280 },
  ]

  let invCount = 0
  for (const inv of invoicesData) {
    const patientId = `personal-patient-${String(inv.patientIdx + 1).padStart(3, '0')}`
    const patient = patientsData[inv.patientIdx]
    const issued = new Date(now)
    issued.setDate(issued.getDate() - inv.daysAgo)
    const due = new Date(issued)
    due.setDate(due.getDate() + 14)

    await prisma.invoice.create({
      data: {
        invoiceNumber: `JH-INV-${String(invCount + 1).padStart(4, '0')}`,
        amount: inv.amount,
        currency: 'MYR',
        status: inv.status,
        dueDate: due,
        paidAt: inv.status === 'PAID' ? issued : null,
        lineItems: inv.items,
        patientId,
        branchId: branches[patient.branchIdx].id,
        createdAt: issued,
      },
    })
    invCount++
  }
  console.log(`Seeded ${invCount} invoices`)

  console.log('\n✓ Personal seed complete!')
  console.log(`   Login: ${SEED_EMAIL}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
