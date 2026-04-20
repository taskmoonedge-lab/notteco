'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { supabase } from '../lib/supabase'
import { getOrCreateEventOwnerId } from '../lib/eventOwner'
import { geocodeAddress } from '../lib/geocode'
import {
  buildSimplePlan,
  type EventMemberRecord,
  type EventRecord,
  type VehicleOfferRecord,
} from '../lib/planner'
import { optimizeAssignmentRoute } from '../lib/routesProvider'
import { isUndefinedColumnError } from '../lib/supabaseErrors'

const MAX_EVENT_TITLE_LENGTH = 120
const MAX_MEMBER_NAME_LENGTH = 80
const MAX_DRIVER_NAME_LENGTH = 80
const MAX_LOCATION_TEXT_LENGTH = 255
const MAX_VEHICLE_CAPACITY = 12
const DUPLICATE_GUARD_WINDOW_SECONDS = 10

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

function parseCheckbox(value: FormDataEntryValue | null): boolean {
  return value === 'on'
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed ? trimmed : null
}

function isValidTextLength(value: string | null | undefined, max: number): boolean {
  if (value == null) return true
  return value.length <= max
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

function extractMissingColumnName(
  error: { code?: string | null; message?: string | null } | null | undefined
): string | null {
  if (!isUndefinedColumnError(error)) return null

  const message = error?.message ?? ''
  const match = message.match(/column\s+"([^"]+)"/i)
  return match?.[1] ?? null
}

async function insertEventWithLegacyCompatibility(
  payload: Record<string, unknown>
): Promise<{
  data: { id: string } | null
  error: { code?: string | null; message?: string | null } | null
}> {
  const removableColumns = new Set([
    'owner_id',
    'plan_is_latest',
    'destination_place_id',
    'destination_lat',
    'destination_lng',
  ])

  const requestPayload: Record<string, unknown> = { ...payload }
  let lastError: { code?: string | null; message?: string | null } | null = null

  for (let attempt = 0; attempt < removableColumns.size + 1; attempt += 1) {
    const { data, error } = await supabase
      .from('events')
      .insert([requestPayload])
      .select('id')
      .single<{ id: string }>()

    if (!error && data?.id) {
      return {
        data,
        error: null,
      }
    }

    lastError = error
    const missingColumn = extractMissingColumnName(error)

    if (!missingColumn || !removableColumns.has(missingColumn)) {
      break
    }

    delete requestPayload[missingColumn]
    removableColumns.delete(missingColumn)
  }

  return {
    data: null,
    error: lastError,
  }
}

function redirectCreateEventWithNotice(notice: string): never {
  redirect(appendNoticeParam('/#quick-create', notice))
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
  const marked = await markReplanRequired(eventId)

  if (!marked) {
    return
  }

  const nextPath = returnToPath ?? `/events/${eventId}`

  revalidatePath(`/events/${eventId}`)
  revalidatePath(`/admin/events/${eventId}`)
  revalidatePath(`/e/${eventId}`)
  redirect(appendNoticeParam(nextPath, 'replan_required'))
}

