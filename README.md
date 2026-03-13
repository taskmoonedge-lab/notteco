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

### 2. Render にバックエンドをデプロイ（初心者向け・詳細版）

> このステップは「APIサーバー（裏側の処理）」を公開する作業です。
> まだAPIがない場合は、先に Vercel だけ公開して後から実施してOKです。

#### まず用語だけ先に理解（3分）

- **バックエンド / API**: アプリの裏側で、DB操作や認証処理を行うサーバー
- **デプロイ**: 作ったアプリをインターネット上で動かせる状態にすること
- **Build Command**: 公開前に実行する準備コマンド（依存インストールやビルド）
- **Start Command**: サーバーを起動するコマンド
- **環境変数**: パスワードや接続先URLなど、コードに直書きしない設定値
- **ヘルスチェック**: サーバーが正常稼働か確認するためのURL（例: `/health`）

#### 2-1. 事前準備（Renderに入る前）

1. APIリポジトリがGitHubにあることを確認
2. ローカルでAPIが起動することを確認
   - 例: `npm run dev` や `npm start`
3. 本番で必要な環境変数をメモ
   - `DATABASE_URL`（Supabase 本番DB）
   - `JWT_SECRET`
   - その他 API キー

#### 2-2. Renderでサービスを作成

1. Render にログイン
2. ダッシュボード右上の **New +** を押す
3. **Web Service** を選択
4. GitHub連携を許可し、対象リポジトリを選ぶ
5. 基本設定を入力
   - **Name**: 例 `notteco-api`
   - **Region**: ユーザーに近い地域（迷ったらシンガポール or 東京に近いリージョン）
   - **Branch**: `main`
   - **Root Directory**: APIがサブフォルダなら指定（例 `api`）

#### 2-3. Build / Start を設定（ここが最重要）

Node.js APIの例:

- **Build Command**: `npm ci && npm run build`
- **Start Command**: `npm run start`

ビルド不要な構成なら:

- **Build Command**: `npm ci`
- **Start Command**: `npm run start`

> ここが間違うと「デプロイ成功」でも起動失敗します。ローカルで使っている起動コマンドと合わせてください。

#### 2-4. 環境変数を設定

Render の **Environment** タブで追加:

- `DATABASE_URL` = （必要な場合のみ）Supabase Postgres の接続文字列
- `JWT_SECRET` = （API実装がある場合）長いランダム文字列
- 外部APIキー（使う場合）

注意:

- `NEXT_PUBLIC_` で始まる変数はフロント向けです。APIサーバー側の秘密情報には使わない。
- 接続文字列の貼り付け時に前後スペースが入らないよう注意。

#### 2-4.1 変数の正しさチェック（このリポジトリ向け）

スクショのような設定画面で迷ったときは、次の基準で確認してください。

- `GOOGLE_MAPS_API_KEY`: **任意（使うなら必要）**
  - 住所候補検索/ルート最適化の Google API を使う場合のみ設定。
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: **必須**
  - フロントが Supabase に接続する公開キー。
- `NEXT_PUBLIC_SUPABASE_URL`: **必須**
  - `https://<project-ref>.supabase.co` 形式の URL。
- `DATABASE_URL`: **このリポジトリ単体では通常不要**
  - 使うのはサーバー側で Postgres へ直接接続する実装を追加した場合のみ。
- `PORT`: **自分で固定しない**
  - Render などの実行基盤が自動で注入するため、手動設定は基本不要。

特に注意:

- `DATABASE_URL` に `https://...supabase.co` を入れるのは誤りです。
  `DATABASE_URL` は入れる場合でも `postgresql://...` 形式の接続文字列を使います。
- Vercel に入れるのは基本的に `NEXT_PUBLIC_*` と公開してよい値のみ。
  秘密鍵や管理者キーは入れないでください。

#### 2-4.2 `NEXT_PUBLIC_*` は安全？（Supabaseで不正アクセスされないための前提）

結論: `NEXT_PUBLIC_SUPABASE_URL` と `NEXT_PUBLIC_SUPABASE_ANON_KEY` を公開すること自体は、
**Supabaseの標準運用では想定内**です。

ただし安全性は「キーを隠すこと」ではなく、次の3点で担保します。

1. **RLS（Row Level Security）を必ずON**
   - テーブルごとに「誰がどの行を読める/書けるか」をSQLポリシーで制御する。
2. **service_role key をクライアントへ絶対に出さない**
   - `NEXT_PUBLIC_*` に入れてよいのは anon key だけ。
3. **危険なテーブル権限を公開しない**
   - anon/authenticated ロールの `INSERT/UPDATE/DELETE` を必要最小限にする。

実務チェック（最低限）:

- Supabase Dashboard → Table Editor で対象テーブルの **RLS Enabled** を確認
- Policies で `anon` / `authenticated` の許可条件を確認
- サーバー専用キー（`service_role`）は Vercel/Render の「公開されない環境変数」にのみ設定

> 重要: `NEXT_PUBLIC_` は「ブラウザから見える前提」の接頭辞です。
> なので `NEXT_PUBLIC_` に秘密情報を入れないことが鉄則です。

#### 2-5. 初回デプロイ実行

1. **Create Web Service** を押す
2. デプロイログを確認
   - `Build successful` が出る
   - `Listening on port ...` など起動ログが出る
3. 失敗時はログの最後のエラー行を確認（9割はコマンド or 環境変数ミス）

#### 2-6. 動作確認（必須）

1. Renderの公開URLを開く（例: `https://xxx.onrender.com`）
2. `https://xxx.onrender.com/health` を叩く
3. `200 OK` や `{"status":"ok"}` が返ることを確認

#### 2-7. よくあるつまずきポイント

- **起動しない**: Start Command が違う
- **DB接続エラー**: `DATABASE_URL` が誤り or Supabase側の接続制限
- **CORSエラー**: API側で `https://app.example.com` を許可していない
- **無料プランで遅い**: 初回アクセス時にスリープ復帰が発生する場合あり

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
