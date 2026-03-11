'use client'

import { useMemo, useState } from 'react'
import PlaceSearchSelectInput from './PlaceSearchSelectInput'

type CaseType = 'noriai' | 'sougei'

const modeConfig: Record<CaseType, { placeLabel: string; timeLabel: string }> = {
  noriai: {
    placeLabel: '目的地',
    timeLabel: '到着時刻',
  },
  sougei: {
    placeLabel: '出発地点',
    timeLabel: '出発時刻',
  },
}

export default function ModeSwitchFields() {
  const [caseType, setCaseType] = useState<CaseType>('noriai')

  const labels = useMemo(() => modeConfig[caseType], [caseType])

  return (
    <>
      <div>
        <p className="mb-2 block text-base font-bold text-slate-800">モード切替</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <input
              type="radio"
              name="caseType"
              value="noriai"
              checked={caseType === 'noriai'}
              onChange={() => setCaseType('noriai')}
              className="mt-1"
            />
            <span className="text-base font-medium text-slate-800">ノリアイ（同じ目的地へ向かう）</span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <input
              type="radio"
              name="caseType"
              value="sougei"
              checked={caseType === 'sougei'}
              onChange={() => setCaseType('sougei')}
              className="mt-1"
            />
            <span className="text-base font-medium text-slate-800">ソウゲイ（共通基点から送る）</span>
          </label>
        </div>
      </div>

      <PlaceSearchSelectInput
        label={labels.placeLabel}
        textName="destinationText"
        latName="destinationLat"
        lngName="destinationLng"
        placeholder="駅名、施設名、住所など"
        helperText="候補から1件選択してください"
        required
      />

      <div>
        <label htmlFor="event-at" className="mb-2 block text-base font-bold text-slate-800">
          {labels.timeLabel}
        </label>
        <input
          id="event-at"
          name="eventAt"
          type="datetime-local"
          required
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-medium outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
        />
      </div>
    </>
  )
}
