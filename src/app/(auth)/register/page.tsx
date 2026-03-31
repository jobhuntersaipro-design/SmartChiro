import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata = {
  title: 'Register — SmartChiro',
}

export default async function RegisterPage() {
  const session = await auth()
  if (session) redirect('/dashboard')

  const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET)

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F6F9FC] px-4">
      <RegisterForm googleEnabled={googleEnabled} />
    </div>
  )
}
