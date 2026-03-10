export function buildGoogleMapsDirectionsUrl(stops: unknown): string | null {
  let stopsArray: string[] = []

  if (Array.isArray(stops)) {
    stopsArray = stops.map((stop) => (stop ?? '').toString())
  } else if (typeof stops === 'string') {
    try {
      const parsed = JSON.parse(stops)
      if (Array.isArray(parsed)) {
        stopsArray = parsed.map((stop) => (stop ?? '').toString())
      } else if (stops.trim().length > 0) {
        stopsArray = [stops]
      }
    } catch {
      if (stops.trim().length > 0) {
        stopsArray = [stops]
      }
    }
  } else if (stops && typeof stops === 'object') {
    stopsArray = Object.values(stops as Record<string, unknown>).map((stop) => (stop ?? '').toString())
  }

  const normalizedStops = stopsArray
    .map((stop) => stop.trim())
    .filter((stop) => stop.length > 0)

  if (normalizedStops.length < 2) {
    return null
  }

  const encodedStops = normalizedStops.map((stop) => encodeURIComponent(stop))
  return `https://www.google.com/maps/dir/${encodedStops.join('/')}`
}
