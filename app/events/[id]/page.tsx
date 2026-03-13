import Link from 'next/link'
import PlaceSearchSelectInput from '../../../components/PlaceSearchSelectInput'
import { supabase } from '../../../lib/supabase'
import { buildGoogleMapsDirectionsUrl } from '../../../lib/maps'
import { buildNoriaiTimeline } from '../../../lib/planTimeline'
import {
  buildSimplePlan,
  type EventMemberRecord,
  type EventRecord,
  type VehicleOfferRecord,
} from '../../../lib/planner'
import {
  createEventMember,
  createVehicleOffer,
  deleteEvent,
  deleteEventMember,
  deleteRoutePlans,
  deleteVehicleOffer,
  executePlan,
  updateEvent,
  updateEventMember,
  updateVehicleOffer,
} from '../../actions'
import EventToast from './EventToast'
import InviteActions from './InviteActions'

type EventDetailPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ notice?: string }>
}

type RoutePlanRecord = {
  id: string
  event_id: string
  vehicle_offer_id: string | null
  driver_name: string | null
  member_names: string[] | null
  route_text: string | null
  route_stops: string[] | null
  total_distance_meters: number | null
  total_duration_seconds: number | null
  solver_status: string | null
  plan_version: number | null
  ordered_member_ids: string[] | null
  ordered_member_names: string[] | null
  encoded_polyline: string | null
  provider: string | null
  optimization_mode: string | null
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

function formatEventAt(value: string | null | undefined): string {
  if (!value) return '未設定'
  return new Date(value).toLocaleString('ja-JP')
}

function formatClock(value: Date | null | undefined): string {
  if (!value) return '未算出'
  return value.toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toDateTimeLocalValue(value: string | null | undefined): string {
  if (!value) return ''
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return ''
  const offsetDate = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000)
  return offsetDate.toISOString().slice(0, 16)
}

function PlanStatusBanner({
  routePlans,
  notice,
  planIsLatest,
}: {
  routePlans: RoutePlanRecord[]
  notice?: string
  planIsLatest: boolean
}) {
  const isReplanRequired = notice === 'replan_required' || notice === 'replan'

  if (isReplanRequired) {
    return (
      <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 px-6 py-5 shadow-sm">
        <p className="text-base font-extrabold text-amber-900">すべての修正後に「配車する」を押してください。</p>
        <p className="mt-2 text-sm text-amber-800">
          参加者情報が更新され、現在の配車結果は最新ではありません。内容確認後に再度「配車する」を押してください。
        </p>
      </section>
    )
  }

  if (!routePlans.length) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-slate-100 px-6 py-5 shadow-sm">
        <p className="text-base font-extrabold text-slate-900">まだ配車されていません。</p>
        <p className="mt-2 text-sm text-slate-700">搭乗者・運転手・共通基点を確認したら「配車する」を押してください。</p>
      </section>
    )
  }

  if (!planIsLatest) {
    return (
      <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 px-6 py-5 shadow-sm">
        <p className="text-base font-extrabold text-amber-900">現在の配車結果は最新ではありません。</p>
        <p className="mt-2 text-sm text-amber-800">イベント・参加者・運転手情報に変更があります。再度「配車する」を押して更新してください。</p>
      </section>
    )
  }

  return (
    <section className="rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-5 shadow-sm">
      <p className="text-base font-extrabold text-emerald-900">現在の配車結果は最新です。</p>
      <p className="mt-2 text-sm text-emerald-800">このまま参加者へ共有できます。内容を変更した場合は、再度「配車する」を押してください。</p>
    </section>
  )
}

