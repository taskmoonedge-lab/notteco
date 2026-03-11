'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { geocodeAddress } from '../lib/geocode'
import {
  buildSimplePlan,
  type EventMemberRecord,
  type EventRecord,
  type VehicleOfferRecord,
} from '../lib/planner'
import { optimizeAssignmentRoute } from '../lib/routesProvider'

function parseOptionalNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function parseOptionalString(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function parseOptionalDateTime(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return null

  return trimmed
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : null
}

function isSameLocationText(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  return normalizeOptionalText(left) === normalizeOptionalText(right)
}

async function resolveCoordinatesFromInput(
  text: string | null | undefined,
  selectedLat: number | null,
  selectedLng: number | null,
  fallbackLat?: number | null,
  fallbackLng?: number | null,
  fallbackText?: string | null
): Promise<{ lat: number | null; lng: number | null }> {
  if (selectedLat != null && selectedLng != null) {
    return {
      lat: selectedLat,
      lng: selectedLng,
    }
  }

  const normalized = normalizeOptionalText(text)

  if (!normalized) {
    return {
      lat: null,
      lng: null,
    }
  }

  if (isSameLocationText(normalized, fallbackText)) {
    return {
      lat: fallbackLat ?? null,
      lng: fallbackLng ?? null,
    }
  }

  const geocoded = await geocodeAddress(normalized)

  return {
    lat: geocoded.lat ?? null,
    lng: geocoded.lng ?? null,
  }
}

async function fetchEventOriginFallback(eventId: string): Promise<{
  text: string | null
  lat: number | null
  lng: number | null
  placeId: string | null
  caseType: string | null
}> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'case_type, destination_text, destination_lat, destination_lng, destination_place_id'
    )
    .eq('id', eventId)
    .single<{
      case_type: string | null
      destination_text: string | null
      destination_lat: number | null
      destination_lng: number | null
      destination_place_id: string | null
    }>()

  if (error) {
    console.error('イベント基点取得エラー:', error.message)
    return {
      text: null,
      lat: null,
      lng: null,
      placeId: null,
      caseType: null,
    }
  }

  return {
    text: data?.destination_text ?? null,
    lat: data?.destination_lat ?? null,
    lng: data?.destination_lng ?? null,
    placeId: data?.destination_place_id ?? null,
    caseType: data?.case_type ?? null,
  }
}

async function resolveSougeiStartInput(
  eventId: string,
  startLocationText: string | null,
  startLat: number | null,
  startLng: number | null,
  startPlaceId: string | null,
  fallbackLat?: number | null,
  fallbackLng?: number | null,
  fallbackPlaceId?: string | null,
  fallbackText?: string | null
): Promise<{
  text: string | null
  lat: number | null
  lng: number | null
  placeId: string | null
}> {
  const trimmed = normalizeOptionalText(startLocationText)

  if (trimmed || (startLat != null && startLng != null)) {
    const coords = await resolveCoordinatesFromInput(
      trimmed,
      startLat,
      startLng,
      fallbackLat ?? null,
      fallbackLng ?? null,
      fallbackText ?? null
    )

    if (!trimmed && coords.lat == null && coords.lng == null) {
      const eventOrigin = await fetchEventOriginFallback(eventId)

      if (eventOrigin.caseType === 'sougei') {
        return {
          text: eventOrigin.text,
          lat: eventOrigin.lat,
          lng: eventOrigin.lng,
          placeId: eventOrigin.placeId,
        }
      }
    }

    return {
      text: trimmed,
      lat: coords.lat,
      lng: coords.lng,
      placeId:
        isSameLocationText(trimmed, fallbackText)
          ? startPlaceId ?? fallbackPlaceId ?? null
          : startPlaceId ?? null,
    }
  }

  const eventOrigin = await fetchEventOriginFallback(eventId)

  if (eventOrigin.caseType === 'sougei') {
    return {
      text: eventOrigin.text,
      lat: eventOrigin.lat,
      lng: eventOrigin.lng,
      placeId: eventOrigin.placeId,
    }
  }

  return {
    text: null,
    lat: null,
    lng: null,
    placeId: null,
  }
}


