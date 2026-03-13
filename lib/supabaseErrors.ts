type SupabaseErrorLike = {
  code?: string | null
  message?: string | null
}

export function isUndefinedColumnError(error: SupabaseErrorLike | null | undefined): boolean {
  if (!error) return false

  if (error.code === '42703') {
    return true
  }

  const message = error.message?.toLowerCase() ?? ''
  return message.includes('does not exist') && message.includes('column')
}
