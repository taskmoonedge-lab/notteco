import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'https://notteco.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ノッテコ',
    template: '%s | ノッテコ',
  },
  description: '乗り合いも送迎も、スマートに。',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'ノッテコ',
    description: '乗り合いも送迎も、スマートに。',
    type: 'website',
    locale: 'ja_JP',
    url: '/',
    siteName: 'ノッテコ',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ノッテコ',
    description: '乗り合いも送迎も、スマートに。',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <head>
        <script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-5595141811855549"
          crossOrigin="anonymous"
        />
      </head>
      <body className={inter.className}>
        <div className="min-h-screen bg-white">
          <header className="border-b border-slate-300 bg-[#F4F7F2]">
            <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="inline-flex items-center" aria-label="トップページへ戻る">
                <Image
                  src="/notteco-logo.svg"
                  alt="NOTTECO"
                  width={210}
                  height={60}
                  priority
                  className="h-10 w-auto sm:h-11"
                />
              </Link>
            </div>
          </header>

          {children}

          <footer className="border-t border-slate-200 bg-slate-50">
            <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-sm text-slate-600 sm:px-6 lg:px-8">
              <p>© {new Date().getFullYear()} Notteco</p>
              <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link href="/terms" className="hover:text-slate-900 hover:underline">
                  利用規約
                </Link>
                <Link href="/privacy" className="hover:text-slate-900 hover:underline">
                  プライバシーポリシー
                </Link>
                <Link href="/contact" className="hover:text-slate-900 hover:underline">
                  お問い合わせ
                </Link>
              </nav>
            </div>
          </footer>
        </div>
      </body>
    </html>
  )
}