function appendSearchParam(path: string, key: string, value: string): string {
  const [pathname, hash = ''] = path.split('#', 2)
  const separator = pathname.includes('?') ? '&' : '?'
  const nextPath = `${pathname}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`
  return hash ? `${nextPath}#${hash}` : nextPath
}

function appendNoticeParam(path: string, notice: string): string {
  return appendSearchParam(path, 'notice', notice)
}

function getReturnToPath(formData: FormData, eventId: string): string {
  const returnTo = parseOptionalString(formData.get('returnTo'))

  if (!returnTo) {
    return `/events/${eventId}`
  }

  if (!returnTo.startsWith('/')) {
    return `/events/${eventId}`
  }

  return returnTo
}

async function markReplanRequiredAndRedirect(
  eventId: string,
  returnToPath?: string
): Promise<void> {
  const nextPath = returnToPath ?? `/events/${eventId}`

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/e/${eventId}`)
  redirect(appendNoticeParam(nextPath, 'replan_required'))
}

async function redirectWithNotice(
  eventId: string,
  notice: string,
  returnToPath?: string
): Promise<void> {
  const nextPath = returnToPath ?? `/events/${eventId}`

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/e/${eventId}`)
  redirect(appendNoticeParam(nextPath, notice))
}

export async function createEvent(formData: FormData): Promise<void> {
  const title = formData.get('title') as string
  const caseType = formData.get('caseType') as string
  const destinationText = formData.get('destinationText') as string
  const destinationLat = parseOptionalNumber(formData.get('destinationLat'))
  const destinationLng = parseOptionalNumber(formData.get('destinationLng'))
  const destinationPlaceId = parseOptionalString(
    formData.get('destinationTextPlaceId')
  )
  const eventAt = parseOptionalDateTime(formData.get('eventAt'))

  if (!title || !title.trim()) {
    console.error('イベント名が空です')
    return
  }

  if (!caseType || !['noriai', 'sougei'].includes(caseType)) {
    console.error('モードが不正です')
    return
  }

  if (!destinationText || !destinationText.trim()) {
    console.error('目的地または基点が空です')
    return
  }

  if (!eventAt) {
    console.error('イベント日時が空または不正です')
    return
  }

  const normalizedDestinationText = normalizeOptionalText(destinationText)

  const destinationCoords = await resolveCoordinatesFromInput(
    normalizedDestinationText,
    destinationLat,
    destinationLng
  )

  const { data, error } = await supabase
    .from('events')
    .insert([
      {
        title: title.trim(),
        case_type: caseType,
        destination_text: normalizedDestinationText,
        destination_lat: destinationCoords.lat,
        destination_lng: destinationCoords.lng,
        destination_place_id: destinationPlaceId,
        event_at: eventAt,
      },
    ])
    .select('id')
    .single<{ id: string }>()

  if (error || !data?.id) {
    console.error('イベント作成エラー:', error?.message ?? 'イベントID取得失敗')
    return
  }

  revalidatePath('/')
  redirect(`/admin/events/${data.id}`)
}

