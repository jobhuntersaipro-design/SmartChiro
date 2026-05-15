import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import 'dotenv/config'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const fileUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/Cervical_spine_lateral.jpg/512px-Cervical_spine_lateral.jpg'
  const x = await prisma.xray.upsert({
    where: { id: 'test-xray-batch12' },
    update: {},
    create: {
      id: 'test-xray-batch12',
      title: 'Test X-Ray (batch 1+2 verification)',
      fileUrl,
      fileName: 'cervical-spine-lateral.jpg',
      fileSize: 80000,
      mimeType: 'image/jpeg',
      width: 512,
      height: 765,
      bodyRegion: 'CERVICAL',
      viewType: 'LATERAL',
      patientId: 'seed-patient-001',
      uploadedById: 'cmopbzbn80000mmot7o74dzrt',
      status: 'READY',
    },
  })
  console.log(JSON.stringify({ id: x.id, patientId: x.patientId }))
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
