'use client'

import { useState } from 'react'
import { useFormStatus } from 'react-dom'

export default function CreateEventSubmitButton() {
  const { pending } = useFormStatus()
  const [isLocked, setIsLocked] = useState(false)
  const isDisabled = pending || isLocked

  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-busy={isDisabled}
      onClick={() => {
        if (isDisabled) return
        setIsLocked(true)
        window.setTimeout(() => {
          setIsLocked(false)
        }, 1500)
      }}
      className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
    >
      {isDisabled ? '作成中...' : '今すぐイベントを作成'}
    </button>
  )
}
