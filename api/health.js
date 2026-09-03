module.exports = function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  return res.status(200).json({ ok: true, service: 'T.M.D AI Online', status: 'Healthy' });
};