export async function updateEvent(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)
  const title = formData.get('title') as string
  const destinationText = formData.get('destinationText') as string
  const destinationLat = parseOptionalNumber(formData.get('destinationLat'))
  const destinationLng = parseOptionalNumber(formData.get('destinationLng'))
  const destinationPlaceId = parseOptionalString(
    formData.get('destinationTextPlaceId')
  )
  const eventAt = parseOptionalDateTime(formData.get('eventAt'))

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!title || !title.trim()) {
    console.error('イベント名が空です')
    return
  }

  if (!destinationText || !destinationText.trim()) {
    console.error('目的地または基点が空です')
    return
  }

  if (!eventAt) {
    console.error('イベント日時が空または不正です')
    return
  }

  const { data: currentEvent, error: currentEventError } = await supabase
    .from('events')
    .select('destination_text, destination_lat, destination_lng, destination_place_id')
    .eq('id', eventId)
    .single<{
      destination_text: string | null
      destination_lat: number | null
      destination_lng: number | null
      destination_place_id: string | null
    }>()

  if (currentEventError) {
    console.error('イベント取得エラー:', currentEventError.message)
    return
  }

  const normalizedDestinationText = normalizeOptionalText(destinationText)

  const destinationCoords = await resolveCoordinatesFromInput(
    normalizedDestinationText,
    destinationLat,
    destinationLng,
    currentEvent?.destination_lat ?? null,
    currentEvent?.destination_lng ?? null,
    currentEvent?.destination_text ?? null
  )

  const nextDestinationPlaceId = isSameLocationText(
    normalizedDestinationText,
    currentEvent?.destination_text ?? null
  )
    ? destinationPlaceId ?? currentEvent?.destination_place_id ?? null
    : destinationPlaceId ?? null

  const { error } = await supabase
    .from('events')
    .update({
      title: title.trim(),
      destination_text: normalizedDestinationText,
      destination_lat: destinationCoords.lat,
      destination_lng: destinationCoords.lng,
      destination_place_id: nextDestinationPlaceId,
      event_at: eventAt,
    })
    .eq('id', eventId)

  if (error) {
    console.error('イベント更新エラー:', error.message)
    return
  }

  await markReplanRequiredAndRedirect(eventId, returnToPath)
}

export async function createEventMember(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)
  const name = formData.get('name') as string
  const startLocationText = parseOptionalString(formData.get('startLocationText'))
  const startLat = parseOptionalNumber(formData.get('startLat'))
  const startLng = parseOptionalNumber(formData.get('startLng'))
  const startPlaceId = parseOptionalString(
    formData.get('startLocationTextPlaceId')
  )
  const destinationText = parseOptionalString(formData.get('destinationText'))
  const destinationLat = parseOptionalNumber(formData.get('destinationLat'))
  const destinationLng = parseOptionalNumber(formData.get('destinationLng'))
  const destinationPlaceId = parseOptionalString(
    formData.get('destinationTextPlaceId')
  )

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!name || !name.trim()) {
    console.error('搭乗者名が空です')
    return
  }

  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select(
      'case_type, destination_text, destination_lat, destination_lng, destination_place_id'
    )
    .eq('id', eventId)
    .single<{
      case_type: string
      destination_text: string | null
      destination_lat: number | null
      destination_lng: number | null
      destination_place_id: string | null
    }>()

  if (eventError) {
    console.error('イベント取得エラー:', eventError.message)
    return
  }

  let resolvedStartText = startLocationText
  let resolvedStartLat = startLat
  let resolvedStartLng = startLng
  let resolvedStartPlaceId = startPlaceId

  if (eventData.case_type === 'sougei') {
    const resolved = await resolveSougeiStartInput(
      eventId,
      startLocationText,
      startLat,
      startLng,
      startPlaceId,
      eventData.destination_lat,
      eventData.destination_lng,
      eventData.destination_place_id,
      null
    )

    resolvedStartText = resolved.text
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng
    resolvedStartPlaceId = resolved.placeId
  } else {
    const resolved = await resolveCoordinatesFromInput(
      startLocationText,
      startLat,
      startLng
    )
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng
  }

  const resolvedDestination = await resolveCoordinatesFromInput(
    destinationText,
    destinationLat,
    destinationLng
  )

  const { data: insertedMember, error } = await supabase
    .from('event_members')
    .insert([
      {
        event_id: eventId,
        name: name.trim(),
        start_location_text: resolvedStartText,
        start_lat: resolvedStartLat,
        start_lng: resolvedStartLng,
        start_place_id: resolvedStartPlaceId,
        destination_text: destinationText,
        destination_lat: resolvedDestination.lat,
        destination_lng: resolvedDestination.lng,
        destination_place_id: destinationPlaceId,
      },
    ])
    .select('id')
    .single<{ id: string }>()

  if (error || !insertedMember?.id) {
    console.error('搭乗者作成エラー:', error?.message ?? '搭乗者ID取得失敗')
    return
  }

  const focusPath = appendSearchParam(returnToPath, 'memberId', insertedMember.id)
  await redirectWithNotice(eventId, 'member_registered', focusPath)
}

