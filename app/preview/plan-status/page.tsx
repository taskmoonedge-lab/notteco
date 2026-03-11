export default function PlanStatusPreviewPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
            配車ステータスバナー プレビュー
          </h1>
          <p className="text-sm text-slate-600">
            管理者ページ/参加者ページで表示される「配車結果の最新状態」の見た目確認用です。
          </p>
        </header>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            オフ（最新ではありません）
          </p>
          <section className="rounded-3xl border-2 border-amber-300 bg-amber-50 px-6 py-5 shadow-sm">
            <p className="text-base font-extrabold text-amber-900">現在の配車結果は最新ではありません。</p>
            <p className="mt-2 text-sm text-amber-800">
              イベント・参加者・運転手情報に変更があります。再度「配車する」を押して更新してください。
            </p>
          </section>
        </section>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            オン（最新です）
          </p>
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 px-6 py-5 shadow-sm">
            <p className="text-base font-extrabold text-emerald-900">現在の配車結果は最新です。</p>
            <p className="mt-2 text-sm text-emerald-800">
              このまま参加者へ共有できます。内容を変更した場合は、再度「配車する」を押してください。
            </p>
          </section>
        </section>
      </div>
    </main>
  )
}
