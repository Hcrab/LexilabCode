import type { NextApiRequest, NextApiResponse } from 'next'

const BACKEND = process.env.BACKEND_URL || 'http://127.0.0.1:5000'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end()
  try {
    const headers: Record<string, string> = {};
    if (req.method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }
    if (req.headers['x-access-token']) {
      headers['x-access-token'] = req.headers['x-access-token'] as string;
    }

    const r = await fetch(`${BACKEND}/quizzes`, {
      method: req.method,
      headers: headers,
      body: req.method === 'GET' ? undefined : JSON.stringify(req.body),
    })
    const data = await r.json()
    res.status(r.status).json(data)
  } catch (e: any) {
    res.status(500).json({ error: e.message })
  }
}