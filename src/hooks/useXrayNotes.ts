'use client'

import { useCallback, useEffect, useState } from 'react'

export interface NoteAuthor { id: string; name: string | null; email: string }
export interface XrayNote {
  id: string
  bodyMd: string
  createdAt: string
  author: NoteAuthor
}
export interface XrayNotesState {
  current: XrayNote | null
  history: XrayNote[]
}

export function useXrayNotes(xrayId: string | null) {
  const [data, setData] = useState<XrayNotesState>({ current: null, history: [] })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    if (!xrayId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/xrays/${xrayId}/notes`)
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [xrayId])

  useEffect(() => { fetchNotes() }, [fetchNotes])

  const saveNote = useCallback(async (bodyMd: string) => {
    if (!xrayId) return
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/xrays/${xrayId}/notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bodyMd }),
      })
      if (!res.ok) throw new Error(`Failed (${res.status})`)
      setData(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note')
    } finally {
      setLoading(false)
    }
  }, [xrayId])

  return { ...data, loading, error, refresh: fetchNotes, saveNote }
}
