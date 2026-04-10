import type { BranchRole } from '@prisma/client'
import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
      branchRole: BranchRole | null
      activeBranchId: string | null
    }
  }
}
