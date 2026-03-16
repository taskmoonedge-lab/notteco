function EventInfoCard({ pageLabel }: { pageLabel: '管理者ページ' | '参加者ページ' }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
        <div className="border-b border-slate-200 p-8 lg:border-b-0 lg:border-r lg:p-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-700">
              ノリアイ
            </span>
            <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
              {pageLabel}
            </span>
          </div>

          <h2 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900">イベント名（未入力）</h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">共通目的地</p>
              <p className="mt-2 text-sm font-medium text-slate-800">未設定</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">目標到着時間</p>
              <p className="mt-2 text-sm font-medium text-slate-800">未設定</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 p-8">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-medium text-slate-500">イベント参加者</p><p className="mt-1 text-lg font-bold text-slate-900">0人</p></div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-medium text-slate-500">車/運転手</p><p className="mt-1 text-lg font-bold text-slate-900">0台/人</p></div>
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4"><p className="text-xs font-medium text-rose-500">未割当</p><p className="mt-1 text-lg font-bold text-rose-600">0人</p></div>
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4"><p className="text-xs font-medium text-emerald-600">配車済み搭乗者</p><p className="mt-1 text-lg font-bold text-emerald-700">0人</p></div>
          <div className="col-span-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"><p className="text-xs font-medium text-slate-500">総定員</p><p className="mt-1 text-lg font-bold text-slate-900">0人</p></div>
        </div>
      </div>
    </section>
  )
}

export default function EventInfoPreviewPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">イベント情報UI プレビュー（項目値なし）</h1>
          <p className="text-sm text-slate-600">管理者ページと参加者ページのイベント情報カードを、未入力状態で比較できます。</p>
        </header>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">管理者ページ版</p>
          <EventInfoCard pageLabel="管理者ページ" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">参加者ページ版</p>
          <EventInfoCard pageLabel="参加者ページ" />
        </div>
      </div>
    </main>
  )
}
