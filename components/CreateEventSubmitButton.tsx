'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

export default function CreateEventSubmitButton() {
  const { pending } = useFormStatus()
  const [isLocked, setIsLocked] = useState(false)
  const isBusy = pending || isLocked

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={isBusy}
      onClick={(event) => {
        if (isBusy) {
          event.preventDefault()
          return
        }

        setIsLocked(true)
        window.setTimeout(() => {
          setIsLocked(false)
        }, 1500)
      }}
      className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
    >
      <span className="inline-flex items-center justify-center gap-2">
        {isBusy ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : null}
        <span>{isBusy ? '作成中...' : '今すぐイベントを作成'}</span>
      </span>
    </button>
  )
}
