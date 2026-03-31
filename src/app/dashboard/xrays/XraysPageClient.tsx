'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Image, ExternalLink, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { XrayUpload } from '@/components/xray/XrayUpload'

interface XrayRow {
  id: string
  title: string | null
  bodyRegion: string | null
  viewType: string | null
  status: string
  patientName: string
  annotationCount: number
}

interface Patient {
  id: string
  firstName: string
  lastName: string
}

interface XraysPageClientProps {
  xrays: XrayRow[]
  patients: Patient[]
}

export function XraysPageClient({ xrays, patients }: XraysPageClientProps) {
  const router = useRouter()
  const [showUpload, setShowUpload] = useState(false)
  const [selectedPatientId, setSelectedPatientId] = useState<string>(patients[0]?.id ?? '')

  return (
    <>
      {/* Upload section */}
      <div className="mb-6">
        {!showUpload ? (
          <Button
            onClick={() => setShowUpload(true)}
            className="rounded-[4px] bg-[#635BFF] text-white hover:bg-[#5851EB]"
          >
            <Plus className="mr-1.5 h-4 w-4" strokeWidth={1.5} />
            Upload X-Ray
          </Button>
        ) : (
          <div
            className="rounded-[6px] border border-[#E3E8EE] bg-white p-5"
            style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.04), 0 1px 1px rgba(0,0,0,0.03), 0 3px 6px rgba(18,42,66,0.02)' }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[16px] font-medium text-[#0A2540]">Upload X-Ray</h2>
              <button
                onClick={() => setShowUpload(false)}
                className="rounded-[4px] px-3 py-1 text-[14px] text-[#697386] transition-colors hover:bg-[#F0F3F7] hover:text-[#0A2540]"
              >
                Cancel
              </button>
            </div>

            {patients.length === 0 ? (
              <p className="text-[15px] text-[#697386]">
                No patients found. Create a patient first before uploading X-rays.
              </p>
            ) : (
              <>
                <div className="mb-4">
                  <label className="mb-1.5 block text-[14px] font-medium text-[#0A2540]">
                    Patient
                  </label>
                  <select
                    value={selectedPatientId}
                    onChange={(e) => setSelectedPatientId(e.target.value)}
                    className="h-[32px] w-full max-w-[300px] rounded-[4px] border border-[#E3E8EE] bg-[#F6F9FC] px-3 text-[15px] text-[#0A2540] focus:border-[#635BFF] focus:outline-none focus:ring-1 focus:ring-[#635BFF]"
                  >
                    {patients.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </div>

                <XrayUpload
                  patientId={selectedPatientId}
                  uploadedById="demo-user"
                  onUploadComplete={() => {
                    setShowUpload(false)
                    router.refresh()
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* X-rays table */}
      {xrays.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[6px] border border-[#E3E8EE] bg-white py-16">
          <Image size={40} className="text-[#A3ACB9]" />
          <p className="mt-3 text-sm font-medium text-[#0A2540]">
            No X-rays yet
          </p>
          <p className="mt-1 text-sm text-[#697386]">
            Upload an X-ray to get started.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[6px] border border-[#E3E8EE] bg-white">
          <table className="w-full">
            <thead>
              <tr style={{ borderBottom: '1px solid #E3E8EE' }}>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#697386]">Title</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#697386]">Patient</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#697386]">Region</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#697386]">View</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#697386]">Annotations</th>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-[#697386]">Status</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-[#697386]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {xrays.map((xray) => (
                <tr
                  key={xray.id}
                  className="transition-colors hover:bg-[#F0F3F7]"
                  style={{ borderBottom: '1px solid #E3E8EE' }}
                >
                  <td className="px-4 py-2.5 text-sm font-medium text-[#0A2540]">
                    {xray.title ?? 'Untitled'}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-[#425466]">
                    {xray.patientName}
                  </td>
                  <td className="px-4 py-2.5 text-sm capitalize text-[#425466]">
                    {xray.bodyRegion?.toLowerCase().replace('_', ' ') ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-[#425466]">
                    {xray.viewType ?? '—'}
                  </td>
                  <td className="px-4 py-2.5 text-sm text-[#425466]">
                    {xray.annotationCount}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: xray.status === 'READY' ? '#E6F9E6' : '#FFF8E6',
                        color: xray.status === 'READY' ? '#30B130' : '#F5A623',
                      }}
                    >
                      {xray.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/dashboard/xrays/${xray.id}/annotate`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-[#635BFF] transition-colors"
                    >
                      Annotate
                      <ExternalLink size={13} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
