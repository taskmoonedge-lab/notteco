'use client'

import { useFormStatus } from 'react-dom'

type PendingSubmitButtonProps = {
  idleLabel: string
  pendingLabel?: string
  className?: string
  spinnerClassName?: string
}

export default function PendingSubmitButton({
  idleLabel,
  pendingLabel = '送信中...',
  className,
  spinnerClassName,
}: PendingSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={className}
    >
      {pending ? (
        <>
          <span
            aria-hidden="true"
            className={`h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${spinnerClassName ?? ''}`.trim()}
          />
          <span>{pendingLabel}</span>
        </>
      ) : (
        idleLabel
      )}
    </button>
  )
}
