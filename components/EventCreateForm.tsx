'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import PendingSubmitButton from './PendingSubmitButton'
import PlaceSearchSelectInput from './PlaceSearchSelectInput'

type CaseType = 'noriai' | 'sougei'

type EventCreateFormProps = {
  notice?: string
  action: (formData: FormData) => Promise<void>
}

const modeOptions: Array<{
  value: CaseType
  title: string
  description: string
  placeLabel: string
  timeLabel: string
}> = [
  {
    value: 'noriai',
    title: 'ノリアイ',
    description: '同じ目的地へ集合するイベント向け',
    placeLabel: '目的地',
    timeLabel: '到着時刻',
  },
  {
    value: 'sougei',
    title: 'ソウゲイ',
    description: '共通の出発地点から送迎するイベント向け',
    placeLabel: '出発地点',
    timeLabel: '出発時刻',
  },
]


export default function EventCreateForm({ notice, action }: EventCreateFormProps) {
  const [caseType, setCaseType] = useState<CaseType>('noriai')

  const selectedMode = useMemo(
    () => modeOptions.find((option) => option.value === caseType) ?? modeOptions[0],
    [caseType]
  )

  return (
    <form id="create-event-form" action={action} className="mt-6 space-y-6">
      {notice ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          {notice}
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <p className="text-sm font-bold text-emerald-700">STEP 1</p>
        <label htmlFor="title" className="mt-2 block text-base font-bold text-slate-800">
          イベント名
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          placeholder="例: 週末BBQ / ゴルフ送迎 / ライブ遠征"
          className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-medium outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <p className="text-sm font-bold text-emerald-700">STEP 2</p>
        <p className="mt-2 text-base font-bold text-slate-800">モードを選択</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {modeOptions.map((option) => {
            const selected = option.value === caseType
            return (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border p-4 transition ${
                  selected
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="caseType"
                  value={option.value}
                  checked={selected}
                  onChange={() => setCaseType(option.value)}
                  className="sr-only"
                />
                <p className="text-base font-bold text-slate-900">{option.title}</p>
                <p className="mt-1 text-sm text-slate-600">{option.description}</p>
              </label>
            )
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
        <p className="text-sm font-bold text-emerald-700">STEP 3</p>
        <div className="mt-3 space-y-5">
          <PlaceSearchSelectInput
            label={selectedMode.placeLabel}
            textName="destinationText"
            latName="destinationLat"
            lngName="destinationLng"
            placeholder="駅名、施設名、住所など"
            helperText="候補選択推奨（未選択でも住所テキストで作成できます）"
            required
            requireSelection={false}
          />

          <div>
            <label htmlFor="event-at" className="mb-2 block text-base font-bold text-slate-800">
              {selectedMode.timeLabel}
            </label>
            <input
              id="event-at"
              name="eventAt"
              type="datetime-local"
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-medium outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
            />
          </div>
        </div>
      </div>

      <p className="text-center text-sm font-medium text-slate-600">
        <Link href="/terms" className="font-bold text-orange-500 underline underline-offset-2 hover:text-orange-600">
          利用規約
        </Link>
        に同意して作成します。
      </p>

      <PendingSubmitButton
        idleLabel="イベントを作成する"
        pendingLabel="作成中..."
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </form>
  )
}
