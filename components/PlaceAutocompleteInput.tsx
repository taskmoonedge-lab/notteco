'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type PlaceSuggestion = {
  label: string
  lat: number
  lng: number
}

type ApiResponse = {
  ok?: boolean
  items?: PlaceSuggestion[]
  debug?: string
}

type PlaceAutocompleteInputProps = {
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

export default function PlaceAutocompleteInput({
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
}: PlaceAutocompleteInputProps) {
  const [query, setQuery] = useState(defaultText ?? '')
  const [selectedLat, setSelectedLat] = useState<number | ''>(defaultLat ?? '')
  const [selectedLng, setSelectedLng] = useState<number | ''>(defaultLng ?? '')
  const [items, setItems] = useState<PlaceSuggestion[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  const shouldSearch = useMemo(() => query.trim().length >= 2, [query])

  useEffect(() => {
    const wrapper = wrapperRef.current

    function handleClickOutside(event: MouseEvent) {
      if (!wrapper) return
      if (!wrapper.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  useEffect(() => {
    if (!shouldSearch) {
      setItems([])
      setLoading(false)
      setHasSearched(false)
      setErrorMessage('')
      return
    }

    const timer = window.setTimeout(async () => {
      try {
        setLoading(true)
        setOpen(true)
        setErrorMessage('')

        const response = await fetch(
          `/api/places/search?q=${encodeURIComponent(query.trim())}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

        const rawText = await response.text()

        let data: ApiResponse
        try {
          data = JSON.parse(rawText) as ApiResponse
        } catch {
          console.error('places API returned non-JSON:', rawText.slice(0, 300))
          setItems([])
          setHasSearched(true)
          setErrorMessage('候補取得エラーが発生しました')
          return
        }

        setItems(Array.isArray(data.items) ? data.items : [])
        setHasSearched(true)

        if (data.ok === false) {
          setErrorMessage('候補取得エラーが発生しました')
        }
      } catch (error) {
        console.error('候補検索エラー:', error)
        setItems([])
        setHasSearched(true)
        setErrorMessage('候補取得エラーが発生しました')
      } finally {
        setLoading(false)
      }
    }, 300)

    return () => {
      window.clearTimeout(timer)
    }
  }, [query, shouldSearch])

  function handleChange(value: string) {
    setQuery(value)
    setSelectedLat('')
    setSelectedLng('')
    setItems([])
    setHasSearched(false)
    setErrorMessage('')

    if (value.trim().length >= 2) {
      setOpen(true)
    } else {
      setOpen(false)
    }
  }

  function handleSelect(item: PlaceSuggestion) {
    setQuery(item.label)
    setSelectedLat(item.lat)
    setSelectedLng(item.lng)
    setItems([])
    setHasSearched(false)
    setErrorMessage('')
    setOpen(false)
  }

  const showDropdown = open && shouldSearch

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-2 block text-sm font-medium text-gray-700">
        {label}
      </label>

      <input
        name={textName}
        type="text"
        value={query}
        required={required}
        autoComplete="off"
        placeholder={placeholder}
        onChange={(event) => handleChange(event.target.value)}
        onFocus={() => {
          if (query.trim().length >= 2) {
            setOpen(true)
          }
        }}
        className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-gray-500"
      />

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

      {helperText ? (
        <p className="mt-2 text-xs text-gray-500">{helperText}</p>
      ) : null}

      {showDropdown ? (
        <div className="absolute z-20 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {loading ? (
            <div className="px-4 py-3 text-sm text-gray-500">候補を検索中...</div>
          ) : errorMessage ? (
            <div className="px-4 py-3 text-sm text-red-600">{errorMessage}</div>
          ) : items.length > 0 ? (
            <ul className="py-2">
              {items.map((item, index) => (
                <li key={`${item.label}-${index}`}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item)}
                    className="block w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    {item.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : hasSearched ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              候補が見つかりません。駅名や地名、住所の一部で試してください。
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}