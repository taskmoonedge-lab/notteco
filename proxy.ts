import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const ROOT_HOSTS = new Set(['notteco.com', 'www.notteco.com'])
const APP_HOST = 'app.notteco.com'

function resolveHost(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const hostHeader = forwardedHost ?? request.headers.get('host') ?? request.nextUrl.hostname
  return hostHeader.split(',')[0].trim().split(':')[0].toLowerCase()
}

export function proxy(request: NextRequest) {
  const host = resolveHost(request)

  if (ROOT_HOSTS.has(host)) {
    const url = request.nextUrl.clone()
    url.protocol = 'https:'
    url.host = APP_HOST
    return NextResponse.redirect(url, 308)
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/:path*',
}
