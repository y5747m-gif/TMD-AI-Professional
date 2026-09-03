const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'استخدم POST لهذا المسار.' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ ok: false, error: 'GROQ_API_KEY غير متوفر في متغيرات البيئة Vercel.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const messages = Array.isArray(body.messages) ? body.messages : [];
    
    // الأنماط والنماذج المدعومة رسمياً في Groq API
    const allowedModels = new Set([
      'llama-3.3-70b-versatile',
      'llama-3.1-8b-instant',
      'mixtral-8x7b-32768',
      'gemma2-9b-it',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b'
    ]);

    const model = allowedModels.has(body.model) ? body.model : (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');

    const cleaned = messages
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-24)
      .map(m => ({ role: m.role, content: m.content.trim().slice(0, 16000) }))
      .filter(m => m.content);

    if (!cleaned.length) return res.status(400).json({ ok: false, error: 'يرجى كتابة رسالة أولاً.' });

    const payload = {
      model,
      messages: [
        {
          role: 'system',
          content: 'أنت T.M.D AI، مساعد ذكي احترافي ومتطور باللغة العربية. أجب بوضوح ودقة عالية. عندما تشارك أكواداً برمجية استخدم Markdown code blocks مبيناً نوع اللغة.'
        },
        ...cleaned
      ],
      max_tokens: 2200,
      temperature: 0.7
    };

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(response.status || 502).json({
        ok: false,
        error: data?.error?.message || `Groq API Error: ${response.statusText}`
      });
    }

    const reply = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ ok: true, reply, model });

  } catch (err) {
    return res.status(500).json({ ok: false, error: 'حدث خطأ في الخادم: ' + err.message });
  }
};
