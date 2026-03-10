'use client'

import { useMemo, useState } from 'react'

type InviteActionsProps = {
  eventTitle: string
  participantPath: string
}

function buildAbsoluteUrl(path: string): string {
  if (typeof window === 'undefined') return path
  return new URL(path, window.location.origin).toString()
}

export default function InviteActions({ eventTitle, participantPath }: InviteActionsProps) {
  const [copiedType, setCopiedType] = useState<'template' | null>(null)

  const displayedInviteUrl = participantPath
  const inviteMessagePreview = useMemo(() => {
    return `${eventTitle} の参加登録はこちらです
${displayedInviteUrl}

名前・出発地・車を出せるかを入力してください。`
  }, [eventTitle, displayedInviteUrl])

  async function handleCopy(type: 'template') {
    const inviteUrl = buildAbsoluteUrl(participantPath)
    const inviteMessage = `${eventTitle} の参加登録はこちらです
${inviteUrl}

名前・出発地・車を出せるかを入力してください。`

    try {
      await navigator.clipboard.writeText(inviteMessage)
      setCopiedType(type)
      window.setTimeout(() => {
        setCopiedType((current) => (current === type ? null : current))
      }, 2000)
    } catch (error) {
      console.error('コピー失敗', error)
      window.alert('コピーに失敗しました。ブラウザの権限設定を確認してください。')
    }
  }

  function handleLineShare() {
    const inviteUrl = buildAbsoluteUrl(participantPath)
    const lineUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(inviteUrl)}`
    window.open(lineUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">招待リンク共有</h2>
          <p className="mt-2 text-sm text-slate-500">
            参加者にはこのURLを送ってください。ログイン不要で参加登録できます。
          </p>
        </div>
        <button
          type="button"
          onClick={handleLineShare}
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          LINEで共有
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">参加者ページURL</p>
        <p className="mt-2 break-all text-sm font-medium leading-6 text-slate-800">{displayedInviteUrl}</p>
      </div>
      <div className="mt-4">
        <button
          type="button"
          onClick={() => handleCopy('template')}
          className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-600"
        >
          {copiedType === 'template' ? '案内文をコピーしました' : '案内文をコピー'}
        </button>
      </div>

      <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">案内文プレビュー</p>
        <pre className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{inviteMessagePreview}</pre>
      </div>
    </section>
  )
}
