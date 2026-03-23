'use client'

import Link from 'next/link'
import { useState } from 'react'

type Props = {
  href: string
}

export default function OpenParticipantPageLink({ href }: Props) {
  const [isLocked, setIsLocked] = useState(false)

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={isLocked}
      onClick={(event) => {
        if (isLocked) {
          event.preventDefault()
          return
        }
        setIsLocked(true)
        window.setTimeout(() => {
          setIsLocked(false)
        }, 1000)
      }}
      className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-60"
    >
      参加者ページを開く
    </Link>
  )
}
