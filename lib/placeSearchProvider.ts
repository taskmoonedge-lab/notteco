export type PlaceSuggestion = {
  label: string
  lat?: number
  lng?: number
  placeId?: string
}

export type PlaceSearchResult = {
  ok: boolean
  items: PlaceSuggestion[]
  debug: string
  sessionToken?: string
}

export type PlaceDetailsResult = {
  ok: boolean
  item: PlaceSuggestion | null
  debug: string
}

type NominatimRow = {
  display_name?: string
  lat?: string
  lon?: string
}

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      place?: string
      placeId?: string
      text?: {
        text?: string
      }
      structuredFormat?: {
        mainText?: {
          text?: string
        }
        secondaryText?: {
          text?: string
        }
      }
    }
  }>
}

type GooglePlaceDetailsResponse = {
  id?: string
  displayName?: {
    text?: string
  }
  formattedAddress?: string
  shortFormattedAddress?: string
  adrFormatAddress?: string
  location?: {
    latitude?: number
    longitude?: number
  }
}

function normalizeQuery(query: string): string {
  return query
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/丁目/g, '-')
    .replace(/番地/g, '-')
    .replace(/番/g, '-')
    .replace(/号/g, '')
    .replace(/--+/g, '-')
    .replace(/-$/, '')
}

function buildJapaneseQueries(raw: string): string[] {
  const normalized = normalizeQuery(raw)

  const queries = [
    normalized,
    `${normalized}駅`,
    `${normalized} 日本`,
    `${normalized} Japan`,
  ]

  const withoutTokyo = normalized.replace(/^東京都/, '').trim()
  if (withoutTokyo && withoutTokyo !== normalized) {
    queries.push(withoutTokyo)
    queries.push(`${withoutTokyo}駅`)
    queries.push(`${withoutTokyo} 日本`)
    queries.push(`${withoutTokyo} Japan`)
  }

  return [...new Set(queries)].filter((q) => q.length > 0)
}

function mapNominatimRows(rows: NominatimRow[]): PlaceSuggestion[] {
  return rows
    .map((row) => ({
      label: row.display_name ?? '',
      lat: row.lat ? Number(row.lat) : NaN,
      lng: row.lon ? Number(row.lon) : NaN,
    }))
    .filter(
      (item) =>
        item.label.length > 0 &&
        Number.isFinite(item.lat) &&
        Number.isFinite(item.lng)
    )
}

async function searchWithNominatim(query: string): Promise<PlaceSuggestion[]> {
  const url =
    'https://nominatim.openstreetmap.org/search' +
    `?format=jsonv2&limit=5&countrycodes=jp&q=${encodeURIComponent(query)}`

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'User-Agent': 'notteko-app/1.0',
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`nominatim ${response.status} ${response.statusText}`)
  }

  const text = await response.text()

  try {
    const parsed = JSON.parse(text) as NominatimRow[]
    return Array.isArray(parsed) ? mapNominatimRows(parsed) : []
  } catch {
    console.error('Nominatim JSON parse failed. raw text:', text.slice(0, 200))
    return []
  }
}

function buildSessionToken(): string {
  return crypto.randomUUID()
}

async function searchWithGooglePlaces(
  query: string
): Promise<PlaceSearchResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return {
      ok: false,
      items: [],
      debug: 'google_api_key_missing',
    }
  }

  const sessionToken = buildSessionToken()

  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat',
    },
    body: JSON.stringify({
      input: query,
      sessionToken,
      includedRegionCodes: ['jp'],
      languageCode: 'ja',
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    console.error('Google autocomplete failed:', response.status, body)

    return {
      ok: false,
      items: [],
      debug: `google_autocomplete_${response.status}`,
    }
  }

  const json = (await response.json()) as GoogleAutocompleteResponse
  const items: PlaceSuggestion[] = []

  for (const suggestion of json.suggestions ?? []) {
    const prediction = suggestion.placePrediction

    if (!prediction?.placeId) {
      continue
    }

    const main =
      prediction.structuredFormat?.mainText?.text ??
      prediction.text?.text ??
      ''

    const secondary =
      prediction.structuredFormat?.secondaryText?.text ?? ''

    const label = secondary ? `${main} (${secondary})` : main

    if (!label) {
      continue
    }

    items.push({
      label,
      placeId: prediction.placeId,
    })
  }

  return {
    ok: true,
    items,
    debug: 'google_ok',
    sessionToken,
  }
}

function normalizeJapaneseAddressLabel(raw: string): string {
  return raw
    .replace(/^日本、?/, '')
    .replace(/^〒\d{3}-\d{4}\s*/, '')
    .trim()
}

export async function getPlaceDetails(
  placeId: string,
  sessionToken?: string
): Promise<PlaceDetailsResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return {
      ok: false,
      item: null,
      debug: 'google_api_key_missing',
    }
  }

  if (!placeId.trim()) {
    return {
      ok: false,
      item: null,
      debug: 'place_id_missing',
    }
  }

  const url = new URL(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
  )

  if (sessionToken?.trim()) {
    url.searchParams.set('sessionToken', sessionToken)
  }

  url.searchParams.set('languageCode', 'ja')
  url.searchParams.set('regionCode', 'JP')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask':
        'id,displayName,formattedAddress,shortFormattedAddress,location',
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    const body = await response.text()
    console.error('Google place details failed:', response.status, body)

    return {
      ok: false,
      item: null,
      debug: `google_details_${response.status}`,
    }
  }

  const json = (await response.json()) as GooglePlaceDetailsResponse

  const lat = json.location?.latitude
  const lng = json.location?.longitude

  const preferredLabel =
    json.formattedAddress ||
    json.shortFormattedAddress ||
    json.displayName?.text ||
    ''

  const label = normalizeJapaneseAddressLabel(preferredLabel)

  if (!label || lat == null || lng == null) {
    return {
      ok: false,
      item: null,
      debug: 'google_details_incomplete',
    }
  }

  return {
    ok: true,
    item: {
      label,
      lat,
      lng,
      placeId,
    },
    debug: 'google_details_ok',
  }
}

export async function searchPlaces(rawQuery: string): Promise<PlaceSearchResult> {
  const query = rawQuery.trim()

  if (query.length < 2) {
    return {
      ok: true,
      items: [],
      debug: 'too_short',
    }
  }

  let googleResult: PlaceSearchResult | null = null

  if (process.env.GOOGLE_MAPS_API_KEY) {
    googleResult = await searchWithGooglePlaces(query)

    if (googleResult.ok && googleResult.items.length > 0) {
      return googleResult
    }
  }

  const candidateQueries = buildJapaneseQueries(query)

  for (const candidate of candidateQueries) {
    try {
      const items = await searchWithNominatim(candidate)

      if (items.length > 0) {
        const googleDebug = googleResult ? `|google:${googleResult.debug}` : ''

        return {
          ok: true,
          items,
          debug: `nominatim_matched:${candidate}${googleDebug}`,
        }
      }
    } catch (error) {
      console.error('place search failed for query:', candidate, error)
    }
  }

  if (googleResult) {
    if (googleResult.ok) {
      return googleResult
    }

    return {
      ok: true,
      items: [],
      debug: `google_failed_fallback_no_result:${googleResult.debug}`,
    }
  }

  return {
    ok: true,
    items: [],
    debug: `no_result:${query}`,
  }
}
