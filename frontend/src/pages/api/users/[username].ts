import type { NextApiRequest, NextApiResponse } from 'next'

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { username } = req.query
  if (!username || Array.isArray(username)) return res.status(400).end()
  if (!['GET','PUT','DELETE'].includes(req.method || '')) return res.status(405).end()
  try {
    const r = await fetch(`${BACKEND}/users/${username}`, {
      method: req.method,
      headers: req.method === 'GET' || req.method === 'DELETE' ? undefined : { 'Content-Type': 'application/json' },
      body: req.method === 'GET' || req.method === 'DELETE' ? undefined : JSON.stringify(req.body),
    })
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
