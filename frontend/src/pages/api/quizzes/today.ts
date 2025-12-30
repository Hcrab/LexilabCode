import type { NextApiRequest, NextApiResponse } from 'next'

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  try {
    const headers: Record<string, string> = {};
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    if (req.headers['x-access-token']) {
      headers['x-access-token'] = req.headers['x-access-token'] as string;
    }

    let r = await fetch(`${BACKEND}/quizzes/today`, { headers })
    if (r.status === 404) {
      r = await fetch(`${BACKEND}/quizzes/latest`, { headers })
    }
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}