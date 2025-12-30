import type { NextApiRequest, NextApiResponse } from 'next'

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query
  if (req.method !== 'GET' && req.method !== 'DELETE') return res.status(405).end()
  try {
    const headers: Record<string, string> = {};
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    if (req.headers['x-access-token']) {
      headers['x-access-token'] = req.headers['x-access-token'] as string;
    }

    const r = await fetch(`${BACKEND}/quizzes/${id}`, {
      method: req.method,
      headers: headers,
    })
    if (req.method === 'DELETE') {
      return res.status(r.status).end()
    }
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}