async function markReplanRequired(eventId: string): Promise<boolean> {
  const { error: updateError } = await supabase
    .from('events')
    .update({ plan_is_latest: false })
    .eq('id', eventId)

  if (updateError) {
    console.error('配車結果最新フラグ更新エラー:', updateError.message)
    return false
  }

  return true
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

async function ensureMemberBelongsToEvent(
  memberId: string,
  eventId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('event_members')
    .select('id')
    .eq('id', memberId)
    .eq('event_id', eventId)
    .single<{ id: string }>()

  if (error || !data) {
    console.error('搭乗者がイベントに紐づいていません:', error?.message ?? memberId)
    return false
  }

  return true
}

async function ensureVehicleBelongsToEvent(
  vehicleOfferId: string,
  eventId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('vehicle_offers')
    .select('id')
    .eq('id', vehicleOfferId)
    .eq('event_id', eventId)
    .single<{ id: string }>()

  if (error || !data) {
    console.error('運転手がイベントに紐づいていません:', error?.message ?? vehicleOfferId)
    return false
  }

  return true
}

export async function createEvent(formData: FormData): Promise<void> {
  const traceId = `ce-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  console.info('[createEvent_entered:v1]', {
    traceId,
    timestamp: new Date().toISOString(),
  })

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
    redirectCreateEventWithNotice('イベント名を入力してください')
  }
  if (!isValidTextLength(title.trim(), MAX_EVENT_TITLE_LENGTH)) {
    console.error('イベント名が長すぎます')
    redirectCreateEventWithNotice('イベント名が長すぎます')
  }

  if (!caseType || !['noriai', 'sougei'].includes(caseType)) {
    console.error('モードが不正です')
    redirectCreateEventWithNotice('モード選択が不正です')
  }

  if (!destinationText || !destinationText.trim()) {
    console.error('目的地または基点が空です')
    redirectCreateEventWithNotice('目的地または出発地点を入力してください')
  }
  if (!isValidTextLength(destinationText.trim(), MAX_LOCATION_TEXT_LENGTH)) {
    console.error('目的地または基点が長すぎます')
    redirectCreateEventWithNotice('目的地または出発地点が長すぎます')
  }

  if (!eventAt) {
    console.error('イベント日時が空または不正です')
    redirectCreateEventWithNotice('イベント日時を正しく入力してください')
  }

  const normalizedDestinationText = normalizeOptionalText(destinationText)
  const ownerId = await getOrCreateEventOwnerId()
  const destinationCoords = await resolveCoordinatesFromInput(
    normalizedDestinationText,
    destinationLat,
    destinationLng
  )

  const baseEventPayload = {
    title: title.trim(),
    case_type: caseType,
    destination_text: normalizedDestinationText,
    destination_lat: destinationCoords.lat,
    destination_lng: destinationCoords.lng,
    destination_place_id: destinationPlaceId,
    event_at: eventAt,
    plan_is_latest: false,
    owner_id: ownerId,
  }

  const { data, error } = await insertEventWithLegacyCompatibility(baseEventPayload)

  if (error || !data?.id) {
    console.error('イベント作成エラー:', {
      traceId,
      code: error?.code ?? null,
      message: error?.message ?? null,
      details: (error as { details?: string | null } | null)?.details ?? null,
      hint: (error as { hint?: string | null } | null)?.hint ?? null,
    })
    redirectCreateEventWithNotice(
      'イベント作成に失敗しました。時間をおいて再度お試しください'
    )
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
  if (!isValidTextLength(title.trim(), MAX_EVENT_TITLE_LENGTH)) {
    console.error('イベント名が長すぎます')
    return
  }

  if (!destinationText || !destinationText.trim()) {
    console.error('目的地または基点が空です')
    return
  }
  if (!isValidTextLength(destinationText.trim(), MAX_LOCATION_TEXT_LENGTH)) {
    console.error('目的地または基点が長すぎます')
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
  const canUseRentalCar = parseCheckbox(formData.get('canUseRentalCar'))

  if (!eventId || !eventId.trim()) {
    console.error('eventId が空です')
    return
  }

  if (!name || !name.trim()) {
    console.error('搭乗者名が空です')
    return
  }
  if (!isValidTextLength(name.trim(), MAX_MEMBER_NAME_LENGTH)) {
    console.error('搭乗者名が長すぎます')
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
  if (eventData.case_type === 'sougei' && (!destinationText || !destinationText.trim())) {
    console.error('ソウゲイの到着地点が空です')
    return
  }
  if (!isValidTextLength(startLocationText, MAX_LOCATION_TEXT_LENGTH)) {
    console.error('出発地点が長すぎます')
    return
  }
  if (!isValidTextLength(destinationText, MAX_LOCATION_TEXT_LENGTH)) {
    console.error('到着地点が長すぎます')
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

  const resolvedDestination =
    eventData.case_type === 'sougei'
      ? await resolveCoordinatesFromInput(
          destinationText,
          destinationLat,
          destinationLng
        )
      : { lat: null, lng: null }

  const nextDestinationText =
    eventData.case_type === 'sougei' ? destinationText : null
  const nextDestinationPlaceId =
    eventData.case_type === 'sougei' ? destinationPlaceId : null

  const { data: existingMember } = await supabase
    .from('event_members')
    .select('id')
    .eq('event_id', eventId)
    .eq('name', name.trim())
    .eq('start_location_text', resolvedStartText)
    .eq('destination_text', nextDestinationText)
    .gte(
      'created_at',
      new Date(Date.now() - DUPLICATE_GUARD_WINDOW_SECONDS * 1000).toISOString()
    )
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (existingMember?.id) {
    await redirectWithNotice(eventId, 'member_registered', appendSearchParam(returnToPath, 'memberId', existingMember.id))
  }

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
        destination_text: nextDestinationText,
        destination_lat: resolvedDestination.lat,
        destination_lng: resolvedDestination.lng,
        destination_place_id: nextDestinationPlaceId,
        can_use_rental_car: canUseRentalCar,
      },
    ])
    .select('id')
    .single<{ id: string }>()

  if (error || !insertedMember?.id) {
    console.error('搭乗者作成エラー:', error?.message ?? '搭乗者ID取得失敗')
    return
  }

  const marked = await markReplanRequired(eventId)

  if (!marked) {
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
  const canUseRentalCar = parseCheckbox(formData.get('canUseRentalCar'))

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
  if (!isValidTextLength(name.trim(), MAX_MEMBER_NAME_LENGTH)) {
    console.error('搭乗者名が長すぎます')
    return
  }
  if (!isValidTextLength(startLocationText, MAX_LOCATION_TEXT_LENGTH)) {
    console.error('出発地点が長すぎます')
    return
  }
  if (!isValidTextLength(destinationText, MAX_LOCATION_TEXT_LENGTH)) {
    console.error('到着地点が長すぎます')
    return
  }
  if (!(await ensureMemberBelongsToEvent(memberId, eventId))) {
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

  const resolvedDestination =
    eventData.case_type === 'sougei'
      ? await resolveCoordinatesFromInput(
          destinationText,
          destinationLat,
          destinationLng,
          currentMember?.destination_lat ?? null,
          currentMember?.destination_lng ?? null,
          currentMember?.destination_text ?? null
        )
      : { lat: null, lng: null }

  const nextDestinationText =
    eventData.case_type === 'sougei' ? destinationText : null

  const nextDestinationPlaceId =
    eventData.case_type === 'sougei'
      ? isSameLocationText(destinationText, currentMember?.destination_text ?? null)
        ? destinationPlaceId ?? currentMember?.destination_place_id ?? null
        : destinationPlaceId ?? null
      : null

  const { error } = await supabase
    .from('event_members')
    .update({
      name: name.trim(),
      start_location_text: resolvedStartText,
      start_lat: resolvedStartLat,
      start_lng: resolvedStartLng,
      start_place_id: resolvedStartPlaceId,
      destination_text: nextDestinationText,
      destination_lat: resolvedDestination.lat,
      destination_lng: resolvedDestination.lng,
      destination_place_id: nextDestinationPlaceId,
      can_use_rental_car: canUseRentalCar,
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
  if (!(await ensureMemberBelongsToEvent(memberId, eventId))) {
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
  if (!isValidTextLength(driverName.trim(), MAX_DRIVER_NAME_LENGTH)) {
    console.error('運転手名が長すぎます')
    return
  }

  const capacity = Number(capacityValue)

  if (!Number.isInteger(capacity) || capacity <= 0 || capacity > MAX_VEHICLE_CAPACITY) {
    console.error('定員が不正です')
    return
  }
  if (!isValidTextLength(startLocationText, MAX_LOCATION_TEXT_LENGTH)) {
    console.error('出発地点が長すぎます')
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

  const { data: existingVehicle } = await supabase
    .from('vehicle_offers')
    .select('id')
    .eq('event_id', eventId)
    .eq('driver_name', driverName.trim())
    .eq('start_location_text', resolvedStartText)
    .eq('capacity', capacity)
    .gte(
      'created_at',
      new Date(Date.now() - DUPLICATE_GUARD_WINDOW_SECONDS * 1000).toISOString()
    )
    .neq('id', insertedVehicleOffer.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (existingVehicle?.id) {
    await supabase.from('vehicle_offers').delete().eq('id', insertedVehicleOffer.id)
    await redirectWithNotice(
      eventId,
      'driver_registered',
      appendSearchParam(returnToPath, 'vehicleOfferId', existingVehicle.id)
    )
  }

  const marked = await markReplanRequired(eventId)

  if (!marked) {
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
  if (!isValidTextLength(driverName.trim(), MAX_DRIVER_NAME_LENGTH)) {
    console.error('運転手名が長すぎます')
    return
  }
  if (!isValidTextLength(startLocationText, MAX_LOCATION_TEXT_LENGTH)) {
    console.error('出発地点が長すぎます')
    return
  }
  if (!(await ensureVehicleBelongsToEvent(vehicleOfferId, eventId))) {
    return
  }

  const capacity = Number(capacityValue)

  if (!Number.isInteger(capacity) || capacity <= 0 || capacity > MAX_VEHICLE_CAPACITY) {
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
  if (!(await ensureVehicleBelongsToEvent(vehicleOfferId, eventId))) {
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
    const { error: updateError } = await supabase
      .from('events')
      .update({ plan_is_latest: true })
      .eq('id', eventId)

    if (updateError) {
      console.error('配車結果最新フラグ更新エラー:', updateError.message)
      return
    }

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

  const { error: updateError } = await supabase
    .from('events')
    .update({ plan_is_latest: true })
    .eq('id', eventId)

  if (updateError) {
    console.error('配車結果最新フラグ更新エラー:', updateError.message)
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

  const { error: updateError } = await supabase
    .from('events')
    .update({ plan_is_latest: false })
    .eq('id', eventId)

  if (updateError) {
    console.error('配車結果最新フラグ更新エラー:', updateError.message)
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
