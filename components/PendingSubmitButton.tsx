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
      <span className="inline-flex items-center justify-center gap-2">
        {pending ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
        ) : null}
        <span>{pending ? pendingLabel : idleLabel}</span>
      </span>
    </button>
  )
}
