import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import ModeSwitchFields from '../components/ModeSwitchFields'
import { supabase } from '../lib/supabase'
import { getEventOwnerId } from '../lib/eventOwner'
import { createEvent } from './actions'

export const metadata: Metadata = {
  title: 'Notteco（ノッテコ） | 乗り合い・送迎イベントをかんたん作成',
  description:
    'Nottecoは、リンク共有だけで参加者を集め、AIが最適なルート・配車を自動作成できる乗り合い・送迎調整サービスです。',
}

type CardIcon = 'create' | 'join' | 'plan' | 'golf' | 'snow' | 'bbq' | 'live' | 'club' | 'night'

type EventListItem = {
  id: string
  title: string
  case_type: string
  destination_text: string | null
  event_at: string | null
  created_at: string | null
}

const steps: { title: string; body: string; icon: CardIcon }[] = [
  {
    title: '1. イベント作成',
    body: '目的地（または基点）と日時を入力して、すぐにイベントURLを発行できます。',
    icon: 'create',
  },
  {
    title: '2. 参加者/車登録',
    body: '参加者はURLから参加。必要な車情報・運転情報もまとめて登録できます。',
    icon: 'join',
  },
  {
    title: '3. 配車結果確認',
    body: 'AIが作成したルート・配車結果を確認し、そのまま当日共有に使えます。',
    icon: 'plan',
  },
]

const useCases: { title: string; icon: CardIcon }[] = [
  { title: 'ゴルフ', icon: 'golf' },
  { title: 'スキー/スノボ', icon: 'snow' },
  { title: 'BBQ', icon: 'bbq' },
  { title: 'ライブ・フェス', icon: 'live' },
  { title: '部活・合宿送迎', icon: 'club' },
  { title: 'ナイトワーク・キャバクラ送迎', icon: 'night' },
]

const seoKeywords =
  '新年会 送別会 忘年会 幹事 結婚式二次会 宴会 花見 歓迎会 同窓会 懇談会 暑気払い 壮行会 打ち合わせ 送迎会 誕生日 キャンプ スキー スノーボード バーベキュー フットサル ボウリング 合コン 合宿 社員旅行 女子会 旅行 ミーティング 会議 懇親会 納会 お正月 カラオケ クラス会 ゴルフ テニス バスケ バドミントン バレーボール イルミネーション さくらんぼ狩り 紅葉狩り 大掃除 カウントダウン みかん狩り 屋形船 パーティー OB会 プール ボランティア ワークショップ セミナー 夏休み お盆 祭り マラソン イベント 打ち上げ ビアガーデン 案内状 初詣 招待状 成人式 大晦日 釣り 登山 鍋パーティー 草野球 アンケート クリスマス コミケ サッカー サバゲー シフト表 スケート ツーリング ボルダリング ラフティング 海水浴 人狼 追いコン 読書会 文化祭 麻雀 温泉 いちご狩り バンド ピクニック ソフトボール ダーツ ハイキング パラグライダー ハロウィン 花火大会 剣道 ビリヤード 柔道 卒業旅行 ハンドボール ラグビー ランニング 納涼船 アウトドア アメフト ぶどう狩り'

function Icon({ type }: { type: CardIcon }) {
  const map: Record<CardIcon, string> = {
    create: '📝',
    join: '👥',
    plan: '🗺️',
    golf: '⛳',
    snow: '🏂',
    bbq: '🍖',
    live: '🎵',
    club: '🚌',
    night: '🌙',
  }

  return (
    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-200 to-teal-100 text-2xl shadow-sm">
      <span aria-hidden>{map[type]}</span>
      <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-orange-300" />
      <span className="absolute -bottom-1 -left-1 h-2.5 w-2.5 rounded-full bg-sky-300" />
    </div>
  )
}

