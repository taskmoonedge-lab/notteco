import { NextRequest, NextResponse } from 'next/server'
import { getPlaceDetails } from '../../../../lib/placeSearchProvider'

export async function GET(request: NextRequest) {
  try {
    const placeId = request.nextUrl.searchParams.get('placeId')?.trim() ?? ''
    const sessionToken =
      request.nextUrl.searchParams.get('sessionToken')?.trim() ?? ''

    const result = await getPlaceDetails(placeId, sessionToken)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('place details route fatal error:', error)

    return NextResponse.json(
      {
        ok: false,
        item: null,
        debug: 'route_error',
      },
      { status: 200 }
    )
  }
}