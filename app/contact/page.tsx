import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'お問い合わせ | Notteco',
  description: 'Nottecoへのお問い合わせ窓口です。',
}

export default function ContactPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">お問い合わせ</h1>
        <p className="mt-4 text-sm leading-7 text-slate-700 sm:text-base">
          Nottecoに関するお問い合わせは、以下のメールアドレスまでご連絡ください。
        </p>
        <p className="mt-4 text-base font-semibold text-slate-900 sm:text-lg">support@notteco.jp</p>
        <p className="mt-4 text-sm leading-7 text-slate-600 sm:text-base">
          ※ 返信までに数営業日いただく場合があります。内容により返信できない場合がありますので、あらかじめご了承ください。
        </p>
      </div>
    </main>
  )
}
