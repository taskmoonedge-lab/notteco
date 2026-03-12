import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'プライバシーポリシー | Notteco',
  description: 'Nottecoのプライバシーポリシーです。',
}

const policyText = `Notteco（以下「本サービス」といいます。）は、個人情報の重要性を認識し、以下の方針に基づいて適切な取得・利用・管理に努めます。

1. 取得する情報
本サービスでは、イベント作成・参加登録・お問い合わせ対応のために、氏名、連絡先、位置情報、端末情報、Cookie等を取得する場合があります。

2. 利用目的
取得した情報は、以下の目的で利用します。
・本サービスの提供、運営、改善
・お問い合わせへの回答
・不正利用の防止
・法令に基づく対応
・広告配信および効果測定（Google AdSense等）

3. 広告配信について
本サービスでは第三者配信の広告サービス（Google AdSense）を利用する場合があります。
この場合、広告配信事業者はCookieを使用して、利用者の興味に応じた広告を表示することがあります。
Cookieを無効化する方法やGoogle広告に関する詳細は、Googleのポリシーをご確認ください。

4. 第三者提供
法令に基づく場合を除き、ご本人の同意なく個人情報を第三者に提供しません。

5. 安全管理
個人情報への不正アクセス、漏えい、滅失、毀損の防止に努め、必要かつ適切な安全管理措置を講じます。

6. 開示・訂正・削除等
ご本人からの請求があった場合には、法令に従い適切に対応します。

7. 改定
本ポリシーは必要に応じて改定することがあります。重要な変更がある場合は本サービス上で告知します。

8. お問い合わせ窓口
本ポリシーに関するお問い合わせは、「お問い合わせ」ページよりご連絡ください。

附則
令和8年3月12日制定`

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">プライバシーポリシー</h1>
        <p className="mt-6 whitespace-pre-line text-sm leading-7 text-slate-700 sm:text-base">{policyText}</p>
      </div>
    </main>
  )
}