export async function updateEventMember(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)
  const memberId = formData.get('memberId') as string
  const name = formData.get('name') as string
  const startLocationText = parseOptionalString(formData.get('startLocationText'))
  const startLat = parseOptionalNumber(formData.get('startLat'))
  const startLng = parseOptionalNumber(formData.get('startLng'))
  const startPlaceId = parseOptionalString(
    formData.get('startLocationTextPlaceId')
  )
  const destinationText = parseOptionalString(formData.get('destinationText'))
  const destinationLat = parseOptionalNumber(formData.get('destinationLat'))
  const destinationLng = parseOptionalNumber(formData.get('destinationLng'))
  const destinationPlaceId = parseOptionalString(
    formData.get('destinationTextPlaceId')
  )

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!memberId || !memberId.trim()) {
    console.error('memberId が空です')
    return
  }

  if (!name || !name.trim()) {
    console.error('搭乗者名が空です')
    return
  }

  const { data: currentMember, error: currentMemberError } = await supabase
    .from('event_members')
    .select(
      'start_location_text, start_lat, start_lng, start_place_id, destination_text, destination_lat, destination_lng, destination_place_id'
    )
    .eq('id', memberId)
    .single<{
      start_location_text: string | null
      start_lat: number | null
      start_lng: number | null
      start_place_id: string | null
      destination_text: string | null
      destination_lat: number | null
      destination_lng: number | null
      destination_place_id: string | null
    }>()

  if (currentMemberError) {
    console.error('現在搭乗者取得エラー:', currentMemberError.message)
    return
  }

  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select(
      'case_type, destination_text, destination_lat, destination_lng, destination_place_id'
    )
    .eq('id', eventId)
    .single<{
      case_type: string
      destination_text: string | null
      destination_lat: number | null
      destination_lng: number | null
      destination_place_id: string | null
    }>()

  if (eventError) {
    console.error('イベント取得エラー:', eventError.message)
    return
  }

  let resolvedStartText = startLocationText
  let resolvedStartLat = startLat
  let resolvedStartLng = startLng
  let resolvedStartPlaceId = startPlaceId

  if (eventData.case_type === 'sougei') {
    const resolved = await resolveSougeiStartInput(
      eventId,
      startLocationText,
      startLat,
      startLng,
      startPlaceId,
      currentMember?.start_lat ?? eventData.destination_lat,
      currentMember?.start_lng ?? eventData.destination_lng,
      currentMember?.start_place_id ?? eventData.destination_place_id,
      currentMember?.start_location_text ?? null
    )

    resolvedStartText = resolved.text
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng
    resolvedStartPlaceId = resolved.placeId
  } else {
    const resolved = await resolveCoordinatesFromInput(
      startLocationText,
      startLat,
      startLng,
      currentMember?.start_lat ?? null,
      currentMember?.start_lng ?? null,
      currentMember?.start_location_text ?? null
    )
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng

    resolvedStartPlaceId = isSameLocationText(
      startLocationText,
      currentMember?.start_location_text ?? null
    )
      ? startPlaceId ?? currentMember?.start_place_id ?? null
      : startPlaceId ?? null
  }

  const resolvedDestination = await resolveCoordinatesFromInput(
    destinationText,
    destinationLat,
    destinationLng,
    currentMember?.destination_lat ?? null,
    currentMember?.destination_lng ?? null,
    currentMember?.destination_text ?? null
  )

  const nextDestinationPlaceId = isSameLocationText(
    destinationText,
    currentMember?.destination_text ?? null
  )
    ? destinationPlaceId ?? currentMember?.destination_place_id ?? null
    : destinationPlaceId ?? null

  const { error } = await supabase
    .from('event_members')
    .update({
      name: name.trim(),
      start_location_text: resolvedStartText,
      start_lat: resolvedStartLat,
      start_lng: resolvedStartLng,
      start_place_id: resolvedStartPlaceId,
      destination_text: destinationText,
      destination_lat: resolvedDestination.lat,
      destination_lng: resolvedDestination.lng,
      destination_place_id: nextDestinationPlaceId,
    })
    .eq('id', memberId)

  if (error) {
    console.error('搭乗者更新エラー:', error.message)
    return
  }

  await markReplanRequiredAndRedirect(eventId, returnToPath)
}

