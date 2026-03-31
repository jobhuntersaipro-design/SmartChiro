'use client'

import { Building2, UserCheck } from 'lucide-react'

type LoginRole = 'owner' | 'staff'

interface RoleSelectorProps {
  value: LoginRole
  onChange: (role: LoginRole) => void
}

const roles = [
  {
    id: 'owner' as const,
    label: 'Branch Owner',
    description: 'Manage your clinic, staff, and patients',
    icon: Building2,
  },
  {
    id: 'staff' as const,
    label: 'Branch Staff',
    description: 'Access assigned patients and tools',
    icon: UserCheck,
  },
]

export function RoleSelector({ value, onChange }: RoleSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {roles.map((role) => {
        const isSelected = value === role.id
        const Icon = role.icon
        return (
          <button
            key={role.id}
            type="button"
            onClick={() => onChange(role.id)}
            className={`flex flex-col items-center gap-2 rounded-[6px] border p-4 text-center transition-colors cursor-pointer ${
              isSelected
                ? 'border-[#635BFF] bg-[#F0EEFF]'
                : 'border-[#E3E8EE] bg-white hover:bg-[#F0F3F7]'
            }`}
          >
            <Icon
              size={24}
              strokeWidth={1.5}
              className={isSelected ? 'text-[#635BFF]' : 'text-[#697386]'}
            />
            <span
              className={`text-[15px] font-medium ${
                isSelected ? 'text-[#635BFF]' : 'text-[#0A2540]'
              }`}
            >
              {role.label}
            </span>
            <span className="text-[13px] text-[#697386] leading-tight">
              {role.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}
