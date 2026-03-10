'use client'

import { useRef, useState } from 'react'

type PlaceSuggestion = {
  label: string
  lat?: number
  lng?: number
  placeId?: string
}

type SearchApiResponse = {
  ok?: boolean
  items?: PlaceSuggestion[]
  debug?: string
  sessionToken?: string
}

type DetailsApiResponse = {
  ok?: boolean
  item?: PlaceSuggestion | null
  debug?: string
}

type PlaceSearchSelectInputProps = {
  label: string
  textName: string
  latName: string
  lngName: string
  placeholder?: string
  defaultText?: string | null
  defaultLat?: number | null
  defaultLng?: number | null
  helperText?: string
  required?: boolean
}

export default function PlaceSearchSelectInput({
  label,
  textName,
  latName,
  lngName,
  placeholder,
  defaultText,
  defaultLat,
  defaultLng,
  helperText,
  required = false,
}: PlaceSearchSelectInputProps) {
  const [query, setQuery] = useState(defaultText ?? '')
  const [selectedLat, setSelectedLat] = useState<number | ''>(defaultLat ?? '')
  const [selectedLng, setSelectedLng] = useState<number | ''>(defaultLng ?? '')
  const [selectedPlaceId, setSelectedPlaceId] = useState('')
  const [sessionToken, setSessionToken] = useState('')
  const [items, setItems] = useState<PlaceSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [selectedLabel, setSelectedLabel] = useState(
    defaultText && defaultLat != null && defaultLng != null ? defaultText : ''
  )
  const abortRef = useRef<AbortController | null>(null)

  async function handleSearch() {
    const trimmed = query.trim()

    setSelectedLat('')
    setSelectedLng('')
    setSelectedPlaceId('')
    setSelectedLabel('')
    setItems([])
    setErrorMessage('')

    if (trimmed.length < 2) {
      setErrorMessage('2文字以上入力して検索してください')
      return
    }

    try {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setLoading(true)

      const response = await fetch(
        `/api/places/search?q=${encodeURIComponent(trimmed)}`,
        {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        }
      )

      const rawText = await response.text()

      let data: SearchApiResponse
      try {
        data = JSON.parse(rawText) as SearchApiResponse
      } catch {
        console.error('places API returned non-JSON:', rawText.slice(0, 300))
        setErrorMessage('候補取得エラーが発生しました')
        return
      }

      if (data.ok === false) {
        setErrorMessage(`候補取得エラー: ${data.debug ?? 'unknown'}`)
        return
      }

      const nextItems = Array.isArray(data.items) ? data.items : []
      setItems(nextItems)
      setSessionToken(data.sessionToken ?? '')

      if (nextItems.length === 0) {
        setErrorMessage('候補が見つかりません。駅名や地名、住所の一部で試してください。')
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('候補検索エラー:', error)
        setErrorMessage('候補取得エラーが発生しました')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleSelect(item: PlaceSuggestion) {
    if (item.lat != null && item.lng != null) {
      setQuery(item.label)
      setSelectedLat(item.lat)
      setSelectedLng(item.lng)
      setSelectedPlaceId(item.placeId ?? '')
      setSelectedLabel(item.label)
      setItems([])
      setErrorMessage('')
      return
    }

    if (!item.placeId) {
      setErrorMessage('地点詳細の取得に失敗しました')
      return
    }

    try {
      setSelecting(true)
      setErrorMessage('')

      const response = await fetch(
        `/api/places/details?placeId=${encodeURIComponent(item.placeId)}&sessionToken=${encodeURIComponent(sessionToken)}`,
        {
          method: 'GET',
          cache: 'no-store',
        }
      )

      const rawText = await response.text()

      let data: DetailsApiResponse
      try {
        data = JSON.parse(rawText) as DetailsApiResponse
      } catch {
        console.error('place details API returned non-JSON:', rawText.slice(0, 300))
        setErrorMessage('地点詳細の取得に失敗しました')
        return
      }

      if (data.ok === false || !data.item || data.item.lat == null || data.item.lng == null) {
        setErrorMessage(`地点詳細の取得に失敗しました: ${data.debug ?? 'unknown'}`)
        return
      }

      setQuery(data.item.label)
      setSelectedLat(data.item.lat)
      setSelectedLng(data.item.lng)
      setSelectedPlaceId(data.item.placeId ?? item.placeId)
      setSelectedLabel(data.item.label)
      setItems([])
      setErrorMessage('')
    } catch (error) {
      console.error('地点詳細取得エラー:', error)
      setErrorMessage('地点詳細の取得に失敗しました')
    } finally {
      setSelecting(false)
    }
  }

  function handleClearSelection() {
    setSelectedLat('')
    setSelectedLng('')
    setSelectedPlaceId('')
    setSelectedLabel('')
  }

  const isSelected = selectedLat !== '' && selectedLng !== '' && !!selectedLabel

  return (
    <div className="relative">
      <label className="mb-2 block text-sm font-medium text-slate-700">
        {label}
      </label>

      <div className="flex gap-3">
        <input
          name={textName}
          type="text"
          value={query}
          required={required}
          autoComplete="off"
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value)
            setSelectedLat('')
            setSelectedLng('')
            setSelectedPlaceId('')
            setSelectedLabel('')
            setItems([])
            setErrorMessage('')
          }}
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
        />

        <button
          type="button"
          onClick={handleSearch}
          disabled={loading || selecting}
          className="inline-flex shrink-0 items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? '検索中...' : selecting ? '取得中...' : '検索'}
        </button>
      </div>

      <input
        type="hidden"
        name={latName}
        value={selectedLat === '' ? '' : String(selectedLat)}
      />
      <input
        type="hidden"
        name={lngName}
        value={selectedLng === '' ? '' : String(selectedLng)}
      />
      <input type="hidden" name={`${textName}PlaceId`} value={selectedPlaceId} />

      {required ? (
        <input
          value={selectedLabel}
          onChange={() => {}}
          required
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none absolute h-0 w-0 overflow-hidden border-0 p-0 opacity-0"
        />
      ) : null}

      {helperText ? (
        <p className="mt-2 text-xs text-slate-500">{helperText}</p>
      ) : null}

      {isSelected ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
            選択済み: {selectedLabel}
          </span>
          <button
            type="button"
            onClick={handleClearSelection}
            className="inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
          >
            選択解除
          </button>
        </div>
      ) : null}

      {required && !isSelected ? (
        <p className="mt-2 text-xs font-medium text-amber-700">
          送信前に検索して候補を1件選択してください
        </p>
      ) : null}

      {errorMessage ? (
        <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <ul className="max-h-72 overflow-y-auto py-2">
            {items.map((item, index) => (
              <li key={`${item.placeId ?? item.label}-${index}`}>
                <button
                  type="button"
                  onClick={() => handleSelect(item)}
                  className="block w-full px-4 py-3 text-left text-sm text-slate-700 transition hover:bg-teal-50 hover:text-slate-900"
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}