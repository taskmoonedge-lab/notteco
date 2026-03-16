'use client'

import { useFormStatus } from 'react-dom'

export default function CreateEventSubmitButton() {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
    >
      {pending ? '作成中...' : '今すぐイベントを作成'}
    </button>
  )
}
