import { googleLoginConfigured, handlers } from '../../../../lib/auth'

function unavailable() {
 return Response.json({ error: 'Login Google belum dikonfigurasi.' }, {
  status: 503,
  headers: { 'Cache-Control': 'no-store' },
 })
}

export const GET = googleLoginConfigured ? handlers.GET : unavailable
export const POST = googleLoginConfigured ? handlers.POST : unavailable
