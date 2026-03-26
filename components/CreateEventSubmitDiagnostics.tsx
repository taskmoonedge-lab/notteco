'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormStatus } from 'react-dom'

export default function CreateEventSubmitDiagnostics() {
  const anchorRef = useRef<HTMLDivElement | null>(null)
  const [lastAttemptAt, setLastAttemptAt] = useState<string | null>(null)
  const { pending } = useFormStatus()

  useEffect(() => {
    const anchor = anchorRef.current
    const form = anchor?.closest('form')
    if (!form) return

    const handleSubmit = () => {
      const timestamp = new Date().toISOString()
      setLastAttemptAt(timestamp)
      console.info('[createEvent_submit_fired:v1]', { timestamp })
    }

    const handleInvalid = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLInputElement)) return
      console.warn('[createEvent_invalid_blocked:v1]', {
        name: target.name,
        type: target.type,
        validationMessage: target.validationMessage,
      })
    }

    form.addEventListener('submit', handleSubmit)
    form.addEventListener('invalid', handleInvalid, true)

    return () => {
      form.removeEventListener('submit', handleSubmit)
      form.removeEventListener('invalid', handleInvalid, true)
    }
  }, [])

  return (
    <div ref={anchorRef}>
      <button
        type="submit"
        onClick={() => {
          console.info('[createEvent_submit_clicked:v1]', {
            timestamp: new Date().toISOString(),
          })
        }}
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {pending ? '送信中...' : '今すぐイベントを作成'}
      </button>
      {lastAttemptAt ? (
        <p className="mt-2 text-xs text-slate-500">
          送信試行: {new Date(lastAttemptAt).toLocaleTimeString('ja-JP')}
        </p>
      ) : null}
    </div>
  )
}
