import { createRemoteJWKSet, jwtVerify } from 'jose'

interface Env {
  RESEND_API_KEY: string
  RESEND_FROM_EMAIL: string
  FAIRSHARE_APP_URL: string
  FIREBASE_PROJECT_ID: string
  ALLOWED_ORIGINS: string
  RATE_LIMITS: KVNamespace
}

type InviteRequest = { recipientName?: unknown; recipientEmail?: unknown }

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FIREBASE_KEYS = createRemoteJWKSet(new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'))

function json(body: unknown, status: number, origin: string) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      vary: 'Origin',
    },
  })
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] || character)
}

async function authenticate(request: Request, env: Env) {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!token) throw new Error('unauthenticated')
  const { payload } = await jwtVerify(token, FIREBASE_KEYS, {
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
    audience: env.FIREBASE_PROJECT_ID,
  })
  if (!payload.sub) throw new Error('unauthenticated')
  return payload
}

async function enforceRateLimit(uid: string, env: Env) {
  const hour = new Date().toISOString().slice(0, 13)
  const key = `invite:${uid}:${hour}`
  const count = Number(await env.RATE_LIMITS.get(key)) || 0
  if (count >= 5) throw new Error('rate-limit')
  await env.RATE_LIMITS.put(key, String(count + 1), { expirationTtl: 3700 })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('origin') || ''
    const allowedOrigins = env.ALLOWED_ORIGINS.split(',').map(value => value.trim())
    if (!allowedOrigins.includes(origin)) return json({ error: 'Origin not allowed.' }, 403, 'null')

    if (request.method === 'OPTIONS') return new Response(null, {
      status: 204,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'POST,OPTIONS',
        'access-control-allow-headers': 'authorization,content-type',
        'access-control-max-age': '86400',
        vary: 'Origin',
      },
    })
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, origin)

    try {
      const user = await authenticate(request, env)
      const body = await request.json<InviteRequest>()
      const recipientName = typeof body.recipientName === 'string' ? body.recipientName.trim() : ''
      const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim().toLowerCase() : ''
      const userEmail = typeof user.email === 'string' ? user.email : ''
      const senderName = typeof user.name === 'string' ? user.name : userEmail || 'A friend'

      if (!recipientName || recipientName.length > 80) return json({ error: 'Enter a valid recipient name.' }, 400, origin)
      if (!EMAIL_PATTERN.test(recipientEmail) || recipientEmail.length > 254) return json({ error: 'Enter a valid recipient email.' }, 400, origin)
      if (recipientEmail === userEmail.toLowerCase()) return json({ error: 'Invite a friend rather than yourself.' }, 400, origin)

      await enforceRateLimit(user.sub!, env)

      const safeRecipient = escapeHtml(recipientName)
      const safeSender = escapeHtml(senderName)
      const resendResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
          'idempotency-key': `invite-${user.sub}-${recipientEmail}-${new Date().toISOString().slice(0, 13)}`,
        },
        body: JSON.stringify({
          from: env.RESEND_FROM_EMAIL,
          to: [recipientEmail],
          subject: `${senderName} invited you to Fairshare`,
          html: `<div style="background:#f6f5ef;padding:40px 18px;font-family:Arial,sans-serif;color:#27342f"><div style="max-width:560px;margin:auto;background:#fff;border-radius:18px;padding:36px"><div style="font-size:22px;font-weight:700;color:#177a64;margin-bottom:28px">fairshare</div><h1 style="font-size:28px;margin:0 0 14px">Good friends. Clear tabs.</h1><p style="font-size:16px;line-height:1.6;color:#66736e">Hi ${safeRecipient},</p><p style="font-size:16px;line-height:1.6;color:#66736e"><strong>${safeSender}</strong> added you on Fairshare to split restaurant bills, rides, and shared expenses.</p><a href="${escapeHtml(env.FAIRSHARE_APP_URL)}" style="display:inline-block;margin-top:16px;background:#177a64;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Open Fairshare</a><p style="font-size:12px;color:#9aa39f;margin-top:30px">If you weren’t expecting this invitation, you can safely ignore it.</p></div></div>`,
          text: `Hi ${recipientName},\n\n${senderName} invited you to Fairshare to split restaurant bills, rides, and shared expenses.\n\nOpen Fairshare: ${env.FAIRSHARE_APP_URL}`,
        }),
      })

      const result = await resendResponse.json<{ id?: string; message?: string }>()
      if (!resendResponse.ok) {
        console.error('Resend rejected invitation', { status: resendResponse.status, message: result.message, uid: user.sub })
        return json({ error: 'The invitation could not be sent. Check the sender domain.' }, 502, origin)
      }
      return json({ sent: true, emailId: result.id }, 200, origin)
    } catch (error) {
      if (error instanceof Error && error.message === 'rate-limit') return json({ error: 'You can send up to five invitations per hour.' }, 429, origin)
      console.error('Invite request failed', error instanceof Error ? error.message : 'unknown')
      return json({ error: 'Authentication failed or the request was invalid.' }, 401, origin)
    }
  },
} satisfies ExportedHandler<Env>
