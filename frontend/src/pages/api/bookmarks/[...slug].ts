import type { NextApiRequest, NextApiResponse } from 'next';
import httpProxy from 'http-proxy';

const proxy = http-proxy.createProxyServer();

export const config = {
    api: {
        bodyParser: false,
    },
};

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    return new Promise<void>((resolve, reject) => {
        req.url = req.url!.replace(/^\/api/, ''); // remove /api prefix
        proxy.web(req, res, {
            target: process.env.BACKEND_URL,
            changeOrigin: true,
            selfHandleResponse: false,
        }, (err) => {
            if (err) {
                console.error('Proxy error:', err);
                res.status(500).json({ error: 'Proxy error' });
                return reject(err);
            }
            resolve();
        });
    });
}
