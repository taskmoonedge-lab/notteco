'use client'

import { useEffect, useState } from 'react'

type EventToastProps = {
  notice?: string
}

function getMessage(notice?: string): string | null {
  if (notice === 'replan') {
    return '再度配車ボタンを押して配車結果を更新してください'
  }

  if (notice === 'planned') {
    return '配車結果を更新しました。'
  }

  if (notice === 'plans_deleted') {
    return '配車結果を削除しました。'
  }

  if (notice === 'event_time_required') {
    return 'ノリアイの到着時間を設定してから配車してください。'
  }

  return null
}

export default function EventToast({ notice }: EventToastProps) {
  const [visible, setVisible] = useState(Boolean(getMessage(notice)))
  const message = getMessage(notice)

  useEffect(() => {
    if (!message) return

    const timer = window.setTimeout(() => {
      setVisible(false)
    }, 3000)

    return () => window.clearTimeout(timer)
  }, [message])

  if (!message || !visible) {
    return null
  }

  return (
    <div className="fixed right-4 top-4 z-50 rounded-xl bg-black px-4 py-3 text-sm font-medium text-white shadow-lg">
      {message}
    </div>
  )
}