This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.


## AdSense setup (for production)

Set your AdSense publisher id as an environment variable before deployment:

```bash
NEXT_PUBLIC_ADSENSE_CLIENT_ID=ca-pub-xxxxxxxxxxxxxxxx
```

The script is loaded globally only when this variable is set.

---

## 最速構成Aでサービス開始する手順（Vercel + Render + Supabase + Cloudflare）

「とにかく早く公開」を目的に、以下の役割分担で進めます。

- **Vercel**: Next.js フロント（このリポジトリ）
- **Render**: API/バッチなどのバックエンド
- **Supabase**: PostgreSQL（認証を使う場合も相性が良い）
- **Cloudflare**: DNS 管理（独自ドメイン接続）

### 0. 事前に決めること（15分）

1. 本番ドメイン（例: `example.com`）
2. サブドメイン方針
   - フロント: `app.example.com` または `example.com`
   - API: `api.example.com`
3. 本番環境変数名を先に固定
   - `NEXT_PUBLIC_API_BASE_URL`
   - `DATABASE_URL`
   - `JWT_SECRET`
   - 各種 API キー

---

### 1. Supabase でDBを用意（20〜30分）

1. Supabase で新規プロジェクトを作成
2. `Project Settings > Database` から接続情報を取得
3. `sql/` 配下の SQL を Supabase SQL Editor で順に実行
4. 最低限の確認
   - テーブルが作成されている
   - インデックス/制約が適用されている
   - 接続文字列（`DATABASE_URL`）が控えられている

> ポイント: 本番用と開発用で DB を分けると事故を防げます。

---


---

### 3. Vercel にこの Next.js をデプロイ（20〜30分）

1. Vercel に GitHub リポジトリを接続
2. Framework Preset は `Next.js` を選択
3. 環境変数を設定（Production / Preview それぞれ）
   - `NEXT_PUBLIC_API_BASE_URL=https://api.example.com`（仮で Render URL でも可）
   - `NEXT_PUBLIC_ADSENSE_CLIENT_ID`（使う場合）
4. 初回デプロイ
5. Vercel のURLで表示確認

---

### 4. 独自ドメインを Cloudflare 経由で接続（30〜60分）

1. ドメイン取得先（お名前.com 等）でドメインを取得
2. Cloudflare にドメインを追加
3. レジストラ側のネームサーバーを Cloudflare 指定値へ変更
4. Cloudflare DNS でレコード作成
   - フロント（Vercel）
     - `CNAME app -> cname.vercel-dns.com`（または Vercel 指示値）
   - API（Render）
     - `CNAME api -> <render-domain>`
5. Vercel 側で `app.example.com`（またはルート）を追加
6. Render 側で `api.example.com` をカスタムドメイン追加
7. SSL 有効化確認（通常自動）

---

### 5. 本番リリース前チェック（必須）

1. 主要導線の確認
   - トップ表示
   - API連携画面
   - フォーム送信
2. 失敗系の確認
   - API停止時の表示
   - 404/500
3. セキュリティ最低限
   - 秘密情報がクライアントに露出していない
   - CORS が本番ドメインだけ許可されている
4. 監視
   - Vercel/Render のログ確認
   - 障害通知先（メール or Slack）設定

---

### 6. 最短リリース運用（初月）

- 1日1回: エラーログ確認
- 週1回: 主要KPI（アクセス・CV・離脱）確認
- 月1回: 依存パッケージ更新と脆弱性チェック

---

## 最速で進める順番（迷ったらこの通り）

1. Supabase 作成
2. Vercel へこのリポジトリを先に公開
3. Render API を追加
4. Cloudflare で独自ドメイン接続
5. 本番チェックして告知

この順番なら、**最短で「まず公開」→「段階的に安定化」**ができます。
