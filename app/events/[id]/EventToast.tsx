'use client'

import { useEffect, useMemo, useState } from 'react'

type EventToastProps = {
  notice?: string
}

type ToastConfig = {
  message: string
  duration: number
  emphasized?: boolean
}

function getToastConfig(notice?: string): ToastConfig | null {
  if (notice === 'replan') {
    return {
      message: '再度配車ボタンを押して配車結果を更新してください',
      duration: 3000,
    }
  }

  if (notice === 'planned') {
    return {
      message: '配車結果を更新しました。',
      duration: 3000,
    }
  }

  if (notice === 'plans_deleted') {
    return {
      message: '配車結果を削除しました。',
      duration: 3000,
    }
  }

  if (notice === 'event_time_required') {
    return {
      message: 'ノリアイの到着時間を設定してから配車してください。',
      duration: 3000,
    }
  }

  if (notice === 'member_registered') {
    return {
      message: '搭乗者登録が完了しました',
      duration: 2000,
      emphasized: true,
    }
  }

  if (notice === 'driver_registered') {
    return {
      message: '運転手登録が完了しました',
      duration: 2000,
      emphasized: true,
    }
  }

  return null
}

export default function EventToast({ notice }: EventToastProps) {
  const toastConfig = useMemo(() => getToastConfig(notice), [notice])
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    if (!toastConfig) return

    const showTimer = window.setTimeout(() => {
      setVisible(true)
    }, 0)

    const hideTimer = window.setTimeout(() => {
      setVisible(false)
    }, toastConfig.duration)

    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
    }
  }, [notice, toastConfig])

  if (!toastConfig || !visible) {
    return null
  }

  return (
    <div
      className={`fixed right-4 top-4 z-50 rounded-2xl bg-black text-white shadow-xl ${
        toastConfig.emphasized
          ? 'px-8 py-5 text-2xl font-extrabold tracking-wide'
          : 'px-4 py-3 text-sm font-medium'
      }`}
    >
      {toastConfig.message}
    </div>
  )
}
