import type { NextApiRequest, NextApiResponse } from 'next'

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  try {
    const r = await fetch(`${BACKEND}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    })
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}
