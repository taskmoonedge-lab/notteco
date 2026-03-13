import Link from "next/link";
import PlaceSearchSelectInput from "../../../components/PlaceSearchSelectInput";
import { supabase } from "../../../lib/supabase";
import { buildGoogleMapsDirectionsUrl } from "../../../lib/maps";
import { buildNoriaiTimeline } from "../../../lib/planTimeline";
import {
  type EventMemberRecord,
  type EventRecord,
  type VehicleOfferRecord,
} from "../../../lib/planner";
import {
  createEventMember,
  createVehicleOffer,
  deleteEventMember,
  deleteVehicleOffer,
  updateEventMember,
  updateVehicleOffer,
} from "../../actions";
import EventToast from "../../events/[id]/EventToast";

type ParticipantEventPageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    notice?: string;
    memberId?: string;
    vehicleOfferId?: string;
  }>;
};

type RoutePlanRecord = {
  id: string;
  vehicle_offer_id: string | null;
  driver_name: string | null;
  member_names: string[] | null;
  route_stops: string[] | null;
  total_distance_meters: number | null;
  total_duration_seconds: number | null;
  ordered_member_ids: string[] | null;
  ordered_member_names: string[] | null;
  created_at: string;
};

function formatDistance(distanceMeters: number | null): string {
  if (distanceMeters == null) return "未設定";
  if (distanceMeters >= 1000) return `${(distanceMeters / 1000).toFixed(1)} km`;
  return `${distanceMeters} m`;
}

function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds == null) return "未設定";
  const hours = Math.floor(durationSeconds / 3600);
  const minutes = Math.round((durationSeconds % 3600) / 60);
  return hours > 0 ? `${hours}時間${minutes}分` : `${minutes}分`;
}

function formatMode(caseType: string): string {
  return caseType === "noriai" ? "ノリアイ" : "ソウゲイ";
}

function formatCreatedAt(value: string | null): string {
  if (!value) return "不明";
  return new Date(value).toLocaleString("ja-JP");
}

