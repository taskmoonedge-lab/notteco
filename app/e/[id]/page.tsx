import Link from 'next/link'
import PlaceSearchSelectInput from '../../../components/PlaceSearchSelectInput'
import { supabase } from '../../../lib/supabase'
import { buildGoogleMapsDirectionsUrl } from '../../../lib/maps'
import { buildNoriaiTimeline } from '../../../lib/planTimeline'
import {
  type EventMemberRecord,
  type EventRecord,
  type VehicleOfferRecord,
} from '../../../lib/planner'
import {
  createEventMember,
  createVehicleOffer,
  deleteEventMember,
  deleteVehicleOffer,
  executePlan,
  updateEventMember,
  updateVehicleOffer,
} from '../../actions'
import EventToast from '../../events/[id]/EventToast'

type ParticipantEventPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{
    notice?: string
    memberId?: string
    vehicleOfferId?: string
  }>
}

type RoutePlanRecord = {
  id: string
  vehicle_offer_id: string | null
  driver_name: string | null
  member_names: string[] | null
  route_stops: string[] | null
  total_distance_meters: number | null
  total_duration_seconds: number | null
  ordered_member_ids: string[] | null
  ordered_member_names: string[] | null
  created_at: string
}

function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters == null) return '未設定'
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`
  return `${distanceMeters} m`
}

function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds == null) return '未設定'
  const hours = Math.floor(durationSeconds / 3600)
  const minutes = Math.round((durationSeconds % 3600) / 60)
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`
}

function formatMode(caseType: string): string {
  return caseType === 'noriai' ? 'ノリアイ' : 'ソウゲイ'
}

function formatCreatedAt(value: string | null): string {
  if (!value) return '不明'
  return new Date(value).toLocaleString('ja-JP')
}
function formatClock(value: Date | null | undefined): string {
  if (!value) return '未算出'
  return value.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })
}


function buildParticipantReturnPath(eventId: string, options?: { memberId?: string; vehicleOfferId?: string }) {
  const params = new URLSearchParams()

  if (options?.memberId) {
    params.set('memberId', options.memberId)
  }

  if (options?.vehicleOfferId) {
    params.set('vehicleOfferId', options.vehicleOfferId)
  }

  const query = params.toString()
  return query ? `/e/${eventId}?${query}` : `/e/${eventId}`
}

function renderLocationText(value: string | null | undefined, fallback: string): string {
  return value && value.trim() ? value : fallback
}

function getRegistrationStatusLabel(hasMember: boolean, hasVehicleOffer: boolean): string {
  if (hasMember && hasVehicleOffer) return '搭乗者・運転手の両方を登録済みです'
  if (hasMember) return '搭乗者として登録済みです'
  if (hasVehicleOffer) return '運転手として登録済みです'
  return 'まだあなたの登録は完了していません'
}

