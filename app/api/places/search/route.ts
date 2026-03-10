import { NextRequest, NextResponse } from 'next/server'
import { searchPlaces } from '../../../../lib/placeSearchProvider'

export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get('q')?.trim() ?? ''
    const result = await searchPlaces(query)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error('places route fatal error:', error)

    return NextResponse.json(
      {
        ok: false,
        items: [],
        debug: 'route_error',
      },
      { status: 200 }
    )
  }
}