export async function deleteEventMember(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)
  const memberId = formData.get('memberId') as string

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!memberId || !memberId.trim()) {
    console.error('memberId が空です')
    return
  }

  const { error } = await supabase
    .from('event_members')
    .delete()
    .eq('id', memberId)

  if (error) {
    console.error('搭乗者削除エラー:', error.message)
    return
  }

  await markReplanRequiredAndRedirect(eventId, returnToPath)
}

export async function createVehicleOffer(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)
  const driverName = formData.get('driverName') as string
  const startLocationText = parseOptionalString(formData.get('startLocationText'))
  const startLat = parseOptionalNumber(formData.get('startLat'))
  const startLng = parseOptionalNumber(formData.get('startLng'))
  const startPlaceId = parseOptionalString(
    formData.get('startLocationTextPlaceId')
  )
  const capacityValue = formData.get('capacity') as string

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!driverName || !driverName.trim()) {
    console.error('運転手名が空です')
    return
  }

  const capacity = Number(capacityValue)

  if (!Number.isInteger(capacity) || capacity <= 0) {
    console.error('定員が不正です')
    return
  }

  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select(
      'case_type, destination_text, destination_lat, destination_lng, destination_place_id'
    )
    .eq('id', eventId)
    .single<{
      case_type: string
      destination_text: string | null
      destination_lat: number | null
      destination_lng: number | null
      destination_place_id: string | null
    }>()

  if (eventError) {
    console.error('イベント取得エラー:', eventError.message)
    return
  }

  let resolvedStartText = startLocationText
  let resolvedStartLat = startLat
  let resolvedStartLng = startLng
  let resolvedStartPlaceId = startPlaceId

  if (eventData.case_type === 'sougei') {
    const resolved = await resolveSougeiStartInput(
      eventId,
      startLocationText,
      startLat,
      startLng,
      startPlaceId,
      eventData.destination_lat,
      eventData.destination_lng,
      eventData.destination_place_id,
      null
    )

    resolvedStartText = resolved.text
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng
    resolvedStartPlaceId = resolved.placeId
  } else {
    const resolved = await resolveCoordinatesFromInput(
      startLocationText,
      startLat,
      startLng
    )
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng
  }

  const { data: insertedVehicleOffer, error } = await supabase
    .from('vehicle_offers')
    .insert([
      {
        event_id: eventId,
        driver_name: driverName.trim(),
        start_location_text: resolvedStartText,
        start_lat: resolvedStartLat,
        start_lng: resolvedStartLng,
        start_place_id: resolvedStartPlaceId,
        capacity,
      },
    ])
    .select('id')
    .single<{ id: string }>()

  if (error || !insertedVehicleOffer?.id) {
    console.error('運転手作成エラー:', error?.message ?? '運転手ID取得失敗')
    return
  }

  await redirectWithNotice(
    eventId,
    'driver_registered',
    appendSearchParam(returnToPath, 'vehicleOfferId', insertedVehicleOffer.id)
  )
}

