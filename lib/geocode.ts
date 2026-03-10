type GeocodeResult = {
  lat: number | null
  lng: number | null
}

function normalizeAddress(address: string): string {
  return address.trim()
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const normalized = normalizeAddress(address)

  if (!normalized) {
    return {
      lat: null,
      lng: null,
    }
  }

  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(
    normalized
  )}`

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'notteko-app/1.0',
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      console.error('ジオコーディング失敗:', response.status, response.statusText)
      return { lat: null, lng: null }
    }

    const data = (await response.json()) as Array<{
      lat?: string
      lon?: string
    }>

    if (!Array.isArray(data) || data.length === 0) {
      return { lat: null, lng: null }
    }

    const first = data[0]
    const lat = first.lat ? Number(first.lat) : null
    const lng = first.lon ? Number(first.lon) : null

    return {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    }
  } catch (error) {
    console.error('ジオコーディング例外:', error)
    return {
      lat: null,
      lng: null,
    }
  }
}