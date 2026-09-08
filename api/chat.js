// api/chat.js
// Handler for Gemini Chat API with strict Islamic reference enforcement and professional UI capabilities

const SYSTEM_PROMPT = `
أنت مساعد إسلامي متخصص وأكاديمي متطور (TMD AI Professional).
مهمتك هي الإجابة على الأسئلة الدينية والشرعية بناءً فقط وحصرياً على المراجع والمصادر والأحاديث والفتاوى المتاحة في قاعدة البيانات والقناة المعتمدة.

القواعد الصارمة والإلزامية للرد:
1. الصراحة والوضوح المباشر: قدم إجابة صريحة ومباشرة تماماً في بداية الرد دون مقدمات إنشائية أو بلاغية.
2. الالتزام المطلق بالمراجع: استند حصراً إلى النصوص والمراجع المجنية من البحث الداخلي والقناة.
3. التدقيق وعدم التخمين: إذا لم تجد نصاً صريحاً في المراجع المتاحة، أجب بوضوح: "لم يتم العثور على إجابة صريحة لهذه المسألة ضمن المراجع المتاحة بالقناة/المكتبة." ولا تقم بالتخمين أو الإجابة من خارج المراجع.
4. التوثيق الأكاديمي: اذكر اسم المصدر، الكتاب، أو رقم الحديث/الفتوى بوضوح عند كل استشهاد.
5. الترتيب والاحترافية: صمّم الرد باستخدام التنسيق الأنيق (عناوين، نقاط، اقتباسات) ليعكس طابعاً أكاديمياً فاخراً.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { message, history } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Call search module to retrieve matched references
    const searchModule = await import('./sharia-search.js');
    const searchResults = await searchModule.searchReferences(message, {
      topK: 10,
      minScore: 0.70,
      searchInChannel: true
    });

    const contextText = searchResults.length > 0
      ? searchResults.map((r, i) => `[مرجع ${i+1}]: ${r.title}
المصدر: ${r.source}
النص: ${r.content}`).join('

')
      : "لا توجد مراجع مطابقة في قاعدة البيانات لهذه المسألة.";

    // Construct request payload to AI Model
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing.' });
    }

    const payload = {
      contents: [
        { role: 'user', parts: [{ text: `${SYSTEM_PROMPT}

المراجع المتاحة من البحث:
${contextText}

سؤال المستخدم:
${message}` }] }
      ],
      generationConfig: {
        temperature: parseFloat(process.env.TEMPERATURE || '0.1'),
        maxOutputTokens: parseInt(process.env.MAX_TOKENS || '2000', 10)
      }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "حدث خطأ أثناء معالجة الطلب.";

    return res.status(200).json({
      reply,
      references: searchResults,
      sourcesCount: searchResults.length
    });
  } catch (error) {
    console.error('Error in Chat API:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}
