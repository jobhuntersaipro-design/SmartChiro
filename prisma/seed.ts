import { PrismaClient } from '@prisma/client'
import type { VisitType, InvoiceStatus, PaymentMethod } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { hash } from 'bcryptjs'
import 'dotenv/config'

const connectionString = process.env.DATABASE_URL!

const adapter = new PrismaNeon({ connectionString })
const prisma = new PrismaClient({ adapter })

// Map legacy visit type strings → new enum values
const VISIT_TYPE_MAP: Record<string, VisitType> = {
  initial: 'INITIAL_CONSULTATION',
  first_treatment: 'FIRST_TREATMENT',
  follow_up: 'FOLLOW_UP',
  reassessment: 'RE_EVALUATION',
  re_evaluation: 'RE_EVALUATION',
  emergency: 'EMERGENCY',
  discharge: 'DISCHARGE',
}

function mapVisitType(s: string | null | undefined): VisitType | null {
  if (!s) return null
  const m = VISIT_TYPE_MAP[s.toLowerCase()]
  return m ?? 'OTHER'
}

async function main() {
  const hashedPassword = await hash('12345678', 12)

  // ─── Demo Owner (existing) ───
  const owner = await prisma.user.upsert({
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
  console.log(`Seeded owner: ${owner.email} (id: ${owner.id})`)

  // ─── Branch ───
  const branch = await prisma.branch.upsert({
    where: { id: 'demo-branch-001' },
    update: {},
    create: {
      id: 'demo-branch-001',
      name: 'SmartChiro Demo Branch',
      address: '123 Main Street',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      zip: '50000',
      phone: '+60 12-345 6789',
      email: 'branch@smartchiro.org',
      ownerName: 'Demo Wojak',
      clinicType: 'group',
      operatingHours: 'Mon-Fri 9am-6pm, Sat 9am-1pm',
      treatmentRooms: 4,
      specialties: 'Gonstead, Diversified, Sports Chiropractic',
      insuranceProviders: 'AIA, Great Eastern, Prudential',
    },
  })
  console.log(`Seeded branch: ${branch.name}`)

  // Link owner to branch
  await prisma.branchMember.upsert({
    where: { userId_branchId: { userId: owner.id, branchId: branch.id } },
    update: { role: 'OWNER' },
    create: { userId: owner.id, branchId: branch.id, role: 'OWNER' },
  })
  await prisma.user.update({
    where: { id: owner.id },
    data: { activeBranchId: branch.id },
  })
  console.log(`Linked owner → branch`)

  // ─── Doctors ───
  const doctorsData = [
    {
      email: 'dr.lim@smartchiro.org',
      name: 'Dr. Lim Wei Jie',
      phone: '+60 12-888 1234',
      role: 'ADMIN' as const,
      profile: {
        licenseNumber: 'DC-MY-2018-4521',
        specialties: ['Gonstead Technique', 'Sports Chiropractic', 'Pediatric Chiropractic'],
        yearsExperience: 8,
        education: 'Doctor of Chiropractic, RMIT University Melbourne',
        bio: 'Specializes in Gonstead technique with a focus on sports injuries and pediatric care. Former team chiropractor for Selangor FC.',
        languages: ['English', 'Mandarin', 'Malay'],
        insurancePlans: ['AIA', 'Great Eastern', 'Prudential'],
        consultationFee: 150,
        treatmentRoom: 'Room A',
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
      email: 'dr.aisha@smartchiro.org',
      name: 'Dr. Aisha binti Razak',
      phone: '+60 17-555 9876',
      role: 'DOCTOR' as const,
      profile: {
        licenseNumber: 'DC-MY-2020-6103',
        specialties: ['Diversified Technique', 'Prenatal Chiropractic', 'Rehabilitation'],
        yearsExperience: 5,
        education: 'Doctor of Chiropractic, International Medical University (IMU)',
        bio: 'Passionate about prenatal and postpartum chiropractic care. Certified in Webster Technique for pregnancy-related adjustments.',
        languages: ['English', 'Malay', 'Arabic'],
        insurancePlans: ['AIA', 'Allianz'],
        consultationFee: 130,
        treatmentRoom: 'Room B',
        workingSchedule: {
          monday: { start: '10:00', end: '18:00' },
          tuesday: { start: '10:00', end: '18:00' },
          wednesday: null,
          thursday: { start: '10:00', end: '18:00' },
          friday: { start: '10:00', end: '17:00' },
          saturday: { start: '09:00', end: '13:00' },
        },
      },
    },
    {
      email: 'dr.kumar@smartchiro.org',
      name: 'Dr. Rajesh Kumar',
      phone: '+60 16-333 4567',
      role: 'DOCTOR' as const,
      profile: {
        licenseNumber: 'DC-MY-2015-2890',
        specialties: ['Thompson Technique', 'Activator Method', 'Geriatric Chiropractic'],
        yearsExperience: 11,
        education: 'Doctor of Chiropractic, Murdoch University Perth',
        bio: 'Senior chiropractor specializing in gentle techniques suitable for elderly patients. Published researcher in spinal degeneration management.',
        languages: ['English', 'Tamil', 'Malay'],
        insurancePlans: ['Great Eastern', 'Prudential', 'AXA'],
        consultationFee: 180,
        treatmentRoom: 'Room C',
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

  const doctorUsers: { id: string; name: string }[] = []

  for (const d of doctorsData) {
    const user = await prisma.user.upsert({
      where: { email: d.email },
      update: {},
      create: {
        email: d.email,
        name: d.name,
        password: hashedPassword,
        phoneNumber: d.phone,
        emailVerified: new Date(),
        activeBranchId: branch.id,
      },
    })

    await prisma.branchMember.upsert({
      where: { userId_branchId: { userId: user.id, branchId: branch.id } },
      update: { role: d.role },
      create: { userId: user.id, branchId: branch.id, role: d.role },
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

    doctorUsers.push({ id: user.id, name: d.name })
    console.log(`Seeded doctor: ${d.name} (${d.role})`)
  }

  // Also add owner to the doctor pool for patient assignment
  const allDoctors = [{ id: owner.id, name: owner.name ?? 'Demo Wojak' }, ...doctorUsers]

  // ─── Patients ───
  const patientsData = [
    {
      firstName: 'Ahmad',
      lastName: 'bin Ibrahim',
      email: 'ahmad.ibrahim@gmail.com',
      phone: '+60 11-1111 2001',
      icNumber: '850315-14-5523',
      dateOfBirth: new Date('1985-03-15'),
      gender: 'Male',
      occupation: 'Software Engineer',
      race: 'Malay',
      maritalStatus: 'Married',
      bloodType: 'O+',
      allergies: 'Penicillin',
      referralSource: 'Google Search',
      addressLine1: '12, Jalan Bukit Bintang',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '55100',
      emergencyName: 'Siti Aminah',
      emergencyPhone: '+60 12-999 0001',
      emergencyRelation: 'Wife',
      medicalHistory: 'Lower back pain for 3 years. Previous physiotherapy with limited improvement. Desk job, sitting 8+ hours daily.',
      notes: 'Prefers morning appointments. Responds well to Gonstead adjustments.',
      status: 'active',
      doctorIndex: 0,
    },
    {
      firstName: 'Tan',
      lastName: 'Mei Ling',
      email: 'meilingtan@yahoo.com',
      phone: '+60 11-1111 2002',
      icNumber: '920728-10-6644',
      dateOfBirth: new Date('1992-07-28'),
      gender: 'Female',
      occupation: 'Accountant',
      race: 'Chinese',
      maritalStatus: 'Single',
      bloodType: 'A+',
      allergies: null,
      referralSource: 'Friend recommendation',
      addressLine1: '45, Jalan SS2/72',
      addressLine2: 'Taman SEA',
      city: 'Petaling Jaya',
      state: 'Selangor',
      postcode: '47300',
      emergencyName: 'Tan Wei Ming',
      emergencyPhone: '+60 12-999 0002',
      emergencyRelation: 'Father',
      medicalHistory: 'Neck pain and headaches. Frequent computer usage at work.',
      notes: 'First-time chiropractic patient. Slightly anxious about adjustments.',
      status: 'active',
      doctorIndex: 1,
    },
    {
      firstName: 'Priya',
      lastName: 'Nair',
      email: 'priya.nair@hotmail.com',
      phone: '+60 11-1111 2003',
      icNumber: '780912-08-4412',
      dateOfBirth: new Date('1978-09-12'),
      gender: 'Female',
      occupation: 'Teacher',
      race: 'Indian',
      maritalStatus: 'Married',
      bloodType: 'B+',
      allergies: 'Latex',
      referralSource: 'Dr. Kumar referral',
      addressLine1: '8, Lorong Maarof',
      city: 'Bangsar',
      state: 'Wilayah Persekutuan',
      postcode: '59000',
      emergencyName: 'Ravi Nair',
      emergencyPhone: '+60 12-999 0003',
      emergencyRelation: 'Husband',
      medicalHistory: 'Chronic thoracic pain. History of scoliosis diagnosed at age 14. Regular maintenance care.',
      notes: 'Long-term patient. Comes every 2 weeks for maintenance adjustments.',
      status: 'active',
      doctorIndex: 2,
    },
    {
      firstName: 'Mohd',
      lastName: 'Faizal',
      email: 'faizal.mohd@gmail.com',
      phone: '+60 11-1111 2004',
      icNumber: '900405-01-5567',
      dateOfBirth: new Date('1990-04-05'),
      gender: 'Male',
      occupation: 'Personal Trainer',
      race: 'Malay',
      maritalStatus: 'Single',
      bloodType: 'AB+',
      allergies: null,
      referralSource: 'Instagram',
      addressLine1: '22, Jalan Ampang',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '50450',
      emergencyName: 'Fatimah binti Hassan',
      emergencyPhone: '+60 12-999 0004',
      emergencyRelation: 'Mother',
      medicalHistory: 'Sports injury — rotator cuff strain. Herniated disc L4-L5 from deadlifting.',
      notes: 'Very active lifestyle. Needs sports-specific rehab program.',
      status: 'active',
      doctorIndex: 0,
    },
    {
      firstName: 'Wong',
      lastName: 'Kai Xin',
      email: 'kaixin.wong@gmail.com',
      phone: '+60 11-1111 2005',
      icNumber: '880620-14-3398',
      dateOfBirth: new Date('1988-06-20'),
      gender: 'Female',
      occupation: 'Marketing Manager',
      race: 'Chinese',
      maritalStatus: 'Married',
      bloodType: 'O-',
      allergies: 'Ibuprofen',
      referralSource: 'Google Search',
      addressLine1: '15, Persiaran KLCC',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '50088',
      emergencyName: 'Wong Jun Wei',
      emergencyPhone: '+60 12-999 0005',
      emergencyRelation: 'Husband',
      medicalHistory: 'Prenatal care — 28 weeks pregnant. Sciatic pain on right side.',
      notes: 'Referred for Webster Technique. Prefers Dr. Aisha.',
      status: 'active',
      doctorIndex: 1,
    },
    {
      firstName: 'Siti',
      lastName: 'Nurhaliza',
      email: 'siti.nurhaliza@gmail.com',
      phone: '+60 11-1111 2006',
      icNumber: '950101-06-7788',
      dateOfBirth: new Date('1995-01-01'),
      gender: 'Female',
      occupation: 'Nurse',
      race: 'Malay',
      maritalStatus: 'Single',
      bloodType: 'A-',
      allergies: null,
      referralSource: 'Walk-in',
      addressLine1: '33, Jalan Tun Razak',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '50400',
      emergencyName: 'Zainab binti Ali',
      emergencyPhone: '+60 12-999 0006',
      emergencyRelation: 'Sister',
      medicalHistory: 'Repetitive strain injury from patient handling. Wrist and shoulder pain.',
      notes: 'Shift worker — needs flexible appointment times.',
      status: 'active',
      doctorIndex: 0,
    },
    {
      firstName: 'Liew',
      lastName: 'Chun Hao',
      email: 'chunhao.liew@outlook.com',
      phone: '+60 11-1111 2007',
      icNumber: '700215-07-9901',
      dateOfBirth: new Date('1970-02-15'),
      gender: 'Male',
      occupation: 'Retired',
      race: 'Chinese',
      maritalStatus: 'Married',
      bloodType: 'B-',
      allergies: 'Aspirin',
      referralSource: 'Son recommended',
      addressLine1: '7, Jalan Bangsar',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '59200',
      emergencyName: 'Liew Jun Yang',
      emergencyPhone: '+60 12-999 0007',
      emergencyRelation: 'Son',
      medicalHistory: 'Degenerative disc disease. Osteoarthritis in cervical spine. Previous cervical fusion C5-C6.',
      notes: 'Requires gentle technique only. No manual manipulation of cervical spine.',
      status: 'active',
      doctorIndex: 2,
    },
    {
      firstName: 'Muthu',
      lastName: 'Selvam',
      email: 'muthu.selvam@gmail.com',
      phone: '+60 11-1111 2008',
      icNumber: '830730-10-2234',
      dateOfBirth: new Date('1983-07-30'),
      gender: 'Male',
      occupation: 'Construction Foreman',
      race: 'Indian',
      maritalStatus: 'Married',
      bloodType: 'O+',
      allergies: null,
      referralSource: 'Colleague',
      addressLine1: '18, Jalan Klang Lama',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '58100',
      emergencyName: 'Lakshmi Selvam',
      emergencyPhone: '+60 12-999 0008',
      emergencyRelation: 'Wife',
      medicalHistory: 'Heavy lifting injuries. Chronic lumbar pain. Disc bulge L5-S1.',
      notes: 'Only available on weekends and after 5pm on weekdays.',
      status: 'active',
      doctorIndex: 2,
    },
    {
      firstName: 'Nurul',
      lastName: 'Izzati',
      email: 'nurul.izzati@gmail.com',
      phone: '+60 11-1111 2009',
      icNumber: '000512-14-6677',
      dateOfBirth: new Date('2000-05-12'),
      gender: 'Female',
      occupation: 'University Student',
      race: 'Malay',
      maritalStatus: 'Single',
      bloodType: 'A+',
      allergies: null,
      referralSource: 'University health center',
      addressLine1: '5, Jalan Universiti',
      city: 'Petaling Jaya',
      state: 'Selangor',
      postcode: '46200',
      emergencyName: 'Roslan bin Yusof',
      emergencyPhone: '+60 12-999 0009',
      emergencyRelation: 'Father',
      medicalHistory: 'Poor posture from prolonged studying. Tension headaches.',
      notes: 'Student budget — consider shorter sessions. Very responsive to treatment.',
      status: 'active',
      doctorIndex: 1,
    },
    {
      firstName: 'David',
      lastName: 'Ong',
      email: 'david.ong@proton.me',
      phone: '+60 11-1111 2010',
      icNumber: '870923-10-1122',
      dateOfBirth: new Date('1987-09-23'),
      gender: 'Male',
      occupation: 'Lawyer',
      race: 'Chinese',
      maritalStatus: 'Divorced',
      bloodType: 'AB-',
      allergies: 'Codeine',
      referralSource: 'Google Search',
      addressLine1: '10, Jalan Sultan Ismail',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '50250',
      emergencyName: 'Ong Mei Fong',
      emergencyPhone: '+60 12-999 0010',
      emergencyRelation: 'Mother',
      medicalHistory: 'Stress-related tension. TMJ dysfunction. Cervical spine subluxation.',
      notes: 'High-stress occupation. Benefits from full-spine adjustments.',
      status: 'active',
      doctorIndex: 0,
    },
    {
      firstName: 'Zainab',
      lastName: 'binti Osman',
      email: 'zainab.osman@gmail.com',
      phone: '+60 11-1111 2011',
      icNumber: '750818-02-4456',
      dateOfBirth: new Date('1975-08-18'),
      gender: 'Female',
      occupation: 'Business Owner',
      race: 'Malay',
      maritalStatus: 'Widowed',
      bloodType: 'B+',
      allergies: null,
      referralSource: 'Newspaper ad',
      addressLine1: '25, Jalan Damansara',
      city: 'Petaling Jaya',
      state: 'Selangor',
      postcode: '47400',
      emergencyName: 'Kamal bin Osman',
      emergencyPhone: '+60 12-999 0011',
      emergencyRelation: 'Son',
      medicalHistory: 'Post-menopausal osteopenia. Mild kyphosis. Lower back stiffness.',
      notes: 'VIP patient — very particular about punctuality. Prefers private treatment room.',
      status: 'active',
      doctorIndex: 2,
    },
    {
      firstName: 'Lee',
      lastName: 'Jia Hui',
      email: 'jiahui.lee@gmail.com',
      phone: '+60 11-1111 2012',
      icNumber: '960304-14-8899',
      dateOfBirth: new Date('1996-03-04'),
      gender: 'Female',
      occupation: 'Graphic Designer',
      race: 'Chinese',
      maritalStatus: 'Single',
      bloodType: 'O+',
      allergies: null,
      referralSource: 'TikTok',
      addressLine1: '42, Jalan Imbi',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '55100',
      emergencyName: 'Lee Ah Kow',
      emergencyPhone: '+60 12-999 0012',
      emergencyRelation: 'Father',
      medicalHistory: 'Text neck syndrome. Mouse shoulder (right side). Carpal tunnel symptoms.',
      notes: 'Digital nomad — sometimes works from clinic lobby while waiting.',
      status: 'active',
      doctorIndex: 1,
    },
    {
      firstName: 'Arjun',
      lastName: 'Pillai',
      email: 'arjun.pillai@gmail.com',
      phone: '+60 11-1111 2013',
      icNumber: '810611-07-3345',
      dateOfBirth: new Date('1981-06-11'),
      gender: 'Male',
      occupation: 'Taxi Driver (e-hailing)',
      race: 'Indian',
      maritalStatus: 'Married',
      bloodType: 'A+',
      allergies: null,
      referralSource: 'Family member',
      addressLine1: '16, Jalan Sentul',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '51000',
      emergencyName: 'Devi Pillai',
      emergencyPhone: '+60 12-999 0013',
      emergencyRelation: 'Wife',
      medicalHistory: 'Prolonged sitting — sciatica. Hip flexor tightness. Lumbar disc protrusion.',
      notes: 'Irregular schedule due to e-hailing work. Prefers walk-in when available.',
      status: 'active',
      doctorIndex: 0,
    },
    {
      firstName: 'Hafiz',
      lastName: 'bin Abdullah',
      email: 'hafiz.abdullah@gmail.com',
      phone: '+60 11-1111 2014',
      icNumber: '980220-14-5501',
      dateOfBirth: new Date('1998-02-20'),
      gender: 'Male',
      occupation: 'Badminton Coach',
      race: 'Malay',
      maritalStatus: 'Single',
      bloodType: 'O+',
      allergies: null,
      referralSource: 'Sports club',
      addressLine1: '9, Jalan Bukit Kiara',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '60000',
      emergencyName: 'Abdullah bin Hashim',
      emergencyPhone: '+60 12-999 0014',
      emergencyRelation: 'Father',
      medicalHistory: 'Shoulder impingement (right). Ankle sprain history. Sports performance optimization.',
      notes: 'Athlete — interested in performance chiropractic, not just pain relief.',
      status: 'active',
      doctorIndex: 0,
    },
    {
      firstName: 'Chong',
      lastName: 'Siew Mei',
      email: null,
      phone: '+60 11-1111 2015',
      icNumber: '650430-08-2278',
      dateOfBirth: new Date('1965-04-30'),
      gender: 'Female',
      occupation: 'Homemaker',
      race: 'Chinese',
      maritalStatus: 'Married',
      bloodType: 'B+',
      allergies: 'Shellfish (dietary only)',
      referralSource: 'Daughter brought her',
      addressLine1: '3, Jalan Cheras',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '56100',
      emergencyName: 'Chong Mei Yi',
      emergencyPhone: '+60 12-999 0015',
      emergencyRelation: 'Daughter',
      medicalHistory: 'Frozen shoulder (left). Cervical spondylosis. Hypertension (controlled with medication).',
      notes: 'Elderly patient. Daughter usually accompanies. Speaks limited English — prefers Mandarin.',
      status: 'active',
      doctorIndex: 2,
    },
    {
      firstName: 'Sarah',
      lastName: 'binti Yusof',
      email: 'sarah.yusof@gmail.com',
      phone: '+60 11-1111 2016',
      icNumber: '911115-14-9902',
      dateOfBirth: new Date('1991-11-15'),
      gender: 'Female',
      occupation: 'Flight Attendant',
      race: 'Malay',
      maritalStatus: 'Married',
      bloodType: 'A+',
      allergies: null,
      referralSource: 'Crew member recommendation',
      addressLine1: '28, Jalan Kia Peng',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '50450',
      emergencyName: 'Yusof bin Hamid',
      emergencyPhone: '+60 12-999 0016',
      emergencyRelation: 'Husband',
      medicalHistory: 'Upper back pain from luggage handling. Jet lag related tension. Poor sleep posture.',
      notes: 'Travels frequently — books appointments in batches when in KL.',
      status: 'inactive',
      doctorIndex: 1,
    },
    {
      firstName: 'Ganesh',
      lastName: 'Rao',
      email: 'ganesh.rao@gmail.com',
      phone: '+60 11-1111 2017',
      icNumber: '720805-10-1190',
      dateOfBirth: new Date('1972-08-05'),
      gender: 'Male',
      occupation: 'Chef',
      race: 'Indian',
      maritalStatus: 'Married',
      bloodType: 'O-',
      allergies: null,
      referralSource: 'Walk-in',
      addressLine1: '11, Jalan Alor',
      city: 'Kuala Lumpur',
      state: 'Wilayah Persekutuan',
      postcode: '50200',
      emergencyName: 'Meena Rao',
      emergencyPhone: '+60 12-999 0017',
      emergencyRelation: 'Wife',
      medicalHistory: 'Standing for long hours. Plantar fasciitis. Lower back pain with radiating leg pain.',
      notes: 'Works late nights — only available before 11am or on Mondays (restaurant closed).',
      status: 'active',
      doctorIndex: 2,
    },
    {
      firstName: 'Amir',
      lastName: 'bin Zakaria',
      email: 'amir.zakaria@gmail.com',
      phone: '+60 11-1111 2018',
      icNumber: '030901-14-3344',
      dateOfBirth: new Date('2003-09-01'),
      gender: 'Male',
      occupation: 'College Student (IT)',
      race: 'Malay',
      maritalStatus: 'Single',
      bloodType: 'AB+',
      allergies: null,
      referralSource: 'Mother is existing patient',
      addressLine1: '6, Jalan Gasing',
      city: 'Petaling Jaya',
      state: 'Selangor',
      postcode: '46000',
      emergencyName: 'Zainab binti Osman',
      emergencyPhone: '+60 12-999 0011',
      emergencyRelation: 'Mother',
      medicalHistory: 'Gaming posture issues. Thoracic kyphosis. Neck pain.',
      notes: 'Son of patient Zainab. Young and responsive to postural correction exercises.',
      status: 'active',
      doctorIndex: 1,
    },
  ]

  let patientCount = 0
  // Varied pricing tiers (RM) — some patients have custom rates
  const pricingTiers = [
    { initial: 250, first: 180, followup: 120 },
    { initial: 300, first: 200, followup: 140 },
    { initial: 220, first: 160, followup: 100 },
    null, // some patients have no custom pricing (use branch default)
  ]

  for (const p of patientsData) {
    const doctor = allDoctors[p.doctorIndex]
    const pricing = pricingTiers[patientCount % pricingTiers.length]

    await prisma.patient.upsert({
      where: {
        id: `seed-patient-${String(patientCount + 1).padStart(3, '0')}`,
      },
      update: {},
      create: {
        id: `seed-patient-${String(patientCount + 1).padStart(3, '0')}`,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        phone: p.phone,
        icNumber: p.icNumber,
        dateOfBirth: p.dateOfBirth,
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
        addressLine2: (p as Record<string, unknown>).addressLine2 as string | undefined,
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
        branchId: branch.id,
        doctorId: doctor.id,
      },
    })

    patientCount++
  }

  console.log(`Seeded ${patientCount} patients`)

  const now = new Date()

  // ─── Packages (templates) ───
  // Wipe existing seed-* packages + patient-packages so re-runs stay clean
  await prisma.patientPackage.deleteMany({ where: { id: { startsWith: 'seed-pp-' } } })
  await prisma.package.deleteMany({ where: { id: { startsWith: 'seed-pkg-' } } })
  await prisma.invoice.deleteMany({ where: { invoiceNumber: { startsWith: 'SEED-' } } })

  const packageDefs = [
    {
      id: 'seed-pkg-001',
      name: '10-Visit Adjustment Plan',
      description: 'Best value for chronic conditions. 10 sessions to be used within 6 months.',
      sessionCount: 10,
      price: 1500,
      validityDays: 180,
    },
    {
      id: 'seed-pkg-002',
      name: '5-Visit Trial Package',
      description: 'Perfect intro package — 5 adjustments to start your wellness journey.',
      sessionCount: 5,
      price: 800,
      validityDays: 90,
    },
    {
      id: 'seed-pkg-003',
      name: 'Monthly Unlimited',
      description: 'Up to 30 visits in 30 days for athletes & frequent users.',
      sessionCount: 30,
      price: 2500,
      validityDays: 30,
    },
  ]

  const createdPackages: { id: string; sessionCount: number; price: number }[] = []
  for (const pkg of packageDefs) {
    await prisma.package.create({
      data: {
        id: pkg.id,
        branchId: branch.id,
        name: pkg.name,
        description: pkg.description,
        sessionCount: pkg.sessionCount,
        price: pkg.price,
        validityDays: pkg.validityDays,
      },
    })
    createdPackages.push({ id: pkg.id, sessionCount: pkg.sessionCount, price: pkg.price })
  }
  console.log(`Seeded ${createdPackages.length} package templates`)

  // ─── PatientPackages — sell packages to ~30% of patients ───
  // Pattern: patient indices 0, 3, 6, 8, 11, 14 get packages
  const packageSales: { patientIdx: number; pkgIdx: number; sessionsUsed: number; markPaid: boolean; daysAgo: number }[] = [
    { patientIdx: 0, pkgIdx: 0, sessionsUsed: 5, markPaid: true, daysAgo: 90 },     // half-used 10-visit
    { patientIdx: 3, pkgIdx: 1, sessionsUsed: 2, markPaid: true, daysAgo: 25 },     // 5-visit, partly used
    { patientIdx: 6, pkgIdx: 0, sessionsUsed: 8, markPaid: true, daysAgo: 100 },    // 10-visit nearly done
    { patientIdx: 8, pkgIdx: 2, sessionsUsed: 12, markPaid: true, daysAgo: 14 },    // monthly active
    { patientIdx: 11, pkgIdx: 1, sessionsUsed: 0, markPaid: false, daysAgo: 5 },    // just bought, unpaid
    { patientIdx: 14, pkgIdx: 0, sessionsUsed: 3, markPaid: true, daysAgo: 60 },    // 10-visit early
  ]

  let invoiceSeq = 1
  const nextInvNum = (prefix: string) => `SEED-${prefix}-${String(invoiceSeq++).padStart(4, '0')}`

  let patientPackageCount = 0
  for (const sale of packageSales) {
    if (sale.patientIdx >= patientCount) continue
    const patientId = `seed-patient-${String(sale.patientIdx + 1).padStart(3, '0')}`
    const pkg = createdPackages[sale.pkgIdx]
    if (!pkg) continue
    const purchasedAt = new Date(now)
    purchasedAt.setDate(purchasedAt.getDate() - sale.daysAgo)
    const validity = packageDefs[sale.pkgIdx].validityDays
    const expiresAt = validity ? new Date(purchasedAt.getTime() + validity * 24 * 60 * 60 * 1000) : null

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: nextInvNum('PKG'),
        amount: pkg.price,
        currency: 'MYR',
        status: sale.markPaid ? 'PAID' : 'DRAFT',
        paymentMethod: sale.markPaid ? 'CASH' : null,
        paidAt: sale.markPaid ? purchasedAt : null,
        lineItems: [
          {
            description: `${packageDefs[sale.pkgIdx].name} (${pkg.sessionCount} sessions)`,
            quantity: 1,
            unitPrice: pkg.price,
            total: pkg.price,
          },
        ],
        patientId,
        branchId: branch.id,
        notes: `Package purchase`,
      },
    })

    const status = sale.sessionsUsed >= pkg.sessionCount ? 'COMPLETED' : 'ACTIVE'
    await prisma.patientPackage.create({
      data: {
        id: `seed-pp-${String(patientPackageCount + 1).padStart(3, '0')}`,
        patientId,
        packageId: pkg.id,
        branchId: branch.id,
        purchasedAt,
        expiresAt,
        sessionsTotal: pkg.sessionCount,
        sessionsUsed: sale.sessionsUsed,
        totalPrice: pkg.price,
        status,
        invoiceId: invoice.id,
      },
    })
    patientPackageCount++
  }
  console.log(`Seeded ${patientPackageCount} patient packages`)

  // ─── Visits with questionnaires (enhanced) ───
  const visitData = [
    {
      patientIdx: 0, daysAgo: 3, visitType: 'follow_up', chiefComplaint: 'Lower back pain follow-up',
      subjective: 'Lower back pain improved since last visit. Pain 4/10 from 7/10.', objective: 'Lumbar ROM improved. L4-L5 still restricted on palpation.', assessment: 'Improving lumbar subluxation complex. Good response to Gonstead adjustments.', plan: 'Continue bi-weekly adjustments. Add core stability exercises.',
      areasAdjusted: 'L4, L5, SI', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 posterior body, PI ilium left',
      bpSys: 125, bpDia: 82, hr: 68, weight: 78.5, temp: 36.6,
      recommendations: 'Core stability exercises 3x/week. Ergonomic desk setup.', nextVisitDays: 14,
      q: { painLevel: 4, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 7, patientComments: 'Much better than two weeks ago. Can sit longer without pain.' },
    },
    {
      patientIdx: 0, daysAgo: 17, visitType: 'initial', chiefComplaint: 'Acute lower back pain',
      subjective: 'Acute lower back pain after prolonged sitting at work. Pain 7/10.', objective: 'Antalgic posture. Reduced lumbar lordosis. Positive Kemp test left.', assessment: 'Lumbar subluxation L4-L5 with disc involvement.', plan: 'Gonstead adjustment L4-L5. Ice 15min post-adjustment. Ergonomic desk review.',
      areasAdjusted: 'L4, L5', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 posterior disc, left rotation',
      bpSys: 135, bpDia: 88, hr: 78, weight: 79.0, temp: 36.5,
      recommendations: 'Ice 15min every 2 hours. Avoid prolonged sitting. Use lumbar support.', nextVisitDays: 14,
      q: { painLevel: 7, mobilityScore: 3, sleepQuality: 4, dailyFunction: 4, overallImprovement: 3, patientComments: 'Pain is quite bad. Difficult to sleep on my side.' },
    },
    {
      patientIdx: 0, daysAgo: 31, visitType: 'follow_up', chiefComplaint: 'Lower back pain progress check',
      subjective: 'Pain reducing gradually. Down to 5/10. Sleeping better.', objective: 'Lumbar flexion improved 20%. L4-L5 less restricted.', assessment: 'Good progress. Subluxation pattern improving.', plan: 'Continue current adjustment protocol.',
      areasAdjusted: 'L4, L5, T12', techniqueUsed: 'Gonstead', subluxationFindings: 'L4 posterior body improving',
      bpSys: 128, bpDia: 84, hr: 72, weight: 78.8, temp: 36.5,
      recommendations: 'Begin gentle stretching routine. Walking 20min daily.', nextVisitDays: 14,
      q: { painLevel: 5, mobilityScore: 5, sleepQuality: 6, dailyFunction: 6, overallImprovement: 5, patientComments: 'Slowly getting better. The stretches help.' },
    },
    {
      patientIdx: 2, daysAgo: 1, visitType: 'follow_up', chiefComplaint: 'Maintenance visit',
      subjective: 'Maintenance visit. Feeling good overall. Mild stiffness in thoracic region.', objective: 'T5-T7 fixation on palpation. Scoliotic curve stable.', assessment: 'Stable thoracic subluxation pattern. Scoliosis maintained.', plan: 'Thoracic adjustment T5-T7. Continue 2-week maintenance schedule.',
      areasAdjusted: 'T5, T6, T7', techniqueUsed: 'Thompson', subluxationFindings: 'T5-T7 bilateral restriction',
      bpSys: 118, bpDia: 76, hr: 65, weight: 62.0, temp: 36.4,
      recommendations: 'Continue yoga 2x/week. Posture breaks every 45min while teaching.', nextVisitDays: 14,
      q: { painLevel: 2, mobilityScore: 8, sleepQuality: 8, dailyFunction: 9, overallImprovement: 8, patientComments: 'Feeling great. Yoga has been helping a lot.' },
    },
    {
      patientIdx: 2, daysAgo: 15, visitType: 'follow_up', chiefComplaint: 'Thoracic stiffness after marking',
      subjective: 'Thoracic stiffness after long weekend of marking exam papers.', objective: 'Increased T5-T7 fixation. Mild paraspinal muscle spasm.', assessment: 'Thoracic subluxation exacerbation from sustained flexion posture.', plan: 'Thompson technique adjustment. Postural awareness education.',
      areasAdjusted: 'T5, T6, T7, T8', techniqueUsed: 'Thompson', subluxationFindings: 'T5-T8 increased fixation bilaterally',
      bpSys: 120, bpDia: 78, hr: 68, weight: 62.2, temp: 36.5,
      recommendations: 'Take breaks every 30min during marking. Use a standing desk.', nextVisitDays: 14,
      q: { painLevel: 4, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 6, patientComments: 'Stiff from all the marking. Need to be more careful with posture.' },
    },
    {
      patientIdx: 3, daysAgo: 5, visitType: 'follow_up', chiefComplaint: 'Sports rehab progress',
      subjective: 'Shoulder pain reduced. Disc symptoms stable. Training at 70% intensity.', objective: 'Right shoulder ROM near full. Positive SLR at 60° (improved from 45°).', assessment: 'Improving L4-L5 disc herniation. Shoulder impingement resolving.', plan: 'Gradual return to full training. Adjustment focus on lumbar and shoulder girdle.',
      areasAdjusted: 'L4, L5, Right shoulder', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 improving, right AC joint restriction',
      bpSys: 122, bpDia: 75, hr: 58, weight: 82.0, temp: 36.6,
      recommendations: 'Progress to 80% training intensity. Rotator cuff exercises daily.', nextVisitDays: 7,
      q: { painLevel: 3, mobilityScore: 7, sleepQuality: 8, dailyFunction: 8, overallImprovement: 8, patientComments: 'Feeling strong. Ready to get back to full training soon.' },
    },
    {
      patientIdx: 6, daysAgo: 7, visitType: 'follow_up', chiefComplaint: 'Cervical maintenance post-fusion',
      subjective: 'Neck stiffness improved. No radiating arm symptoms this week.', objective: 'Cervical ROM restricted in rotation. C5-C6 fusion stable.', assessment: 'Stable post-surgical cervical spine. Compensatory patterns above and below fusion.', plan: 'Gentle Activator adjustment C3-C4 and C7-T1. Avoid manual cervical manipulation.',
      areasAdjusted: 'C3, C4, C7, T1', techniqueUsed: 'Activator', subluxationFindings: 'C3-C4 restriction, C7-T1 compensatory fixation',
      bpSys: 142, bpDia: 88, hr: 72, weight: 70.5, temp: 36.5,
      recommendations: 'Gentle neck stretches only. No forceful movements. Heat pack 15min before bed.', nextVisitDays: 14,
      q: { painLevel: 3, mobilityScore: 5, sleepQuality: 6, dailyFunction: 6, overallImprovement: 6, patientComments: 'Better than before. Arm numbness has stopped.' },
    },
    {
      patientIdx: 4, daysAgo: 2, visitType: 'follow_up', chiefComplaint: 'Prenatal Webster technique',
      subjective: 'Sciatic pain much better. Baby very active. 30 weeks now.', objective: 'Webster technique assessment positive. SI joint dysfunction right.', assessment: 'Pregnancy-related SI joint dysfunction. Responding well to Webster technique.', plan: 'Continue Webster technique weekly until delivery. Pelvic support belt recommended.',
      areasAdjusted: 'SI joint, Sacrum', techniqueUsed: 'Diversified', subluxationFindings: 'Right SI joint posterior, sacral misalignment',
      bpSys: 115, bpDia: 72, hr: 80, weight: 68.5, temp: 36.7,
      recommendations: 'Pelvic support belt during walking. Pregnancy pillow for sleeping.', nextVisitDays: 7,
      q: { painLevel: 3, mobilityScore: 6, sleepQuality: 5, dailyFunction: 7, overallImprovement: 7, patientComments: 'Sciatica is so much better! Baby is kicking a lot.' },
    },
    {
      patientIdx: 9, daysAgo: 10, visitType: 'follow_up', chiefComplaint: 'TMJ and cervical tension',
      subjective: 'Jaw clicking reduced. Neck tension still present after long court cases.', objective: 'TMJ dysfunction right side. Cervical subluxation C1-C2.', assessment: 'TMJ-cervical complex dysfunction. Stress-related muscle tension.', plan: 'Atlas adjustment. TMJ release technique. Stress management discussion.',
      areasAdjusted: 'C1, C2, TMJ right', techniqueUsed: 'Gonstead', subluxationFindings: 'Atlas laterality right, C2 rotation left',
      bpSys: 138, bpDia: 90, hr: 82, weight: 76.0, temp: 36.5,
      recommendations: 'Jaw relaxation exercises. Reduce caffeine intake. Stress management techniques.', nextVisitDays: 10,
      q: { painLevel: 4, mobilityScore: 6, sleepQuality: 5, dailyFunction: 7, overallImprovement: 6, patientComments: 'Jaw is better but work stress makes the neck tight again.' },
    },
    {
      patientIdx: 1, daysAgo: 8, visitType: 'follow_up', chiefComplaint: 'Neck pain and headaches follow-up',
      subjective: 'Headaches reduced from daily to 2x/week. Neck pain improving.', objective: 'Cervical ROM improved. C4-C5 still restricted on left rotation.', assessment: 'Improving cervical subluxation. Headache frequency reducing.', plan: 'Continue cervical adjustments. Monitor headache diary.',
      areasAdjusted: 'C4, C5, C6', techniqueUsed: 'Diversified', subluxationFindings: 'C4-C5 left lateral flexion restriction',
      bpSys: 112, bpDia: 70, hr: 64, weight: 55.0, temp: 36.4,
      recommendations: 'Continue headache diary. Screen break every 20 minutes. Neck stretches.', nextVisitDays: 10,
      q: { painLevel: 4, mobilityScore: 6, sleepQuality: 6, dailyFunction: 7, overallImprovement: 6, patientComments: 'Headaches getting less. Thank you doctor.' },
    },
    {
      patientIdx: 7, daysAgo: 4, visitType: 'follow_up', chiefComplaint: 'Lumbar disc follow-up',
      subjective: 'Leg pain reduced. Can stand for longer periods at work.', objective: 'SLR improved to 70° from 50°. Lumbar flexion better.', assessment: 'L5-S1 disc bulge improving. Nerve root irritation reducing.', plan: 'Flexion-distraction protocol. Core strengthening.',
      areasAdjusted: 'L5, S1', techniqueUsed: 'Flexion-Distraction', subluxationFindings: 'L5-S1 posterior disc bulge, reducing',
      bpSys: 130, bpDia: 85, hr: 74, weight: 85.0, temp: 36.6,
      recommendations: 'McKenzie exercises 2x daily. Avoid heavy lifting for 2 more weeks.', nextVisitDays: 7,
      q: { painLevel: 4, mobilityScore: 5, sleepQuality: 6, dailyFunction: 6, overallImprovement: 6, patientComments: 'Can stand at work better now. Leg pain still there but less.' },
    },
    {
      patientIdx: 5, daysAgo: 12, visitType: 'follow_up', chiefComplaint: 'Shoulder and wrist pain check',
      subjective: 'Shoulder improving after last session. Wrist still bothering during shifts.', objective: 'Right shoulder elevation improved. Carpal tunnel signs positive right wrist.', assessment: 'Improving shoulder strain. Persistent wrist symptoms need attention.', plan: 'Shoulder adjustment. Wrist brace recommendation. Ergonomic assessment for patient handling.',
      areasAdjusted: 'Right shoulder, T2, T3', techniqueUsed: 'Gonstead', subluxationFindings: 'T2-T3 bilateral restriction, right shoulder girdle',
      bpSys: 110, bpDia: 68, hr: 62, weight: 58.0, temp: 36.4,
      recommendations: 'Wrist brace during heavy lifting shifts. Shoulder stretches before shift.', nextVisitDays: 14,
      q: { painLevel: 5, mobilityScore: 6, sleepQuality: 7, dailyFunction: 6, overallImprovement: 5, patientComments: 'Shoulder is better but wrist still sore during night shifts.' },
    },
    // Extended history for patient 0 (Ahmad) — showing long recovery arc
    {
      patientIdx: 0, daysAgo: 45, visitType: 'follow_up', chiefComplaint: 'Lower back pain — mid-treatment check',
      subjective: 'Pain 6/10. Some improvement but still restrictive.', objective: 'Mild improvement in lumbar ROM. L4-L5 remains restricted.', assessment: 'Gradual improvement. Need patience with chronic pattern.', plan: 'Continue Gonstead 2x/week for 2 more weeks.',
      areasAdjusted: 'L4, L5', techniqueUsed: 'Gonstead', subluxationFindings: 'L4-L5 persistent restriction',
      bpSys: 132, bpDia: 86, hr: 75, weight: 79.2, temp: 36.6,
      recommendations: 'Heat pack 20 min before adjustment. Swim 2x/week.', nextVisitDays: 7,
      q: { painLevel: 6, mobilityScore: 4, sleepQuality: 5, dailyFunction: 5, overallImprovement: 4 },
    },
    {
      patientIdx: 0, daysAgo: 60, visitType: 'follow_up', chiefComplaint: 'Weekly maintenance adjustment',
      subjective: 'Acute flare after long flight. Pain 8/10 at worst, now 6/10.', objective: 'Myofascial tightness throughout lumbar paraspinals. Sacroiliac inflammation suspected.', assessment: 'Flare-up from prolonged sitting. No neurological red flags.', plan: 'Aggressive adjustment. Add SI mobilization.',
      areasAdjusted: 'L4, L5, SI bilateral', techniqueUsed: 'Gonstead',
      // No vitals, no recommendations — doctor was rushed
    },
    // Patient 11 (Lee Jia Hui) — text neck, no questionnaire on brief visits
    {
      patientIdx: 11, daysAgo: 2, visitType: 'initial', chiefComplaint: 'Text neck and mouse shoulder',
      subjective: 'Neck hurts after long design sessions. Right shoulder tight.', objective: 'Forward head posture. Upper cross syndrome signs.', assessment: 'Postural distortion pattern from prolonged screen use.', plan: 'Postural correction exercises. Ergonomic assessment of workstation.',
      areasAdjusted: 'C5, C6, T1, Right shoulder', techniqueUsed: 'Diversified',
      recommendations: 'Monitor height raise. 20-20-20 rule for screen breaks. Chin tucks every hour.', nextVisitDays: 14,
      q: { painLevel: 5, mobilityScore: 6, sleepQuality: 7, dailyFunction: 7, overallImprovement: 5, patientComments: 'Never realized my posture was so bad.' },
    },
    // Patient 13 (Hafiz) — athlete, no questionnaire (performance visit)
    {
      patientIdx: 13, daysAgo: 6, visitType: 'initial', chiefComplaint: 'Performance optimization — no pain complaint',
      subjective: 'No pain. Wants performance tune-up before tournament next month.', objective: 'Minor T4-T6 asymmetry. Hip flexor tightness bilaterally.', assessment: 'Healthy athlete with minor functional asymmetries.', plan: 'Performance adjustment series. 4 visits over 4 weeks.',
      areasAdjusted: 'T4, T5, T6, Bilateral hips', techniqueUsed: 'Diversified', subluxationFindings: 'T4-T6 right rotation pattern',
      bpSys: 118, bpDia: 72, hr: 52, weight: 72.0,
      recommendations: 'Dynamic stretching routine. Stick to existing training plan.', nextVisitDays: 7,
    },
    // Patient 12 (Arjun) — recent initial visit, just pain, no questionnaire
    {
      patientIdx: 12, daysAgo: 9, visitType: 'initial', chiefComplaint: 'Sciatica and hip tightness',
      subjective: 'Right-side sciatica radiating down leg. Driver all day.', objective: 'Positive SLR 50° right. Tight hip flexors. Lumbar flexion limited.', assessment: 'L5-S1 lumbar subluxation with sciatic nerve irritation.', plan: 'Gonstead L5-S1. Piriformis release. Stretching program.',
      areasAdjusted: 'L5, S1, Right piriformis', techniqueUsed: 'Gonstead', subluxationFindings: 'L5-S1 right posterior body',
      bpSys: 135, bpDia: 86, hr: 76, weight: 72.5,
      recommendations: 'Piriformis stretch 3x daily. Hip flexor stretches. Reduce driving to 2hr stretches.', nextVisitDays: 4,
      q: { painLevel: 7, mobilityScore: 4, sleepQuality: 5, dailyFunction: 4, overallImprovement: 3, patientComments: 'Pain wakes me up at night.' },
    },
    // Patient 8 (Nurul Izzati) — student, 2 visits
    {
      patientIdx: 8, daysAgo: 5, visitType: 'initial', chiefComplaint: 'Tension headaches and neck pain',
      subjective: 'Daily headaches during exam period. Neck pain from studying.', objective: 'Suboccipital tension. C1-C2 restriction. Upper trap trigger points.', assessment: 'Cervicogenic headaches from study posture.', plan: 'Cervical adjustment. Suboccipital release. Study posture education.',
      areasAdjusted: 'C1, C2, C3', techniqueUsed: 'Diversified', subluxationFindings: 'C1 right lateral, C2-C3 fixation',
      bpSys: 112, bpDia: 70, hr: 68, weight: 52.0,
      recommendations: 'Study breaks every 45 min. Neck stretches. Adequate sleep.', nextVisitDays: 7,
      q: { painLevel: 6, mobilityScore: 5, sleepQuality: 4, dailyFunction: 6, overallImprovement: 4 },
    },
    {
      patientIdx: 8, daysAgo: 20, visitType: 'follow_up', chiefComplaint: 'Headache frequency check',
      subjective: 'Headaches down to 2x/week. Much better during exams.', objective: 'C1-C2 mobility improved. Less trigger point tenderness.', assessment: 'Good response to treatment. Study strategy working.', plan: 'Continue current protocol.',
      areasAdjusted: 'C1, C2', techniqueUsed: 'Diversified',
      // No vitals, quick follow-up
    },
    // Patient 14 (Chong Siew Mei) — elderly, gentle
    {
      patientIdx: 14, daysAgo: 11, visitType: 'initial', chiefComplaint: 'Frozen shoulder left side',
      subjective: 'Cannot lift arm above shoulder. 3 months now. Very frustrated.', objective: 'Left shoulder abduction 60°. External rotation 10°. Cervical compensation.', assessment: 'Adhesive capsulitis left shoulder with cervical compensation.', plan: 'Gentle mobilization. Activator for cervical. Home exercises.',
      areasAdjusted: 'C5, C6, Left shoulder capsule', techniqueUsed: 'Activator', subluxationFindings: 'Left shoulder capsular restriction, C5-C6 compensatory fixation',
      bpSys: 148, bpDia: 88, hr: 78, weight: 58.0, temp: 36.5,
      recommendations: 'Pendulum exercises 3x daily. Heat before exercises. Very gradual progression.', referrals: 'Consider orthopedic consult if no improvement in 8 weeks.', nextVisitDays: 7,
      q: { painLevel: 6, mobilityScore: 3, sleepQuality: 5, dailyFunction: 4, overallImprovement: 3, patientComments: 'Cannot comb my hair. Very worried about driving.' },
    },
    // Patient 16 (Ganesh Rao) — chef, no questionnaire on first visit
    {
      patientIdx: 16, daysAgo: 4, visitType: 'initial', chiefComplaint: 'Plantar fasciitis and low back pain',
      subjective: 'Feet hurt when waking up. Lower back tight after long shifts.', objective: 'Plantar fascia tenderness bilaterally. Lumbar paraspinal tightness.', assessment: 'Foot-to-back biomechanical chain dysfunction.', plan: 'Lumbar adjustment. Foot mobilization. Arch support recommendation.',
      areasAdjusted: 'L5, SI, Both feet', techniqueUsed: 'Diversified', subluxationFindings: 'Pronated feet contributing to pelvic unleveling',
      recommendations: 'Orthotic arch supports. Night splints. Anti-fatigue mats at work.', nextVisitDays: 7,
    },
  ]

  let visitCount = 0
  let qCount = 0
  for (const v of visitData) {
    const vAny = v as Record<string, unknown>
    const patientId = `seed-patient-${String(v.patientIdx + 1).padStart(3, '0')}`
    const patient = patientsData[v.patientIdx]
    const doctor = allDoctors[patient.doctorIndex]
    const visitDate = new Date(now)
    visitDate.setDate(visitDate.getDate() - v.daysAgo)

    const q = vAny.q as {
      painLevel: number
      mobilityScore: number
      sleepQuality: number
      dailyFunction: number
      overallImprovement: number
      patientComments?: string
    } | undefined

    const visitTypeEnum = mapVisitType(v.visitType)
    const createdVisit = await prisma.visit.create({
      data: {
        visitDate,
        visitType: visitTypeEnum,
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
        referrals: (vAny.referrals as string | undefined) ?? null,
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

    // ── Billing for the visit ──
    // Distribution per index (deterministic):
    //   0,4,8,12,16: PAID per-visit
    //   1,5,9,13,17: PAID per-visit
    //   2,6,10,14:    DRAFT (unpaid)
    //   3,7,11,15:    package redemption (if patient has active package, else PAID)
    //   18+:          mix of OVERDUE / PAID
    const tier = pricingTiers[v.patientIdx % pricingTiers.length]
    const baseFee = (() => {
      if (visitTypeEnum === 'INITIAL_CONSULTATION') return tier?.initial ?? 250
      if (visitTypeEnum === 'FIRST_TREATMENT') return tier?.first ?? 180
      return tier?.followup ?? 120
    })()

    const mode = (() => {
      const rem = visitCount % 5
      if (rem === 0 || rem === 1) return 'PAID'
      if (rem === 2) return 'DRAFT'
      if (rem === 3) return 'PACKAGE'
      return 'OVERDUE'
    })()

    if (mode === 'PACKAGE') {
      const pp = await prisma.patientPackage.findFirst({
        where: { patientId, status: 'ACTIVE' },
      })
      if (pp && pp.sessionsUsed < pp.sessionsTotal) {
        await prisma.patientPackage.update({
          where: { id: pp.id },
          data: {
            sessionsUsed: { increment: 1 },
            status: pp.sessionsUsed + 1 >= pp.sessionsTotal ? 'COMPLETED' : 'ACTIVE',
          },
        })
        await prisma.visit.update({
          where: { id: createdVisit.id },
          data: { patientPackageId: pp.id },
        })
        continue
      }
      // fall through to PAID if no package available
    }

    const status: InvoiceStatus = mode === 'OVERDUE' ? 'OVERDUE' : mode === 'DRAFT' ? 'DRAFT' : 'PAID'
    const method: PaymentMethod | null = status === 'PAID' ? (visitCount % 3 === 0 ? 'CARD' : 'CASH') : null
    const paidAt = status === 'PAID' ? visitDate : null
    const inv = await prisma.invoice.create({
      data: {
        invoiceNumber: nextInvNum('INV'),
        amount: baseFee,
        currency: 'MYR',
        status,
        paymentMethod: method,
        paidAt,
        lineItems: [
          {
            description: `${visitTypeEnum ?? 'Visit'} — ${visitDate.toISOString().slice(0, 10)}`,
            quantity: 1,
            unitPrice: baseFee,
            total: baseFee,
          },
        ],
        patientId,
        branchId: branch.id,
      },
    })
    await prisma.visit.update({
      where: { id: createdVisit.id },
      data: { invoiceId: inv.id },
    })
  }

  console.log(`Seeded ${visitCount} visits (${qCount} with questionnaires, ${visitCount - qCount} without)`)

  // ─── Appointments (upcoming + today) ───
  const appointmentData = [
    { patientIdx: 0, daysFromNow: 0, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 4, daysFromNow: 0, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 8, daysFromNow: 0, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 2, daysFromNow: 0, hour: 15, duration: 30, status: 'CHECKED_IN' as const },
    { patientIdx: 12, daysFromNow: 1, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 3, daysFromNow: 1, hour: 10, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 6, daysFromNow: 2, hour: 9, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 10, daysFromNow: 2, hour: 11, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 9, daysFromNow: 3, hour: 14, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 1, daysFromNow: 4, hour: 10, duration: 30, status: 'SCHEDULED' as const },
    { patientIdx: 7, daysFromNow: 5, hour: 16, duration: 45, status: 'SCHEDULED' as const },
    { patientIdx: 13, daysFromNow: 7, hour: 9, duration: 30, status: 'SCHEDULED' as const },
  ]

  let apptCount = 0
  for (const a of appointmentData) {
    const patientId = `seed-patient-${String(a.patientIdx + 1).padStart(3, '0')}`
    const patient = patientsData[a.patientIdx]
    const doctor = allDoctors[patient.doctorIndex]

    const dateTime = new Date(now)
    dateTime.setDate(dateTime.getDate() + a.daysFromNow)
    dateTime.setHours(a.hour, 0, 0, 0)

    await prisma.appointment.create({
      data: {
        dateTime,
        duration: a.duration,
        status: a.status,
        patientId,
        branchId: branch.id,
        doctorId: doctor.id,
      },
    })
    apptCount++
  }

  console.log(`Seeded ${apptCount} appointments`)

  console.log('\n✓ Seed complete!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