function ModeImageIcon({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="h-60 w-60 max-w-full">
      <Image
        src={src}
        alt={alt}
        width={240}
        height={240}
        className="h-60 w-60 max-w-full rounded-2xl border border-slate-200 bg-white object-contain p-2 shadow-sm"
      />
    </div>
  )
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
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 via-white to-white text-slate-800">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <section className="rounded-3xl border border-emerald-100 bg-white p-6 shadow-sm sm:p-8 lg:p-12">
          <div>
            <p className="inline-flex rounded-full bg-emerald-100 px-4 py-1.5 text-sm font-bold text-emerald-700">
              乗り合い・送迎の調整を、一瞬で完結
            </p>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl">
              Nottecoで最短・最適配車
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-8 text-slate-700 sm:text-lg">
              リンクを参加者に送り、登録するだけでAIが最適なルート・配車を自動作成。
              乗り合いも送迎も、イベント単位で迷わず整理できます。
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="#quick-create"
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600"
              >
                イベントを作成する
              </Link>
              <Link
                href="#how-to"
                className="inline-flex items-center justify-center rounded-xl border border-emerald-200 bg-white px-6 py-3.5 text-base font-bold text-emerald-700 transition hover:bg-emerald-50"
              >
                使い方を見る
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="about-title">
          <h2 id="about-title" className="text-3xl font-extrabold tracking-tight text-slate-900">
            用途に合わせてモード切替
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <ModeImageIcon src="/noriai.png" alt="ノリアイの説明画像" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">ノリアイ（相乗り）</h3>
              <p className="mt-2 text-base font-medium leading-7 text-slate-700">
                同じ目的地に向かうグループに。誰がどの車に乗るかを整理し、移動連絡をシンプルにします。
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <ModeImageIcon src="/sougei.png" alt="ソウゲイの説明画像" />
              <h3 className="mt-4 text-lg font-bold text-slate-900">ソウゲイ（送迎）</h3>
              <p className="mt-2 text-base font-medium leading-7 text-slate-700">
                共通基点からの送迎に。複数地点への送迎先を整理し、当日の連絡ミスや抜け漏れを減らします。
              </p>
            </article>
          </div>
        </section>

        <section id="how-to" className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="how-title">
          <h2 id="how-title" className="text-3xl font-extrabold tracking-tight text-slate-900">
            使い方は簡単3ステップ
          </h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {steps.map((step) => (
              <article key={step.title} className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
                <Icon type={step.icon} />
                <h3 className="mt-4 text-lg font-bold text-slate-900">{step.title}</h3>
                <p className="mt-2 text-base font-medium leading-7 text-slate-700">{step.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="usecase-title">
          <h2 id="usecase-title" className="text-3xl font-extrabold tracking-tight text-slate-900">
            こんな場面で選ばれています
          </h2>
          <ul className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map((item) => (
              <li key={item.title} className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-base font-bold text-slate-800">
                <div className="flex items-center gap-3">
                  <Icon type={item.icon} />
                  <span>{item.title}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="safe-title">
          <h2 id="safe-title" className="text-3xl font-extrabold tracking-tight text-slate-900">
            はじめやすい設計
          </h2>
          <ul className="mt-4 space-y-3 text-base font-medium leading-8 text-slate-700">
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <Image src="/check-circle.svg" alt="チェック" width={20} height={20} className="mt-1 h-5 w-5 shrink-0" />
              <span>ログイン不要でイベント作成・参加ができます。</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <Image src="/check-circle.svg" alt="チェック" width={20} height={20} className="mt-1 h-5 w-5 shrink-0" />
              <span>発行されたURLを共有するだけで参加者を招待できます。</span>
            </li>
            <li className="flex items-start gap-3 rounded-xl bg-slate-50 px-4 py-3">
              <Image src="/check-circle.svg" alt="チェック" width={20} height={20} className="mt-1 h-5 w-5 shrink-0" />
              <span>スマホで見やすいUIで、当日確認もスムーズです。</span>
            </li>
          </ul>
        </section>

        <section id="quick-create" className="mt-8 rounded-3xl border border-emerald-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="cta-title">
          <div className="flex items-center justify-between gap-3">
            <h2 id="cta-title" className="text-3xl font-extrabold tracking-tight text-slate-900">
              今すぐイベントを作成
            </h2>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">最短1分</span>
          </div>

          <form id="create-event-form" action={createEvent} className="mt-6 space-y-5">
            <div>
              <label htmlFor="title" className="mb-2 block text-base font-bold text-slate-800">
                イベント名
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                placeholder="例: ゴルフ送迎 / BBQ / ライブ遠征"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-base font-medium outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-100"
              />
            </div>

            <ModeSwitchFields />

            <p className="text-center text-sm font-medium text-slate-600">
              <Link href="/terms" className="font-bold text-orange-500 underline underline-offset-2 hover:text-orange-600">
                利用規約
              </Link>
              に同意して、
            </p>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3.5 text-base font-bold text-white transition hover:bg-emerald-600"
            >
              今すぐイベントを作成
            </button>
          </form>
        </section>

        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8" aria-labelledby="event-list-title">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="event-list-title" className="text-3xl font-extrabold tracking-tight text-slate-900">
                作成済みイベント
              </h2>
              <p className="mt-2 text-base font-medium text-slate-600">
                最近作成したイベントから詳細画面へ移動できます
              </p>
            </div>

            <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm font-bold text-slate-700">
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
              <p className="text-base font-medium text-slate-500">まだイベントがありません。</p>
            </div>
          ) : (
            <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {safeEvents.map((event) => (
                <li key={event.id}>
                  <Link
                    href={`/admin/events/${event.id}`}
                    className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="truncate text-base font-bold text-slate-900">{event.title}</p>

                        <div className="mt-3 flex items-center gap-2">
                          <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                            {formatMode(event.case_type)}
                          </span>
                        </div>

                        <p className="mt-4 text-xs text-slate-400">作成日: {formatCreatedAt(event.created_at)}</p>

                        <p className="mt-2 text-sm text-slate-600">
                          {event.case_type === 'noriai' ? '目的地' : '基点'}: {event.destination_text || '未設定'}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {event.case_type === 'noriai' ? '到着時間' : '集合時間'}: {formatEventAt(event.event_at)}
                        </p>
                      </div>

                      <span className="shrink-0 text-xs font-semibold text-emerald-700">詳細 →</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <p className="mt-8 text-center text-xs leading-6 text-slate-400">{seoKeywords}</p>
      </div>
    </main>
  )
}
