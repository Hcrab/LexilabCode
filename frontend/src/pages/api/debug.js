// pages/api/debug.js
export default function handler(req, res) {
  console.log('👉 Next.js received:', req.url, req.query);
  res.status(200).json({ url: req.url, query: req.query });
}
