import { redirect } from 'next/navigation'

type AdminEventDetailRedirectPageProps = {
  params: Promise<{ id: string }>
}

export default async function AdminEventDetailRedirectPage({
  params,
}: AdminEventDetailRedirectPageProps) {
  const { id } = await params
  redirect(`/events/${id}`)
}
