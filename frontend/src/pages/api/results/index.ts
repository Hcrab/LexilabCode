import type { NextApiRequest, NextApiResponse } from 'next'

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const headers: Record<string, string> = {};
  if (req.headers.authorization) {
    headers['Authorization'] = req.headers.authorization;
  }
  if (req.headers['x-access-token']) {
    headers['x-access-token'] = req.headers['x-access-token'] as string;
  }

  if (req.method === 'POST') {
    headers['Content-Type'] = 'application/json';
    try {
      const r = await fetch(`${BACKEND}/results`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(req.body),
      })
      const data = await r.json()
      res.status(r.status).json(data)
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  } else if (req.method === 'GET') {
    const { username } = req.query
    if (!username || Array.isArray(username)) return res.status(400).end()
    try {
      const r = await fetch(`${BACKEND}/results?username=${encodeURIComponent(username)}`, { headers })
      const data = await r.json()
      res.status(r.status).json(data)
    } catch (e: any) {
      res.status(500).json({ error: e.message })
    }
  } else {
    res.status(405).end()
  }
}