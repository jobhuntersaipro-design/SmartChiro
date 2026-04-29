This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Email setup (Resend)

SmartChiro sends auth emails (verification + password reset) via Resend. **Click and open tracking must be disabled** on the sender domain — Resend's tracking rewrites every link through `*.resend-clicks-a.com`, which breaks the verify and reset flows (Gmail double-wraps the URL and the redirect chain stalls).

Required env vars:

- `RESEND_API_KEY` — your Resend API key (`re_…`)
- `RESEND_DOMAIN_ID` — the domain ID for `smartchiro.org`, found at <https://resend.com/domains>
- `NEXT_PUBLIC_APP_URL` — public app URL used in email links (e.g., `http://localhost:3000` in dev, your prod URL otherwise)

To turn tracking off (manual):

1. Open the Resend dashboard → Domains → `smartchiro.org`.
2. Toggle **Click tracking** OFF and **Open tracking** OFF.

Or run the idempotent enforcement script:

```bash
RESEND_API_KEY=re_xxx RESEND_DOMAIN_ID=dom_xxx npx tsx scripts/disable-resend-tracking.ts
```

Re-run any time tracking is accidentally re-enabled.