export default async function ParticipantEventPage({
  params,
  searchParams,
}: ParticipantEventPageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const notice = resolvedSearchParams?.notice
  const focusedMemberId = resolvedSearchParams?.memberId
  const focusedVehicleOfferId = resolvedSearchParams?.vehicleOfferId
  const participantPath = `/e/${id}`

  const { data: event, error: eventError } = await supabase
    .from('events')
    .select('*')
    .eq('id', id)
    .single<EventRecord>()

  if (eventError || !event) {
    return <main className="p-8">イベントが見つかりません</main>
  }

  const { data: members } = await supabase
    .from('event_members')
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: false })
    .returns<EventMemberRecord[]>()

  const { data: vehicleOffers } = await supabase
    .from('vehicle_offers')
    .select('*')
    .eq('event_id', id)
    .order('capacity', { ascending: false })
    .returns<VehicleOfferRecord[]>()

  const { data: routePlans, error: routePlansError } = await supabase
    .from('route_plans')
    .select(
      'id, vehicle_offer_id, driver_name, member_names, route_stops, total_distance_meters, total_duration_seconds, ordered_member_ids, ordered_member_names, created_at'
    )
    .eq('event_id', id)
    .order('created_at', { ascending: false })
    .returns<RoutePlanRecord[]>()

  const safeMembers = members ?? []
  const safeVehicleOffers = vehicleOffers ?? []
  const safeRoutePlans = routePlans ?? []
  const focusedMember = safeMembers.find((member) => member.id === focusedMemberId) ?? null
  const focusedVehicleOffer =
    safeVehicleOffers.find((vehicle) => vehicle.id === focusedVehicleOfferId) ?? null
  const hasFocusedMember = Boolean(focusedMember)
  const hasFocusedVehicleOffer = Boolean(focusedVehicleOffer)
  const registrationStatusLabel = getRegistrationStatusLabel(
    hasFocusedMember,
    hasFocusedVehicleOffer
  )

  const eventBaseLabel = event.case_type === 'noriai' ? '共通目的地' : '共通基点'
  const memberStartLabel =
    event.case_type === 'noriai'
      ? '出発地点'
      : '出発地点（共通基点と異なる場合のみ入力してください）'
  const memberDestinationLabel =
    event.case_type === 'noriai' ? '到着地点（通常は不要）' : '到着地点'
  const vehicleStartLabel =
    event.case_type === 'noriai'
      ? '運転手の出発地点'
      : '出発地点（共通基点と異なる場合のみ入力してください）'
  const sougeiFallbackText = event.destination_text || '共通基点を使用'
  const hasValidEventAt = Boolean(event.event_at && !Number.isNaN(new Date(event.event_at).getTime()))

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <EventToast notice={notice} />

      <div className="mx-auto max-w-5xl space-y-6">
        {notice === 'replan_required' ? (
          <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 px-6 py-5 shadow-sm">
            <p className="text-base font-extrabold text-amber-900">
              参加登録が更新されたため、配車結果は最新ではありません。
            </p>
            <p className="mt-2 text-sm text-amber-800">
              管理者が内容確認後に再度「配車する」を押してください。
            </p>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-6 p-8 md:grid-cols-[1.2fr_0.8fr] md:p-10">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                  {formatMode(event.case_type)}
                </span>
                <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  参加者ページ
                </span>
              </div>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">
                {event.title}
              </h1>
              <p className="mt-4 text-base leading-7 text-slate-600">
                このページから搭乗者登録、運転手登録、配車結果の確認ができます。
              </p>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {eventBaseLabel}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {event.destination_text || '未設定'}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  登録状況
                </p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  搭乗者 {safeMembers.length}人 / 運転手 {safeVehicleOffers.length}台
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  最終更新
                </p>
                <p className="mt-2 text-sm font-medium text-slate-800">
                  {formatCreatedAt(event.created_at)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-teal-700">登録ステータス</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">
                {registrationStatusLabel}
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                自分の登録だけを上から確認・修正できます。両方登録する場合は、搭乗者登録と運転手登録をそれぞれ1回ずつ行ってください。
              </p>
            </div>

            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700">
              {hasFocusedMember && hasFocusedVehicleOffer
                ? '両方登録済み'
                : hasFocusedMember
                  ? '搭乗者のみ登録済み'
                  : hasFocusedVehicleOffer
                    ? '運転手のみ登録済み'
                    : '未登録'}
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className={`rounded-2xl border px-4 py-4 ${hasFocusedMember ? 'border-teal-200 bg-teal-50' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">搭乗者登録</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {hasFocusedMember ? '登録済み' : '未登録'}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {hasFocusedMember
                  ? `名前: ${focusedMember?.name ?? ''}`
                  : '乗るだけの場合はこちらを登録してください。'}
              </p>
            </div>

            <div className={`rounded-2xl border px-4 py-4 ${hasFocusedVehicleOffer ? 'border-slate-300 bg-white' : 'border-slate-200 bg-slate-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">運転手登録</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {hasFocusedVehicleOffer ? '登録済み' : '未登録'}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                {hasFocusedVehicleOffer
                  ? `名前: ${focusedVehicleOffer?.driver_name ?? ''} / 定員 ${focusedVehicleOffer?.capacity ?? '-'}人`
                  : '車を出せる場合はこちらも登録してください。'}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">再編集</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">
                {hasFocusedMember || hasFocusedVehicleOffer ? '上の登録内容からすぐ修正できます' : '登録後に自分の内容が上に表示されます'}
              </p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                登録直後はこのページ上部に自分の情報だけが表示され、そのまま更新・削除できます。
              </p>
            </div>
          </div>
        </section>

        {focusedMember || focusedVehicleOffer ? (
          <section className="grid gap-6 lg:grid-cols-2">
            {focusedMember ? (
              <section className="rounded-3xl border-2 border-teal-300 bg-teal-50 p-6 shadow-sm md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      あなたの搭乗者登録
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      登録直後の内容です。このまま修正や削除ができます。
                    </p>
                  </div>
                  <Link
                    href={participantPath}
                    className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    新規登録に戻る
                  </Link>
                </div>

                <form
                  action={updateEventMember}
                  className="mt-6 space-y-5"
                >
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="memberId" value={focusedMember.id} />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={buildParticipantReturnPath(event.id, {
                      memberId: focusedMember.id,
                      vehicleOfferId: focusedVehicleOffer?.id,
                    })}
                  />
                  <div>
                    <label htmlFor="my-member-name" className="mb-2 block text-sm font-medium text-slate-700">
                      名前
                    </label>
                    <input
                      id="my-member-name"
                      name="name"
                      type="text"
                      required
                      defaultValue={focusedMember.name}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    />
                  </div>

                  <PlaceSearchSelectInput
                    label={memberStartLabel}
                    textName="startLocationText"
                    latName="startLat"
                    lngName="startLng"
                    placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'}
                    helperText="入力後に検索を押し、候補から1件選んでください"
                    required={event.case_type === 'noriai'}
                    defaultText={focusedMember.start_location_text}
                    defaultLat={focusedMember.start_lat}
                    defaultLng={focusedMember.start_lng}
                  />

                  <PlaceSearchSelectInput
                    label={memberDestinationLabel}
                    textName="destinationText"
                    latName="destinationLat"
                    lngName="destinationLng"
                    placeholder="駅名、住所を入力"
                    helperText="入力後に検索を押し、候補から1件選んでください"
                    required={event.case_type === 'sougei'}
                    defaultText={focusedMember.destination_text}
                    defaultLat={focusedMember.destination_lat}
                    defaultLng={focusedMember.destination_lng}
                  />

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="submit"
                      className="inline-flex items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-base font-bold text-white transition hover:bg-teal-600"
                    >
                      この内容で更新する
                    </button>
                  </div>
                </form>

                <form action={deleteEventMember} className="mt-3">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="memberId" value={focusedMember.id} />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={buildParticipantReturnPath(event.id, {
                      vehicleOfferId: focusedVehicleOffer?.id,
                    })}
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    この搭乗者登録を削除する
                  </button>
                </form>
              </section>
            ) : null}

            {focusedVehicleOffer ? (
              <section className="rounded-3xl border-2 border-slate-300 bg-white p-6 shadow-sm md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                      あなたの運転手登録
                    </h2>
                    <p className="mt-2 text-sm text-slate-600">
                      登録直後の内容です。このまま修正や削除ができます。
                    </p>
                  </div>
                  <Link
                    href={participantPath}
                    className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    新規登録に戻る
                  </Link>
                </div>

                <form action={updateVehicleOffer} className="mt-6 space-y-5">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="vehicleOfferId" value={focusedVehicleOffer.id} />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={buildParticipantReturnPath(event.id, {
                      memberId: focusedMember?.id,
                      vehicleOfferId: focusedVehicleOffer.id,
                    })}
                  />
                  <div>
                    <label htmlFor="my-driver-name" className="mb-2 block text-sm font-medium text-slate-700">
                      名前
                    </label>
                    <input
                      id="my-driver-name"
                      name="driverName"
                      type="text"
                      required
                      defaultValue={focusedVehicleOffer.driver_name}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    />
                  </div>

                  <PlaceSearchSelectInput
                    label={vehicleStartLabel}
                    textName="startLocationText"
                    latName="startLat"
                    lngName="startLng"
                    placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'}
                    helperText="入力後に検索を押し、候補から1件選んでください"
                    required={event.case_type === 'noriai'}
                    defaultText={focusedVehicleOffer.start_location_text}
                    defaultLat={focusedVehicleOffer.start_lat}
                    defaultLng={focusedVehicleOffer.start_lng}
                  />

                  <div>
                    <label htmlFor="my-capacity" className="mb-2 block text-sm font-medium text-slate-700">
                      定員
                    </label>
                    <input
                      id="my-capacity"
                      name="capacity"
                      type="number"
                      min="1"
                      required
                      defaultValue={focusedVehicleOffer.capacity}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                    />
                  </div>

                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-base font-bold text-white transition hover:bg-slate-800"
                  >
                    この内容で更新する
                  </button>
                </form>

                <form action={deleteVehicleOffer} className="mt-3">
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="vehicleOfferId" value={focusedVehicleOffer.id} />
                  <input
                    type="hidden"
                    name="returnTo"
                    value={buildParticipantReturnPath(event.id, {
                      memberId: focusedMember?.id,
                    })}
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                  >
                    この運転手登録を削除する
                  </button>
                </form>
              </section>
            ) : null}
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">搭乗者として登録</h2>
            <p className="mt-2 text-sm text-slate-500">
              自分が乗る場合はこちらを入力してください。
            </p>
            <form action={createEventMember} className="mt-6 space-y-5">
              <input type="hidden" name="eventId" value={event.id} />
              <input
                type="hidden"
                name="returnTo"
                value={buildParticipantReturnPath(event.id, {
                  memberId: focusedMember?.id,
                  vehicleOfferId: focusedVehicleOffer?.id,
                })}
              />
              <div>
                <label htmlFor="participant-member-name" className="mb-2 block text-sm font-medium text-slate-700">
                  名前
                </label>
                <input
                  id="participant-member-name"
                  name="name"
                  type="text"
                  required
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </div>

              <PlaceSearchSelectInput
                label={memberStartLabel}
                textName="startLocationText"
                latName="startLat"
                lngName="startLng"
                placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'}
                helperText="入力後に検索を押し、候補から1件選んでください"
                required={event.case_type === 'noriai'}
              />

              <PlaceSearchSelectInput
                label={memberDestinationLabel}
                textName="destinationText"
                latName="destinationLat"
                lngName="destinationLng"
                placeholder="駅名、住所を入力"
                helperText="入力後に検索を押し、候補から1件選んでください"
                required={event.case_type === 'sougei'}
              />

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-base font-bold text-white transition hover:bg-teal-600"
              >
                搭乗者を登録する
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">運転手として登録</h2>
            <p className="mt-2 text-sm text-slate-500">
              車を出せる場合はこちらを入力してください。
            </p>
            <form action={createVehicleOffer} className="mt-6 space-y-5">
              <input type="hidden" name="eventId" value={event.id} />
              <input
                type="hidden"
                name="returnTo"
                value={buildParticipantReturnPath(event.id, {
                  memberId: focusedMember?.id,
                  vehicleOfferId: focusedVehicleOffer?.id,
                })}
              />
              <div>
                <label htmlFor="participant-driver-name" className="mb-2 block text-sm font-medium text-slate-700">
                  名前
                </label>
                <input
                  id="participant-driver-name"
                  name="driverName"
                  type="text"
                  required
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </div>

              <PlaceSearchSelectInput
                label={vehicleStartLabel}
                textName="startLocationText"
                latName="startLat"
                lngName="startLng"
                placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'}
                helperText="入力後に検索を押し、候補から1件選んでください"
                required={event.case_type === 'noriai'}
              />

              <div>
                <label htmlFor="participant-capacity" className="mb-2 block text-sm font-medium text-slate-700">
                  定員
                </label>
                <input
                  id="participant-capacity"
                  name="capacity"
                  type="number"
                  min="1"
                  required
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                />
              </div>

              <button
                type="submit"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-base font-bold text-white transition hover:bg-slate-800"
              >
                運転手を登録する
              </button>
            </form>
          </section>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">配車結果</h2>
              <p className="mt-2 text-sm text-slate-500">
                最新化は管理者側で実行してください。公開用ページでも内容確認はできます。
              </p>
            </div>

            <form action={executePlan}>
              <input type="hidden" name="eventId" value={event.id} />
              <input type="hidden" name="returnTo" value={participantPath} />
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                配車結果を更新する
              </button>
            </form>
          </div>

          {routePlansError ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              エラー: {routePlansError.message}
            </div>
          ) : null}

          {event.case_type === 'noriai' && !hasValidEventAt ? (
            <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              到着時間が未設定のため、出発時刻・ピックアップ時刻は表示できません。イベント管理者に到着時間の設定を依頼してください。
            </div>
          ) : null}

          {!safeRoutePlans.length ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm text-slate-500">
                まだ保存済みの配車結果はありません。
              </p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 xl:grid-cols-2">
              {safeRoutePlans.map((plan) => {
                const orderedNames = plan.ordered_member_names ?? plan.member_names ?? []
                const orderedIds = plan.ordered_member_ids ?? []
                const stops = plan.route_stops ?? []
                const mapUrl = buildGoogleMapsDirectionsUrl(stops)
                const planVehicle = safeVehicleOffers.find((vehicle) => vehicle.id === plan.vehicle_offer_id) ?? null
                const orderedMembers = orderedIds
                  .map((memberId) => safeMembers.find((member) => member.id === memberId))
                  .filter((member): member is EventMemberRecord => Boolean(member))
                const timeline = buildNoriaiTimeline({
                  event,
                  eventAt: event.event_at,
                  vehicle: planVehicle,
                  orderedMembers,
                  totalDurationSeconds: plan.total_duration_seconds,
                })

                return (
                  <li
                    key={plan.id}
                    className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-50 shadow-sm"
                  >
                    <div className="border-b border-slate-200 px-6 py-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                              {(plan.member_names ?? []).length}人
                            </span>
                            <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                              {plan.driver_name || '運転手未設定'}
                            </span>
                          </div>

                          {event.case_type === 'noriai' ? (
                            <div className="mt-4 grid gap-2 rounded-xl border border-teal-200 bg-teal-50 p-3 sm:grid-cols-2">
                              <p className="text-xs font-semibold text-teal-800">出発: <span className="text-sm font-extrabold">{formatClock(timeline?.departureAt)}</span></p>
                              <p className="text-xs font-semibold text-teal-800">到着予定: <span className="text-sm font-extrabold">{formatClock(timeline?.arrivalAt)}</span></p>
                            </div>
                          ) : null}

                          <div className="mt-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                              搭乗者
                            </p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {orderedNames.map((name, index) => {
                                const memberId = orderedIds[index]
                                const pickupAt = memberId ? timeline?.pickupTimesByMemberId[memberId] : null

                                return (
                                  <span
                                    key={`${plan.id}-member-${index}`}
                                    className="inline-flex rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white"
                                  >
                                    {name}{event.case_type === 'noriai' ? ` (${formatClock(pickupAt ?? null)})` : ''}
                                  </span>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                            移動時間 / 距離
                          </p>
                          <p className="mt-2 text-sm font-semibold text-slate-900">
                            {formatDistance(plan.total_distance_meters)}
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            {formatDuration(plan.total_duration_seconds)}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="px-6 py-5">
                      {stops.length > 0 ? (
                        <ol className="space-y-0">
                          {stops.map((stop, index) => (
                            <li key={`${plan.id}-stop-${index}`} className="flex gap-4">
                              <div className="flex flex-col items-center">
                                <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-teal-200 bg-teal-50 text-xs font-bold text-teal-700">
                                  {index + 1}
                                </span>
                                {index !== stops.length - 1 ? (
                                  <span className="my-1 h-10 w-px bg-slate-200" />
                                ) : null}
                              </div>
                              <div className="pb-4 pt-1">
                                <p className="text-sm font-medium leading-6 text-slate-800">
                                  {stop}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-sm text-slate-500">ルート未設定</p>
                      )}

                      <div className="mt-4 flex items-center justify-between gap-4 border-t border-slate-200 pt-4">
                        <p className="text-xs text-slate-400">
                          保存日時: {formatCreatedAt(plan.created_at)}
                        </p>
                        {mapUrl ? (
                          <a
                            href={mapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            Google Mapsで開く
                          </a>
                        ) : (
                          <span className="text-sm text-slate-400">Mapsリンクなし</span>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">登録済み搭乗者</h2>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {safeMembers.length}人
              </span>
            </div>

            {!safeMembers.length ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm text-slate-500">まだ搭乗者が登録されていません。</p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {safeMembers.map((member, index) => (
                  <li key={`${member.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                      <Link
                        href={buildParticipantReturnPath(event.id, { memberId: member.id })}
                        className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                      >
                        この登録を編集
                      </Link>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-slate-500">
                      <p>
                        {memberStartLabel}:{' '}
                        {renderLocationText(member.start_location_text, event.case_type === 'sougei' ? sougeiFallbackText : '未設定')}
                      </p>
                      <p>
                        {memberDestinationLabel}: {renderLocationText(member.destination_text, '未設定')}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">登録済み運転手</h2>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {safeVehicleOffers.length}台
              </span>
            </div>

            {!safeVehicleOffers.length ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm text-slate-500">まだ運転手が登録されていません。</p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {safeVehicleOffers.map((vehicle, index) => (
                  <li key={`${vehicle.id}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-900">
                        {vehicle.driver_name} / 定員 {vehicle.capacity}人
                      </p>
                      <Link
                        href={buildParticipantReturnPath(event.id, { vehicleOfferId: vehicle.id })}
                        className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                      >
                        この登録を編集
                      </Link>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {vehicleStartLabel}:{' '}
                      {renderLocationText(vehicle.start_location_text, event.case_type === 'sougei' ? sougeiFallbackText : '未設定')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>

        <div className="flex justify-end">
          <Link
            href={`/admin/events/${event.id}`}
            className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            管理者ページを開く
          </Link>
        </div>
      </div>
    </main>
  )
}
