'use client'

import { useFormStatus } from 'react-dom'

type PendingSubmitButtonProps = {
  idleLabel: string
  pendingLabel?: string
  className?: string
}

export default function PendingSubmitButton({
  idleLabel,
  pendingLabel = '送信中...',
  className,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}
