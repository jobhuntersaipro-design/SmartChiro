import type { GlobalRole, ClinicRole } from '@prisma/client'
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      role: GlobalRole
      clinicRole: ClinicRole | null
      activeClinicId: string | null
    }
  }
}
