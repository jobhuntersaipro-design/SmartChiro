/**
 * Allow the app's origins to upload X-rays straight to the R2 bucket
 * (browser PUT to a presigned URL), and to read them back.
 *
 *   node scripts/set-r2-cors.mjs https://your-app.vercel.app https://smartchiro.com
 *
 * Uses R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
 * from .env (the same credentials the app uses; the key needs admin
 * read & write on the bucket). http://localhost:3000 is always included for
 * local development. Re-running replaces the bucket's CORS rules.
 */
import 'dotenv/config'
import { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } from '@aws-sdk/client-s3'

const origins = [...new Set([...process.argv.slice(2), 'http://localhost:3000'])]
const badOrigin = origins.find((o) => !/^https?:\/\/[^/]+$/.test(o))
if (process.argv.length < 3 || badOrigin) {
  console.error(badOrigin ? `Not an origin (scheme://host, no path): ${badOrigin}` : 'Usage: node scripts/set-r2-cors.mjs <https://app-origin> [...more]')
  process.exit(1)
}

const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME } = process.env
if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
  console.error('Missing R2_* variables in .env')
  process.exit(1)
}

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
})

await r2.send(
  new PutBucketCorsCommand({
    Bucket: R2_BUCKET_NAME,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: origins,
          AllowedMethods: ['PUT', 'GET', 'HEAD'],
          AllowedHeaders: ['Content-Type'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
)

const { CORSRules } = await r2.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET_NAME }))
console.log(`CORS set on ${R2_BUCKET_NAME}:`)
console.log(JSON.stringify(CORSRules, null, 2))