function formatEventAt(value: string | null | undefined): string {
  if (!value) return "未設定";
  return new Date(value).toLocaleString("ja-JP");
}
function formatClock(value: Date | null | undefined): string {
  if (!value) return "未算出";
  return value.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildParticipantReturnPath(
  eventId: string,
  options?: { memberId?: string; vehicleOfferId?: string },
) {
  const params = new URLSearchParams();

  if (options?.memberId) {
    params.set("memberId", options.memberId);
  }

  if (options?.vehicleOfferId) {
    params.set("vehicleOfferId", options.vehicleOfferId);
  }

  const query = params.toString();
  return query ? `/e/${eventId}?${query}` : `/e/${eventId}`;
}

function renderLocationText(
  value: string | null | undefined,
  fallback: string,
): string {
  return value && value.trim() ? value : fallback;
}

export default async function ParticipantEventPage({
  params,
  searchParams,
}: ParticipantEventPageProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const notice = resolvedSearchParams?.notice;
  const focusedMemberId = resolvedSearchParams?.memberId;
  const focusedVehicleOfferId = resolvedSearchParams?.vehicleOfferId;

  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", id)
    .single<EventRecord>();

  if (eventError || !event) {
    return <main className="p-8">イベントが見つかりません</main>;
  }

  const { data: members } = await supabase
    .from("event_members")
    .select("*")
    .eq("event_id", id)
    .order("created_at", { ascending: false })
    .returns<EventMemberRecord[]>();

  const { data: vehicleOffers } = await supabase
    .from("vehicle_offers")
    .select("*")
    .eq("event_id", id)
    .order("capacity", { ascending: false })
    .returns<VehicleOfferRecord[]>();

  const { data: routePlans, error: routePlansError } = await supabase
    .from("route_plans")
    .select(
      "id, vehicle_offer_id, driver_name, member_names, route_stops, total_distance_meters, total_duration_seconds, ordered_member_ids, ordered_member_names, created_at",
    )
    .eq("event_id", id)
    .order("created_at", { ascending: false })
    .returns<RoutePlanRecord[]>();

  const safeMembers = members ?? [];
  const safeVehicleOffers = vehicleOffers ?? [];
  const safeRoutePlans = routePlans ?? [];
  const totalCapacity = safeVehicleOffers.reduce(
    (sum, vehicle) => sum + vehicle.capacity,
    0,
  );
  const eventBaseLabel = "共通目的地";
  const eventTimeLabel = "目標到着時間";
  const memberStartLabel =
    event.case_type === "noriai"
      ? "出発地点"
      : "出発地点（共通基点と異なる場合のみ編集してください）";
  const vehicleStartLabel =
    event.case_type === "noriai"
      ? "運転手の出発地点"
      : "出発地点（共通基点と異なる場合のみ編集してください）";
  const sougeiFallbackText = event.destination_text || "共通基点を使用";
  const hasValidEventAt = Boolean(
    event.event_at && !Number.isNaN(new Date(event.event_at).getTime()),
  );
  const assignedMembersCount = safeRoutePlans.length
    ? (safeRoutePlans[0]?.ordered_member_ids?.length ?? 0)
    : 0;
  const totalParticipants = safeMembers.length + safeVehicleOffers.length;
  const unassignedMembersCount = Math.max(
    safeMembers.length - assignedMembersCount,
    0,
  );
  const registerButtonClass =
    "inline-flex min-h-14 w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-teal-600 sm:text-base";

  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <EventToast notice={notice} />

      <div className="mx-auto max-w-5xl space-y-6">
        {safeRoutePlans.length > 0 && !event.plan_is_latest ? (
          <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 px-6 py-5 shadow-sm">
            <p className="text-base font-extrabold text-amber-900">
              現在の配車結果は最新ではありません。
            </p>
            <p className="mt-2 text-sm text-amber-800">
              イベント・参加者・運転手情報に変更があります。管理者が再度「配車する」を押して更新してください。
            </p>
          </section>
        ) : null}

        {safeRoutePlans.length > 0 && event.plan_is_latest ? (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-5 shadow-sm">
            <p className="text-base font-extrabold text-emerald-900">
              現在の配車結果は最新です。
            </p>
            <p className="mt-2 text-sm text-emerald-800">
              このまま内容を確認できます。変更があった場合は管理者が再度配車を実行してください。
            </p>
          </section>
        ) : null}

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="border-b border-slate-200 p-8 lg:border-b-0 lg:border-r lg:p-10">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                  {formatMode(event.case_type)}
                </span>
                <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  参加者ページ
                </span>
              </div>
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">
                {event.title}
              </h1>
              <div className="mt-8 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {eventBaseLabel}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    {event.destination_text || "未設定"}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {eventTimeLabel}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-800">
                    {formatEventAt(event.event_at)}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-8">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium text-slate-500">
                  イベント参加者
                </p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {totalParticipants}人
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium text-slate-500">車</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {safeVehicleOffers.length}台
                </p>
              </div>
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4">
                <p className="text-xs font-medium text-rose-500">未割当</p>
                <p className="mt-1 text-lg font-bold text-rose-600">
                  {unassignedMembersCount}人
                </p>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                <p className="text-xs font-medium text-emerald-600">
                  配車済み参加者
                </p>
                <p className="mt-1 text-lg font-bold text-emerald-700">
                  {assignedMembersCount}人
                </p>
              </div>
              <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium text-slate-500">総定員</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {totalCapacity}人
                </p>
              </div>
              <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-xs font-medium text-slate-500">最終更新</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {formatCreatedAt(event.created_at)}
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              搭乗者として登録
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              自分が乗る場合はこちらを入力してください。
            </p>
            <form action={createEventMember} className="mt-6 space-y-5">
              <input type="hidden" name="eventId" value={event.id} />
              <input
                type="hidden"
                name="returnTo"
                value={buildParticipantReturnPath(event.id)}
              />
              <div>
                <label
                  htmlFor="participant-member-name"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
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
                placeholder={
                  event.case_type === "sougei"
                    ? (event.destination_text ?? "")
                    : "駅名、住所を入力"
                }
                helperText="入力後に検索を押し、候補から1件選んでください"
                required={event.case_type === "noriai"}
              />

              {event.case_type === "sougei" ? (
                <PlaceSearchSelectInput
                  label="到着地点"
                  textName="destinationText"
                  latName="destinationLat"
                  lngName="destinationLng"
                  placeholder="駅名、住所を入力"
                  helperText="入力後に検索を押し、候補から1件選んでください"
                  required
                />
              ) : null}

              <button
                type="submit"
                className={registerButtonClass}
              >
                搭乗者を登録する
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              運転手として登録
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              車を出せる場合はこちらを入力してください。
            </p>
            <form action={createVehicleOffer} className="mt-6 space-y-5">
              <input type="hidden" name="eventId" value={event.id} />
              <input
                type="hidden"
                name="returnTo"
                value={buildParticipantReturnPath(event.id)}
              />
              <div>
                <label
                  htmlFor="participant-driver-name"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
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
                placeholder={
                  event.case_type === "sougei"
                    ? (event.destination_text ?? "")
                    : "駅名、住所を入力"
                }
                helperText="入力後に検索を押し、候補から1件選んでください"
                required={event.case_type === "noriai"}
              />

              <div>
                <label
                  htmlFor="participant-capacity"
                  className="mb-2 block text-sm font-medium text-slate-700"
                >
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
                className={registerButtonClass}
              >
                運転手を登録する
              </button>
            </form>
          </section>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                配車結果
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                最新化は管理者側で実行してください。公開用ページでも内容確認はできます。
              </p>
            </div>
          </div>

          {routePlansError ? (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              エラー: {routePlansError.message}
            </div>
          ) : null}

          {event.case_type === "noriai" && !hasValidEventAt ? (
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
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {safeRoutePlans.map((plan, idx) => {
                const orderedNames =
                  plan.ordered_member_names ?? plan.member_names ?? [];
                const orderedIds = plan.ordered_member_ids ?? [];
                const stops = plan.route_stops ?? [];
                const mapUrl = buildGoogleMapsDirectionsUrl(stops);
                const planVehicle =
                  safeVehicleOffers.find(
                    (vehicle) => vehicle.id === plan.vehicle_offer_id,
                  ) ?? null;
                const orderedMembers = orderedIds
                  .map((memberId) =>
                    safeMembers.find((member) => member.id === memberId),
                  )
                  .filter((member): member is EventMemberRecord =>
                    Boolean(member),
                  );
                const timeline = buildNoriaiTimeline({
                  event,
                  eventAt: event.event_at,
                  vehicle: planVehicle,
                  orderedMembers,
                  totalDurationSeconds: plan.total_duration_seconds,
                });

                return (
                  <details
                    key={plan.id}
                    className="rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <summary className="cursor-pointer px-5 py-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-2">
                          <p className="font-bold text-slate-900">
                            🚗 車両 {idx + 1}
                          </p>
                          <p className="text-sm text-slate-600">
                            運転手: {plan.driver_name ?? "不明"}
                          </p>
                          <p className="text-sm font-semibold text-slate-800">
                            搭乗者 {orderedNames.length}名
                          </p>
                        </div>
                        <div className="text-sm text-slate-700 sm:text-right">
                          <p>{formatDistance(plan.total_distance_meters)}</p>
                          <p className="mt-1">
                            {formatDuration(plan.total_duration_seconds)}
                          </p>
                        </div>
                      </div>
                    </summary>

                    <div className="space-y-4 border-t border-slate-100 px-5 py-4 text-sm text-slate-700">
                      {event.case_type === "noriai" ? (
                        <div className="grid gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 sm:grid-cols-2">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                              運転手の出発時刻
                            </p>
                            <p className="mt-1 text-lg font-extrabold text-teal-900">
                              {formatClock(timeline?.departureAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">
                              目的地到着予定
                            </p>
                            <p className="mt-1 text-lg font-extrabold text-teal-900">
                              {formatClock(timeline?.arrivalAt)}
                            </p>
                          </div>
                        </div>
                      ) : null}

                      <div>
                        <p className="font-semibold text-slate-800">
                          搭乗順
                          {event.case_type === "noriai"
                            ? "（ピックアップ時刻）"
                            : ""}
                        </p>
                        {orderedNames.length > 0 ? (
                          <ol className="mt-2 space-y-2">
                            {orderedNames.map((name, index) => {
                              const memberId = orderedIds[index];
                              const pickupAt = memberId
                                ? timeline?.pickupTimesByMemberId[memberId]
                                : null;

                              return (
                                <li
                                  key={`${plan.id}-member-${index}`}
                                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                                >
                                  <span className="font-medium text-slate-800">
                                    {index + 1}. {name}
                                  </span>
                                  {event.case_type === "noriai" ? (
                                    <span className="inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-teal-700">
                                      ピックアップ{" "}
                                      {formatClock(pickupAt ?? null)}
                                    </span>
                                  ) : null}
                                </li>
                              );
                            })}
                          </ol>
                        ) : (
                          <p className="mt-2 text-sm text-slate-500">
                            搭乗者が割り当てられていません。
                          </p>
                        )}
                      </div>

                      {stops.length > 0 ? (
                        <ol className="space-y-0">
                          {stops.map((stop, index) => (
                            <li
                              key={`${plan.id}-stop-${index}`}
                              className="flex gap-4"
                            >
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

                      <div className="flex flex-wrap items-center gap-3 pt-1">
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
                          <span className="text-xs text-slate-400">
                            Google Mapsリンクを生成できませんでした
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          保存日時: {formatCreatedAt(plan.created_at)}
                        </span>
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                登録済み搭乗者
              </h2>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {safeMembers.length}人
              </span>
            </div>

            {!safeMembers.length ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm text-slate-500">
                  まだ搭乗者が登録されていません。
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {safeMembers.map((member, index) => {
                  const isFocused = member.id === focusedMemberId;

                  return (
                    <li
                      key={`${member.id}-${index}`}
                      className={
                        isFocused
                          ? "rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm"
                          : "rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {member.name}
                          </p>
                          {isFocused ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              追加済み
                            </span>
                          ) : null}
                        </div>
                        <Link
                          href={buildParticipantReturnPath(event.id, {
                            memberId: member.id,
                          })}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                        >
                          この登録を編集
                        </Link>
                      </div>
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <p>
                          {memberStartLabel}:{" "}
                          {renderLocationText(
                            member.start_location_text,
                            event.case_type === "sougei"
                              ? sougeiFallbackText
                              : "未設定",
                          )}
                        </p>
                        {event.case_type === "sougei" ? (
                          <p>
                            到着地点:{" "}
                            {renderLocationText(
                              member.destination_text,
                              "未設定",
                            )}
                          </p>
                        ) : null}
                      </div>
                      <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                          この搭乗者を編集
                        </summary>
                        <div className="mt-4 space-y-3">
                          <form action={updateEventMember} className="space-y-3">
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={buildParticipantReturnPath(event.id, {
                                memberId: member.id,
                              })}
                            />
                            <input
                              type="hidden"
                              name="memberId"
                              value={member.id}
                            />
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-700">
                                搭乗者名
                              </label>
                              <input
                                name="name"
                                type="text"
                                required
                                defaultValue={member.name}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                              />
                            </div>
                            <PlaceSearchSelectInput
                              label={memberStartLabel}
                              textName="startLocationText"
                              latName="startLat"
                              lngName="startLng"
                              defaultText={member.start_location_text}
                              defaultLat={member.start_lat}
                              defaultLng={member.start_lng}
                              placeholder={
                                event.case_type === "sougei"
                                  ? (event.destination_text ?? "")
                                  : "駅名、住所を入力"
                              }
                              helperText="入力後に検索を押し、候補から1件選んでください"
                              required={event.case_type === "noriai"}
                            />
                            {event.case_type === "sougei" ? (
                              <PlaceSearchSelectInput
                                label="到着地点"
                                textName="destinationText"
                                latName="destinationLat"
                                lngName="destinationLng"
                                defaultText={member.destination_text}
                                defaultLat={member.destination_lat}
                                defaultLng={member.destination_lng}
                                placeholder="駅名、住所を入力"
                                helperText="入力後に検索を押し、候補から1件選んでください"
                                required
                              />
                            ) : null}
                            <button
                              type="submit"
                              className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-teal-600"
                            >
                              搭乗者を更新
                            </button>
                          </form>
                          <form action={deleteEventMember}>
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={buildParticipantReturnPath(event.id)}
                            />
                            <input
                              type="hidden"
                              name="memberId"
                              value={member.id}
                            />
                            <button
                              type="submit"
                              className="inline-flex w-full justify-center rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              搭乗者を削除
                            </button>
                          </form>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                登録済み運転手
              </h2>
              <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {safeVehicleOffers.length}台
              </span>
            </div>

            {!safeVehicleOffers.length ? (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm text-slate-500">
                  まだ運転手が登録されていません。
                </p>
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {safeVehicleOffers.map((vehicle, index) => {
                  const isFocused = vehicle.id === focusedVehicleOfferId;

                  return (
                    <li
                      key={`${vehicle.id}-${index}`}
                      className={
                        isFocused
                          ? "rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm"
                          : "rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      }
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-slate-900">
                            {vehicle.driver_name} / 定員 {vehicle.capacity}人
                          </p>
                          {isFocused ? (
                            <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                              追加済み
                            </span>
                          ) : null}
                        </div>
                        <Link
                          href={buildParticipantReturnPath(event.id, {
                            vehicleOfferId: vehicle.id,
                          })}
                          className="text-xs font-semibold text-teal-700 hover:text-teal-800"
                        >
                          この登録を編集
                        </Link>
                      </div>
                      <p className="mt-2 text-xs text-slate-500">
                        {vehicleStartLabel}:{" "}
                        {renderLocationText(
                          vehicle.start_location_text,
                          event.case_type === "sougei"
                            ? sougeiFallbackText
                            : "未設定",
                        )}
                      </p>
                      <details className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <summary className="cursor-pointer list-none text-sm font-semibold text-slate-900">
                          この運転手を編集
                        </summary>
                        <div className="mt-4 space-y-3">
                          <form action={updateVehicleOffer} className="space-y-3">
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={buildParticipantReturnPath(event.id, {
                                vehicleOfferId: vehicle.id,
                              })}
                            />
                            <input
                              type="hidden"
                              name="vehicleOfferId"
                              value={vehicle.id}
                            />
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-700">
                                運転手名
                              </label>
                              <input
                                name="driverName"
                                type="text"
                                required
                                defaultValue={vehicle.driver_name}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                              />
                            </div>
                            <PlaceSearchSelectInput
                              label={vehicleStartLabel}
                              textName="startLocationText"
                              latName="startLat"
                              lngName="startLng"
                              defaultText={vehicle.start_location_text}
                              defaultLat={vehicle.start_lat}
                              defaultLng={vehicle.start_lng}
                              placeholder={
                                event.case_type === "sougei"
                                  ? (event.destination_text ?? "")
                                  : "駅名、住所を入力"
                              }
                              helperText="入力後に検索を押し、候補から1件選んでください"
                              required={event.case_type === "noriai"}
                            />
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-700">
                                定員
                              </label>
                              <input
                                name="capacity"
                                type="number"
                                min="1"
                                required
                                defaultValue={vehicle.capacity}
                                className="w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                              />
                            </div>
                            <button
                              type="submit"
                              className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-teal-600"
                            >
                              運転手を更新
                            </button>
                          </form>
                          <form action={deleteVehicleOffer}>
                            <input type="hidden" name="eventId" value={event.id} />
                            <input
                              type="hidden"
                              name="returnTo"
                              value={buildParticipantReturnPath(event.id)}
                            />
                            <input
                              type="hidden"
                              name="vehicleOfferId"
                              value={vehicle.id}
                            />
                            <button
                              type="submit"
                              className="inline-flex w-full justify-center rounded-2xl border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                            >
                              運転手を削除
                            </button>
                          </form>
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
