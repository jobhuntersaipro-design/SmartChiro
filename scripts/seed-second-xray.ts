import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import 'dotenv/config'

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
const prisma = new PrismaClient({ adapter })

async function main() {
  const x = await prisma.xray.upsert({
    where: { id: 'test-xray-second' },
    update: {},
    create: {
      id: 'test-xray-second',
      title: 'Second Test X-Ray (for cycling)',
      fileUrl: 'https://example.com/x.jpg',
      fileName: 'second.jpg',
      fileSize: 80000,
      mimeType: 'image/jpeg',
      width: 512,
      height: 765,
      bodyRegion: 'LUMBAR',
      viewType: 'AP',
      patientId: 'seed-patient-001',
      uploadedById: 'cmopbzbn80000mmot7o74dzrt',
      status: 'READY',
    },
  })
  console.log(JSON.stringify({ id: x.id }))
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
