type SupabaseErrorLike = {
  code?: string | null
  message?: string | null
  details?: string | null
  hint?: string | null
}

export function isUndefinedColumnError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false

  if (error.code === '42703') {
    return true
  }

  const message = error.message?.toLowerCase() ?? ''
  return message.includes('does not exist') && message.includes('column')
}

export function mapCreateEventErrorToNotice(
  error: SupabaseErrorLike | null | undefined
): string {
  if (!error) {
    return 'イベント作成に失敗しました。時間をおいて再度お試しください'
  }

  if (error.code === '42501') {
    return 'イベント作成権限がありません。SupabaseのRLSポリシーを確認してください'
  }

  if (error.code === '23502') {
    return '必須項目が不足しています。地点を候補から選択して再度お試しください'
  }

  if (error.code === '22P02') {
    return '入力形式が不正です。日時・地点を確認して再度お試しください'
  }

  if (error.code === '23505') {
    return '同じ内容のイベントが短時間に重複登録されました。しばらく待って再試行してください'
  }

  const message = (error.message ?? '').toLowerCase()
  const details = (error.details ?? '').toLowerCase()

  if (
    message.includes('row-level security') ||
    details.includes('row-level security')
  ) {
    return 'イベント作成権限がありません。SupabaseのRLSポリシーを確認してください'
  }

  if (
    message.includes('null value') ||
    details.includes('null value') ||
    message.includes('not-null')
  ) {
    return '必須項目が不足しています。地点を候補から選択して再度お試しください'
  }

  return 'イベント作成に失敗しました。時間をおいて再度お試しください'
}