export async function updateVehicleOffer(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)
  const vehicleOfferId = formData.get('vehicleOfferId') as string
  const driverName = formData.get('driverName') as string
  const startLocationText = parseOptionalString(formData.get('startLocationText'))
  const startLat = parseOptionalNumber(formData.get('startLat'))
  const startLng = parseOptionalNumber(formData.get('startLng'))
  const startPlaceId = parseOptionalString(
    formData.get('startLocationTextPlaceId')
  )
  const capacityValue = formData.get('capacity') as string

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!vehicleOfferId || !vehicleOfferId.trim()) {
    console.error('vehicleOfferId が空です')
    return
  }

  if (!driverName || !driverName.trim()) {
    console.error('運転手名が空です')
    return
  }

  const capacity = Number(capacityValue)

  if (!Number.isInteger(capacity) || capacity <= 0) {
    console.error('定員が不正です')
    return
  }

  const { data: currentVehicle, error: currentVehicleError } = await supabase
    .from('vehicle_offers')
    .select('start_location_text, start_lat, start_lng, start_place_id')
    .eq('id', vehicleOfferId)
    .single<{
      start_location_text: string | null
      start_lat: number | null
      start_lng: number | null
      start_place_id: string | null
    }>()

  if (currentVehicleError) {
    console.error('現在車情報取得エラー:', currentVehicleError.message)
    return
  }

  const { data: eventData, error: eventError } = await supabase
    .from('events')
    .select(
      'case_type, destination_text, destination_lat, destination_lng, destination_place_id'
    )
    .eq('id', eventId)
    .single<{
      case_type: string
      destination_text: string | null
      destination_lat: number | null
      destination_lng: number | null
      destination_place_id: string | null
    }>()

  if (eventError) {
    console.error('イベント取得エラー:', eventError.message)
    return
  }

  let resolvedStartText = startLocationText
  let resolvedStartLat = startLat
  let resolvedStartLng = startLng
  let resolvedStartPlaceId = startPlaceId

  if (eventData.case_type === 'sougei') {
    const resolved = await resolveSougeiStartInput(
      eventId,
      startLocationText,
      startLat,
      startLng,
      startPlaceId,
      currentVehicle?.start_lat ?? eventData.destination_lat,
      currentVehicle?.start_lng ?? eventData.destination_lng,
      currentVehicle?.start_place_id ?? eventData.destination_place_id,
      currentVehicle?.start_location_text ?? null
    )

    resolvedStartText = resolved.text
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng
    resolvedStartPlaceId = resolved.placeId
  } else {
    const resolved = await resolveCoordinatesFromInput(
      startLocationText,
      startLat,
      startLng,
      currentVehicle?.start_lat ?? null,
      currentVehicle?.start_lng ?? null,
      currentVehicle?.start_location_text ?? null
    )
    resolvedStartLat = resolved.lat
    resolvedStartLng = resolved.lng

    resolvedStartPlaceId = isSameLocationText(
      startLocationText,
      currentVehicle?.start_location_text ?? null
    )
      ? startPlaceId ?? currentVehicle?.start_place_id ?? null
      : startPlaceId ?? null
  }

  const { error } = await supabase
    .from('vehicle_offers')
    .update({
      driver_name: driverName.trim(),
      start_location_text: resolvedStartText,
      start_lat: resolvedStartLat,
      start_lng: resolvedStartLng,
      start_place_id: resolvedStartPlaceId,
      capacity,
    })
    .eq('id', vehicleOfferId)

  if (error) {
    console.error('運転手更新エラー:', error.message)
    return
  }

  await markReplanRequiredAndRedirect(eventId, returnToPath)
}

export async function deleteVehicleOffer(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)
  const vehicleOfferId = formData.get('vehicleOfferId') as string

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!vehicleOfferId || !vehicleOfferId.trim()) {
    console.error('vehicleOfferId が空です')
    return
  }

  const { error } = await supabase
    .from('vehicle_offers')
    .delete()
    .eq('id', vehicleOfferId)

  if (error) {
    console.error('運転手削除エラー:', error.message)
    return
  }

  await markReplanRequiredAndRedirect(eventId, returnToPath)
}