export default async function EventDetailPage({ params, searchParams }: EventDetailPageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const notice = resolvedSearchParams?.notice

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
    .select('*')
    .eq('event_id', id)
    .order('created_at', { ascending: false })
    .returns<RoutePlanRecord[]>()

  const safeMembers = members ?? []
  const safeVehicleOffers = vehicleOffers ?? []
  const safeRoutePlans = routePlans ?? []

  const { assignments, unassignedMembers } = buildSimplePlan(event, safeMembers, safeVehicleOffers)

  const eventBaseLabel = '共通目的地'
  const eventTimeLabel = '目標到着時間'
  const memberStartLabel =
    event.case_type === 'noriai'
      ? '出発地点'
      : '出発地点（共通基点と異なる場合のみ編集してください）'
  const vehicleStartLabel =
    event.case_type === 'noriai'
      ? '運転手の出発地点'
      : '出発地点（共通基点と異なる場合のみ編集してください）'

  const totalCapacity = safeVehicleOffers.reduce((sum, vehicle) => sum + vehicle.capacity, 0)
  const hasValidEventAt = Boolean(event.event_at && !Number.isNaN(new Date(event.event_at).getTime()))
  const assignedMembersCount = assignments.reduce((sum, assignment) => sum + assignment.members.length, 0)
  const totalParticipants = safeMembers.length + safeVehicleOffers.length
  const adminPath = `/admin/events/${event.id}`
  const participantPath = `/e/${event.id}`

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <EventToast notice={notice} />

      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="inline-flex items-center text-sm font-medium text-slate-500 transition hover:text-slate-900">
              ← ホームに戻る
            </Link>
            <Link href={participantPath} className="inline-flex items-center rounded-2xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              参加者ページを開く
            </Link>
          </div>

          <form action={deleteEvent}>
            <input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} />
            <button type="submit" className="inline-flex rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">
              イベントを削除
            </button>
          </form>
        </div>

        <PlanStatusBanner
          routePlans={safeRoutePlans}
          notice={notice}
          planIsLatest={Boolean(event.plan_is_latest)}
        />

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="border-b border-slate-200 p-8 lg:border-b-0 lg:border-r lg:p-10">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">{formatMode(event.case_type)}</span>
                <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">管理者ページ</span>
              </div>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">{event.title}</h1>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{eventBaseLabel}</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{event.destination_text || '未設定'}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{eventTimeLabel}</p>
                  <p className="mt-2 text-sm font-medium text-slate-800">{formatEventAt(event.event_at)}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-8">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-medium text-slate-500">イベント参加者</p><p className="mt-1 text-lg font-bold text-slate-900">{totalParticipants}人</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-medium text-slate-500">車</p><p className="mt-1 text-lg font-bold text-slate-900">{safeVehicleOffers.length}台</p></div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4"><p className="text-xs font-medium text-rose-500">未割当</p><p className="mt-1 text-lg font-bold text-rose-600">{unassignedMembers.length}人</p></div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4"><p className="text-xs font-medium text-emerald-600">配車済み参加者</p><p className="mt-1 text-lg font-bold text-emerald-700">{assignedMembersCount}人</p></div>
              <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-medium text-slate-500">総定員</p><p className="mt-1 text-lg font-bold text-slate-900">{totalCapacity}人</p></div>
            </div>
          </div>
        </section>

        <InviteActions eventTitle={event.title} participantPath={participantPath} />

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">配車結果</h2>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <form action={executePlan}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} /><button type="submit" className="inline-flex items-center justify-center rounded-2xl bg-teal-500 px-5 py-3 text-sm font-bold text-white transition hover:bg-teal-600">配車する</button></form>
              <form action={deleteRoutePlans}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} /><button type="submit" className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">配車結果を削除</button></form>
            </div>
          </div>

          {routePlansError ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">エラー: {routePlansError.message}</div> : null}

          {event.case_type === 'noriai' && !hasValidEventAt ? (
            <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              到着時間が未設定のため、出発時刻・ピックアップ時刻は表示できません。イベント情報から到着時間を設定してください。
            </div>
          ) : null}

          {!safeRoutePlans.length ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-base font-semibold text-slate-800">まだ配車が作成されていません</p>
              <p className="mt-2 text-sm text-slate-600">参加者と運転手を登録したあと「配車する」を押してください。</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {unassignedMembers.length > 0 ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4">
                  <p className="font-semibold text-amber-900">未割り当ての搭乗者</p>
                  <ul className="mt-2 list-disc ml-5 text-sm text-amber-800">
                    {unassignedMembers.map((member) => (
                      <li key={member.id}>{member.name}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="grid gap-4 md:grid-cols-2">
                {safeRoutePlans.map((plan, idx) => {
                  const orderedMemberNames = Array.isArray(plan.ordered_member_names) ? plan.ordered_member_names : []
                  const orderedMemberIds = Array.isArray(plan.ordered_member_ids) ? plan.ordered_member_ids : []
                  const routeStops = Array.isArray(plan.route_stops)
                    ? plan.route_stops.filter((stop) => typeof stop === 'string' && stop.trim().length > 0)
                    : []
                  const mapUrl = buildGoogleMapsDirectionsUrl(routeStops)
                  const planVehicle = safeVehicleOffers.find((vehicle) => vehicle.id === plan.vehicle_offer_id) ?? null
                  const orderedMembers = orderedMemberIds
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
                    <details key={plan.id + idx} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <summary className="cursor-pointer px-5 py-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <p className="font-bold text-slate-900">🚗 車両 {idx + 1}</p>
                            <p className="text-sm text-slate-600">運転手: {plan.driver_name ?? '不明'}</p>
                            <p className="text-sm font-semibold text-slate-800">搭乗者 {orderedMemberNames.length}名</p>
                          </div>
                          <div className="text-sm text-slate-700 sm:text-right">
                            <p>{formatDistance(plan.total_distance_meters)}</p>
                            <p className="mt-1">{formatDuration(plan.total_duration_seconds)}</p>
                          </div>
                        </div>
                      </summary>

                      <div className="space-y-4 border-t border-slate-100 px-5 py-4 text-sm text-slate-700">
                        {event.case_type === 'noriai' ? (
                          <div className="grid gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:grid-cols-2">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">運転手の出発時刻</p>
                              <p className="mt-1 text-lg font-extrabold text-teal-900">{formatClock(timeline?.departureAt)}</p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">目的地到着予定</p>
                              <p className="mt-1 text-lg font-extrabold text-teal-900">{formatClock(timeline?.arrivalAt)}</p>
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <p className="font-semibold text-slate-800">搭乗順{event.case_type === 'noriai' ? '（ピックアップ時刻）' : ''}</p>
                          {orderedMemberNames.length > 0 ? (
                            <ol className="mt-2 space-y-2">
                              {orderedMemberNames.map((name, memberIndex) => {
                                const memberId = orderedMemberIds[memberIndex]
                                const pickupAt = memberId ? timeline?.pickupTimesByMemberId[memberId] : null

                                return (
                                  <li key={`${plan.id}-member-${memberIndex}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                    <span className="font-medium text-slate-800">{memberIndex + 1}. {name}</span>
                                    {event.case_type === 'noriai' ? (
                                      <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-700">
                                        ピックアップ {formatClock(pickupAt ?? null)}
                                      </span>
                                    ) : null}
                                  </li>
                                )
                              })}
                            </ol>
                          ) : (
                            <p className="mt-2 text-sm text-slate-500">搭乗者が割り当てられていません。</p>
                          )}
                        </div>

                        {plan.route_text ? (
                          <p className="break-all text-xs text-slate-500">{plan.route_text}</p>
                        ) : null}

                        <div className="flex flex-wrap items-center gap-3 pt-1">
                          {mapUrl ? (
                            <a
                              href={mapUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center rounded-2xl bg-teal-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-600"
                            >
                              Google Mapsで開く
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">Google Mapsリンクを生成できませんでした</span>
                          )}
                          <span className="text-xs text-slate-400">保存日時: {formatCreatedAt(plan.created_at)}</span>
                        </div>
                      </div>
                    </details>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">イベント情報を編集</h2>
            <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4" open>
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">イベント情報の編集フォームを開く</summary>
              <form action={updateEvent} className="mt-4 space-y-5">
                <input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} />
                <div><label htmlFor="event-title" className="mb-2 block text-sm font-medium text-slate-700">イベント名</label><input id="event-title" name="title" type="text" required defaultValue={event.title} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div>
                <PlaceSearchSelectInput label={eventBaseLabel} textName="destinationText" latName="destinationLat" lngName="destinationLng" defaultText={event.destination_text} defaultLat={event.destination_lat} defaultLng={event.destination_lng} placeholder="駅名、店舗名、住所を入力" helperText="入力後に検索を押し、候補から1件選んでください" required />
                <div><label htmlFor="event-at" className="mb-2 block text-sm font-medium text-slate-700">{eventTimeLabel}</label><input id="event-at" name="eventAt" type="datetime-local" required defaultValue={toDateTimeLocalValue(event.event_at)} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div>
                <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-base font-bold text-white transition hover:bg-teal-600">イベント情報を更新する</button>
              </form>
            </details>
          </div>

          <div className="grid gap-6">
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">搭乗者を追加</h2>
              <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">搭乗者追加フォームを開く</summary>
                <form action={createEventMember} className="mt-4 space-y-5">
                  <input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} />
                  <div><label htmlFor="member-name" className="mb-2 block text-sm font-medium text-slate-700">搭乗者名</label><input id="member-name" name="name" type="text" required className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div>
                  <PlaceSearchSelectInput label={memberStartLabel} textName="startLocationText" latName="startLat" lngName="startLng" placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'} helperText="入力後に検索を押し、候補から1件選んでください" required={event.case_type === 'noriai'} />
                  {event.case_type === 'sougei' ? (
                    <PlaceSearchSelectInput label="到着地点" textName="destinationText" latName="destinationLat" lngName="destinationLng" placeholder="駅名、住所を入力" helperText="入力後に検索を押し、候補から1件選んでください" required />
                  ) : null}
                  <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-base font-bold text-white transition hover:bg-teal-600">搭乗者を追加する</button>
                </form>
              </details>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">運転手を追加</h2>
              <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">運転手追加フォームを開く</summary>
                <form action={createVehicleOffer} className="mt-4 space-y-5">
                  <input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} />
                  <div><label htmlFor="driver-name" className="mb-2 block text-sm font-medium text-slate-700">運転手名</label><input id="driver-name" name="driverName" type="text" required className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div>
                  <PlaceSearchSelectInput label={vehicleStartLabel} textName="startLocationText" latName="startLat" lngName="startLng" placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'} helperText="入力後に検索を押し、候補から1件選んでください" required={event.case_type === 'noriai'} />
                  <div><label htmlFor="capacity" className="mb-2 block text-sm font-medium text-slate-700">定員</label><input id="capacity" name="capacity" type="number" min="1" required className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div>
                  <button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-base font-bold text-white transition hover:bg-teal-600">運転手を追加する</button>
                </form>
              </details>
            </section>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold tracking-tight text-slate-900">搭乗者一覧</h2></div><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{safeMembers.length}人</span></div>
            {!safeMembers.length ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"><p className="text-sm text-slate-500">まだ搭乗者が登録されていません。</p></div> : (
              <ul className="mt-6 space-y-4">
                {safeMembers.map((member) => (
                  <li key={member.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-5">
                      <div><div className="flex items-center gap-2"><p className="text-base font-semibold text-slate-900">{member.name}</p></div><div className="mt-4 space-y-2 text-sm text-slate-600"><p>{memberStartLabel}: {member.start_location_text || (event.case_type === 'sougei' ? '共通基点を使用' : '未設定')}</p>{event.case_type === 'sougei' ? <p>到着地点: {member.destination_text || '未設定'}</p> : null}</div></div>
                      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">この搭乗者を編集</summary><div className="mt-4 space-y-3"><form action={updateEventMember} className="space-y-3"><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} /><input type="hidden" name="memberId" value={member.id} /><div><label className="mb-1 block text-xs font-medium text-slate-700">搭乗者名</label><input name="name" type="text" required defaultValue={member.name} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div><PlaceSearchSelectInput label={memberStartLabel} textName="startLocationText" latName="startLat" lngName="startLng" defaultText={member.start_location_text} defaultLat={member.start_lat} defaultLng={member.start_lng} placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'} helperText="入力後に検索を押し、候補から1件選んでください" required={event.case_type === 'noriai'} />{event.case_type === 'sougei' ? (
<PlaceSearchSelectInput label="到着地点" textName="destinationText" latName="destinationLat" lngName="destinationLng" defaultText={member.destination_text} defaultLat={member.destination_lat} defaultLng={member.destination_lng} placeholder="駅名、住所を入力" helperText="入力後に検索を押し、候補から1件選んでください" required />
) : null}<button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-teal-600">搭乗者を更新</button></form><form action={deleteEventMember}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} /><input type="hidden" name="memberId" value={member.id} /><button type="submit" className="inline-flex w-full justify-center rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">搭乗者を削除</button></form></div></details>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold tracking-tight text-slate-900">運転手一覧</h2></div><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">{safeVehicleOffers.length}台</span></div>
            {!safeVehicleOffers.length ? <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center"><p className="text-sm text-slate-500">まだ運転手が登録されていません。</p></div> : (
              <ul className="mt-6 space-y-4">
                {safeVehicleOffers.map((vehicle) => (
                  <li key={vehicle.id} className="rounded-2xl border border-slate-200 bg-white p-5">
                    <div className="flex flex-col gap-5">
                      <div><div className="flex items-center gap-2"><p className="text-base font-semibold text-slate-900">{vehicle.driver_name}</p><span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">定員 {vehicle.capacity}人</span></div><div className="mt-4 space-y-2 text-sm text-slate-600"><p>{vehicleStartLabel}: {vehicle.start_location_text || (event.case_type === 'sougei' ? '共通基点を使用' : '未設定')}</p></div></div>
                      <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">この運転手を編集</summary><div className="mt-4 space-y-3"><form action={updateVehicleOffer} className="space-y-3"><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} /><input type="hidden" name="vehicleOfferId" value={vehicle.id} /><div><label className="mb-1 block text-xs font-medium text-slate-700">運転手名</label><input name="driverName" type="text" required defaultValue={vehicle.driver_name} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div><PlaceSearchSelectInput label={vehicleStartLabel} textName="startLocationText" latName="startLat" lngName="startLng" defaultText={vehicle.start_location_text} defaultLat={vehicle.start_lat} defaultLng={vehicle.start_lng} placeholder={event.case_type === 'sougei' ? event.destination_text ?? '' : '駅名、住所を入力'} helperText="入力後に検索を押し、候補から1件選んでください" required={event.case_type === 'noriai'} /><div><label className="mb-1 block text-xs font-medium text-slate-700">定員</label><input name="capacity" type="number" min="1" required defaultValue={vehicle.capacity} className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100" /></div><button type="submit" className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-teal-600">運転手を更新</button></form><form action={deleteVehicleOffer}><input type="hidden" name="eventId" value={event.id} /><input type="hidden" name="returnTo" value={adminPath} /><input type="hidden" name="vehicleOfferId" value={vehicle.id} /><button type="submit" className="inline-flex w-full justify-center rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50">運転手を削除</button></form></div></details>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      </div>
    </main>
  )
}
