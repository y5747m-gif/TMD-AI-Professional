const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  // استخدام مفتاح GROQ أو OPENAI حسب المتاح
  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'حدث خطأ: المفتاح غير موجود في Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'system', content: 'أنت T.M.D AI، مساعد ذكي ومحترف.' }, ...messages]
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ ok: false, error: data?.error?.message || 'خطأ في الاتصال' });

    return res.status(200).json({ ok: true, reply: data.choices[0].message.content });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};
