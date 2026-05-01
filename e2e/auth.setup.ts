import { test as setup, expect } from '@playwright/test'
import { seedE2E } from './fixtures/seed'

const AUTH_FILE = 'e2e/.auth/user.json'

setup('authenticate', async ({ page }) => {
  await seedE2E()

  // Reset mock-worker in-memory state too. Read the port from env so a custom
  // MOCK_WORKER_PORT in .env.test doesn't silently miss the mock.
  const mockPort = process.env.MOCK_WORKER_PORT ?? '8788'
  await fetch(`http://127.0.0.1:${mockPort}/__test/reset`, { method: 'POST' }).catch(() => {})

  const email = process.env.E2E_USER_EMAIL ?? 'e2e@smartchiro.test'
  const password = process.env.E2E_USER_PASSWORD ?? 'e2e-test-password-12345'

  await page.goto('/login')
  await page.getByLabel(/email/i).fill(email)
  await page.getByLabel(/password/i).fill(password)
  await page.getByRole('button', { name: /sign in/i }).click()

  await expect(page).toHaveURL(/\/dashboard/)
  await page.context().storageState({ path: AUTH_FILE })
})
