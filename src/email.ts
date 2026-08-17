import { auth } from './firebase'

export async function sendFriendInvite(recipientName: string, recipientEmail: string) {
  const endpoint = import.meta.env.VITE_INVITE_API_URL
  if (!endpoint) throw new Error('Email invitations are not configured yet.')
  const user = auth?.currentUser
  if (!user) throw new Error('Sign in before sending an invitation.')

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await user.getIdToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ recipientName, recipientEmail }),
  })
  const result = await response.json() as { error?: string }
  if (!response.ok) throw new Error(result.error || 'The invitation could not be sent.')
}