export async function executePlan(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single<EventRecord>()

  if (eventError || !event) {
    console.error('イベント取得エラー:', eventError?.message)
    return
  }

  if (event.case_type === 'noriai') {
    const parsedEventAt = event.event_at ? new Date(event.event_at) : null

    if (!parsedEventAt || Number.isNaN(parsedEventAt.getTime())) {
      console.error('ノリアイの到着時間(event_at)が未設定または不正です')
      redirect(appendNoticeParam(returnToPath, 'event_time_required'))
    }
  }

  const { data: members, error: membersError } = await supabase
    .from('event_members')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false })
    .returns<EventMemberRecord[]>()

  if (membersError) {
    console.error('搭乗者取得エラー:', membersError.message)
    return
  }

  const { data: vehicleOffers, error: vehicleOffersError } = await supabase
    .from('vehicle_offers')
    .select('*')
    .eq('event_id', eventId)
    .order('capacity', { ascending: false })
    .returns<VehicleOfferRecord[]>()

  if (vehicleOffersError) {
    console.error('運転手取得エラー:', vehicleOffersError.message)
    return
  }

  const { assignments } = buildSimplePlan(
    event,
    members ?? [],
    vehicleOffers ?? []
  )

  const optimizedAssignments = await Promise.all(
    assignments
      .filter((assignment) => assignment.members.length > 0)
      .map((assignment) => optimizeAssignmentRoute(event, assignment))
  )

  const { error: deleteError } = await supabase
    .from('route_plans')
    .delete()
    .eq('event_id', eventId)

  if (deleteError) {
    console.error('既存配車結果削除エラー:', deleteError.message)
    return
  }

  if (optimizedAssignments.length === 0) {
    revalidatePath(`/events/${eventId}`)
    revalidatePath(`/admin/events/${eventId}`)
    revalidatePath(`/e/${eventId}`)
    redirect(`${returnToPath}?notice=planned`)
  }

  const rows = optimizedAssignments.map((assignment) => ({
    event_id: eventId,
    vehicle_offer_id: assignment.vehicle.id,
    driver_name: assignment.vehicle.driver_name,
    member_names: assignment.members.map((member) => member.name),
    route_text: assignment.routeText,
    route_stops: assignment.routeStops,
    total_distance_meters: assignment.totalDistanceMeters,
    total_duration_seconds: assignment.totalDurationSeconds,
    ordered_member_ids: assignment.orderedMemberIds,
    ordered_member_names: assignment.orderedMemberNames,
    encoded_polyline: assignment.encodedPolyline,
    provider: assignment.provider,
    optimization_mode: assignment.optimizationMode,
    solver_status:
      assignment.provider === 'google_routes'
        ? 'google_routes_optimized'
        : 'internal_improved',
    plan_version: assignment.provider === 'google_routes' ? 3 : 2,
  }))

  const { error: insertError } = await supabase.from('route_plans').insert(rows)

  if (insertError) {
    console.error('配車結果保存エラー:', insertError.message)
    return
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/e/${eventId}`)
  redirect(`${returnToPath}?notice=planned`)
}

export async function deleteRoutePlans(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string
  const returnToPath = getReturnToPath(formData, eventId)

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  const { error } = await supabase
    .from('route_plans')
    .delete()
    .eq('event_id', eventId)

  if (error) {
    console.error('配車結果削除エラー:', error.message)
    return
  }

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/e/${eventId}`)
  redirect(`${returnToPath}?notice=plans_deleted`)
}

export async function deleteEvent(formData: FormData): Promise<void> {
  const eventId = formData.get('eventId') as string

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  const { error: routePlansError } = await supabase
    .from('route_plans')
    .delete()
    .eq('event_id', eventId)

  if (routePlansError) {
    console.error('配車結果削除エラー:', routePlansError.message)
    return
  }

  const { error: membersError } = await supabase
    .from('event_members')
    .delete()
    .eq('event_id', eventId)

  if (membersError) {
    console.error('搭乗者削除エラー:', membersError.message)
    return
  }

  const { error: vehiclesError } = await supabase
    .from('vehicle_offers')
    .delete()
    .eq('event_id', eventId)

  if (vehiclesError) {
    console.error('運転手削除エラー:', vehiclesError.message)
    return
  }

  const { error: eventError } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (eventError) {
    console.error('イベント削除エラー:', eventError.message)
    return
  }

  revalidatePath('/')
  redirect('/')
}
