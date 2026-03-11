import Link from 'next/link'
import PlaceSearchSelectInput from '../components/PlaceSearchSelectInput'
import { supabase } from '../lib/supabase'
import { createEvent } from './actions'
import { getEventOwnerId } from '../lib/eventOwner'

type EventListItem = {
  id: string
  title: string
  case_type: string
  destination_text: string | null
  event_at: string | null
  created_at: string | null
}

function formatMode(caseType: string): string {
  return caseType === 'noriai' ? 'ノリアイ' : 'ソウゲイ'
}

function formatCreatedAt(value: string | null): string {
  if (!value) return '不明'
  return new Date(value).toLocaleDateString('ja-JP')
}

function formatEventAt(value: string | null): string {
  if (!value) return '未設定'
  return new Date(value).toLocaleString('ja-JP')
}

export default async function Home() {
  const ownerId = await getEventOwnerId()

  const eventsQuery = supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false })

  const { data: events, error } = ownerId
    ? await eventsQuery.eq('owner_id', ownerId).returns<EventListItem[]>()
    : { data: [], error: null }

  const safeEvents = events ?? []

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-8 md:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="grid lg:grid-cols-[0.95fr_1.05fr]">
            <div className="border-b border-slate-200 p-8 lg:border-b-0 lg:border-r lg:p-10">
              <div className="max-w-xl">
                <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold tracking-wide text-teal-700">
                  SMART RIDE PLANNING
                </span>

                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">
                  ノッテコ
                </h1>

                <p className="mt-4 text-lg leading-8 text-slate-600">
                  乗り合いも送迎も、スマートに。
                  <br />
                  イベントごとに搭乗者と運転手をまとめて管理し、配車結果まで一気に作れます。
                </p>

                <div className="mt-10">
                  <p className="mb-3 block text-sm font-medium text-slate-700">モード</p>

                  <div className="grid gap-3">
                    <label className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30">
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="caseType"
                          value="noriai"
                          defaultChecked
                          form="create-event-form"
                          className="mt-1"
                        />
                        <div>
                          <p className="text-xl font-bold tracking-tight text-slate-900">
                            ノリアイ
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            同じ目的地へ向かう乗り合い向け
                          </p>
                        </div>
                      </div>
                    </label>

                    <label className="rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-teal-300 hover:bg-teal-50/30">
                      <div className="flex items-start gap-3">
                        <input
                          type="radio"
                          name="caseType"
                          value="sougei"
                          form="create-event-form"
                          className="mt-1"
                        />
                        <div>
                          <p className="text-xl font-bold tracking-tight text-slate-900">
                            ソウゲイ
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            共通基点から複数地点へ送る送迎向け
                          </p>
                        </div>
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-8 lg:p-10">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                  イベントを作成
                </h2>
                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  最短1分
                </span>
              </div>

              <form id="create-event-form" action={createEvent} className="mt-8 space-y-6">
                <div>
                  <label
                    htmlFor="title"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    イベント名
                  </label>
                  <input
                    id="title"
                    name="title"
                    type="text"
                    required
                    placeholder="例: BBQ、営業後送迎、飲み会"
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                  <p className="mt-2 text-xs text-slate-500">イベント名は必須です</p>
                </div>

                <PlaceSearchSelectInput
                  label="ノリアイ: 共通目的地 / ソウゲイ: 共通基点"
                  textName="destinationText"
                  latName="destinationLat"
                  lngName="destinationLng"
                  placeholder="駅名、店舗名、住所を入力"
                  helperText="入力後に検索を押し、候補から1件選んでください"
                  required
                />

                <div>
                  <label
                    htmlFor="event-at"
                    className="mb-2 block text-sm font-medium text-slate-700"
                  >
                    ノリアイ: 到着時間 / ソウゲイ: 集合時間
                  </label>
                  <input
                    id="event-at"
                    name="eventAt"
                    type="datetime-local"
                    required
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-teal-400 focus:ring-4 focus:ring-teal-100"
                  />
                </div>

                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-teal-500 px-4 py-3 text-base font-bold text-white shadow-sm transition hover:bg-teal-600"
                >
                  イベントを作成する
                </button>
              </form>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900">
                作成済みイベント
              </h2>
              <p className="mt-2 text-sm text-slate-500">
                最近作成したイベントから詳細画面へ移動できます
              </p>
            </div>

            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
              {safeEvents.length}件
            </span>
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
              エラー: {error.message}
            </div>
          )}

          {!safeEvents.length ? (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
              <p className="text-sm text-slate-500">まだイベントがありません。</p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {safeEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {event.title}
                        </p>

                        <div className="mt-3 flex items-center gap-2">
                          <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
                            {formatMode(event.case_type)}
                          </span>
                        </div>

                        <p className="mt-4 text-xs text-slate-400">
                          作成日: {formatCreatedAt(event.created_at)}
                        </p>

                        <p className="mt-2 text-sm text-slate-600">
                          {event.case_type === 'noriai' ? '目的地' : '基点'}:{' '}
                          {event.destination_text || '未設定'}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {event.case_type === 'noriai' ? '到着時間' : '集合時間'}: {formatEventAt(event.event_at)}
                        </p>
                      </div>

                      <span className="shrink-0 text-xs font-semibold text-teal-700">
                        詳細 →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}