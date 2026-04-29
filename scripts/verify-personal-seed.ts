import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import 'dotenv/config'

async function main() {
  const p = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL! }) })
  const owner = await p.user.findUnique({ where: { email: process.env.SEED_USER_EMAIL! } })
  console.log('Owner:', owner?.email, '| activeBranchId:', owner?.activeBranchId)
  console.log('Branches:', await p.branch.count({ where: { id: { startsWith: 'personal-branch-' } } }))
  console.log('Doctors:', await p.user.count({ where: { id: { startsWith: 'personal-doctor-' } } }))
  console.log('DoctorProfiles:', await p.doctorProfile.count({ where: { userId: { startsWith: 'personal-doctor-' } } }))
  console.log('Patients:', await p.patient.count({ where: { id: { startsWith: 'personal-patient-' } } }))
  console.log('Visits:', await p.visit.count({ where: { patient: { id: { startsWith: 'personal-patient-' } } } }))
  console.log('Questionnaires:', await p.visitQuestionnaire.count({ where: { visit: { patient: { id: { startsWith: 'personal-patient-' } } } } }))
  console.log('Appointments:', await p.appointment.count({ where: { patient: { id: { startsWith: 'personal-patient-' } } } }))
  console.log('Invoices:', await p.invoice.count({ where: { patient: { id: { startsWith: 'personal-patient-' } } } }))
  await p.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
