import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Image from 'next/image'
import Link from 'next/link'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'ノッテコ',
  description: '乗り合いも送迎も、スマートに。',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className={inter.className}>
        <div className="min-h-screen bg-white">
          <header className="border-b border-slate-300 bg-[#F4F7F2]">
            <div className="mx-auto flex w-full max-w-6xl items-center px-4 py-3 sm:px-6 lg:px-8">
              <Link href="/" className="inline-flex items-center" aria-label="トップページへ戻る">
                <Image
                  src="/notteco-app/notteco.png"
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
        </div>
      </body>
    </html>
  )
}
