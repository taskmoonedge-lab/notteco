import { cookies } from 'next/headers'

const EVENT_OWNER_COOKIE = 'notteco_owner_id'

function buildCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365 * 2,
  }
}

export async function getEventOwnerId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get(EVENT_OWNER_COOKIE)?.value ?? null
}

export async function getOrCreateEventOwnerId(): Promise<string> {
  const cookieStore = await cookies()
  const existing = cookieStore.get(EVENT_OWNER_COOKIE)?.value
  if (existing) {
    return existing
  }

  const nextValue = crypto.randomUUID()
  cookieStore.set(EVENT_OWNER_COOKIE, nextValue, buildCookieOptions())
  return nextValue
}

