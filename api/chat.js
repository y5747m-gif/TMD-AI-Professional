const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID || "UCv0g_v1C6JcZALvrkDu98AQ";
const CHANNEL_URL = `https://www.youtube.com/channel/${CHANNEL_ID}`;

function cleanMessages(messages) {
  return messages.filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-12).map(m => ({ role: m.role, content: m.content.trim().slice(0, 10000) })).filter(m => m.content);
}

function htmlDecode(s = "") {
  return s.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
}

function stripHtml(s = "") {
  return htmlDecode(s.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/<style[\s\S]*?<\/style>/gi,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());
}

async function searchIslamweb(query) {
  const q = encodeURIComponent(query.slice(0, 220));
  const url = `${process.env.ISLAMWEB_BASE_URL || 'https://islamweb.net/ar/fatwa/'}?searchType=4&searchKey=${q}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'TMD-Religious-AI/1.0' }, signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw new Error(`Islamweb HTTP ${r.status}`);
    const html = await r.text();
    const results = [];
    const re = /<a[^>]+href=["']([^"']*\/ar\/fatwa\/[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) && results.length < 8) {
      const title = stripHtml(m[2]);
      if (!title || title.length < 8 || /المزيد|فتاوى|الفتوى/.test(title)) continue;
      const href = new URL(m[1], 'https://islamweb.net').href;
      if (!results.some(x => x.url === href)) results.push({ title: title.slice(0,180), url: href, source: 'إسلام ويب' });
    }
    return { query, results: results.slice(0,5), searchUrl: url };
  } catch (e) {
    return { query, results: [], searchUrl: url, error: e.message };
  }
}

async function searchChannel(query) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return { results: [], error: 'لم يتم إعداد YOUTUBE_API_KEY', channelUrl: CHANNEL_URL };
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part','snippet'); url.searchParams.set('type','video'); url.searchParams.set('channelId',CHANNEL_ID);
  url.searchParams.set('q',query.slice(0,120)); url.searchParams.set('maxResults','6'); url.searchParams.set('relevanceLanguage','ar');
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || `YouTube HTTP ${r.status}`);
    return { results:(data.items||[]).filter(x => x?.id?.videoId).map(x => ({
      title:x.snippet.title, description:x.snippet.description, publishedAt:x.snippet.publishedAt,
      url:`https://www.youtube.com/watch?v=${x.id.videoId}`, thumbnail:x.snippet.thumbnails?.medium?.url || x.snippet.thumbnails?.default?.url,
      channelTitle:x.snippet.channelTitle, channelId:x.snippet.channelId
    })), channelUrl:CHANNEL_URL };
  } catch (e) { return { results:[], error:e.message, channelUrl:CHANNEL_URL }; }
}

module.exports = async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST') return res.status(405).json({ok:false,error:'استخدم POST.'});
  const apiKey=process.env.GROQ_API_KEY;
  if(!apiKey) return res.status(500).json({ok:false,error:'GROQ_API_KEY غير موجود في Vercel.'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const messages=cleanMessages(Array.isArray(body.messages)?body.messages:[]);
    if(!messages.length) return res.status(400).json({ok:false,error:'اكتب سؤالك الديني أولًا.'});
    const question=messages.filter(m=>m.role==='user').at(-1)?.content || '';
    const [islamweb,youtube]=await Promise.all([searchIslamweb(question),searchChannel(question)]);
    const evidence = [
      ...islamweb.results.map(x=>`- ${x.title} | ${x.url}`),
      ...youtube.results.map(x=>`- فيديو: ${x.title} | ${x.url}`)
    ].join('\n') || 'لا توجد نتائج مصدرية متاحة الآن.';
    const system=`أنت T.M.D AI، مساعد إسلامي متخصص في الإجابة عن الأسئلة الدينية فقط.\n\nقواعد صارمة:\n1) لا تجب عن الأسئلة غير الدينية؛ قل باختصار إنك مخصص للأسئلة الشرعية.\n2) لا تخترع آية أو حديثًا أو فتوى أو اسم عالم أو رقم فتوى.\n3) استخدم نتائج المصادر التي يرسلها النظام كمرجع أساسي، واذكر المصدر بوضوح.\n4) إذا لم توجد مادة كافية في المصادر، صرّح بذلك ولا تملأ الفراغ بتخمين.\n5) إذا كانت المسألة فتوى شخصية أو شديدة الحساسية، قدم المعلومات المتاحة مع التنبيه إلى مراجعة مفتٍ مؤهل.\n6) عند وجود خلاف معتبر، اذكره بوضوح ولا توهم أن قولًا واحدًا محل إجماع.\n7) أجب بالعربية وبأسلوب هادئ ومنظم.\n8) لا تقل إنك مفتي أو جهة إفتاء رسمية.\n\nالمصادر المسترجعة للسؤال الحالي:\n${evidence}`;
    const model=process.env.GROQ_MODEL||'llama-3.3-70b-versatile';
    const r=await fetch(GROQ_URL,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'system',content:system},...messages],temperature:0.15,max_tokens:1800})});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) return res.status(502).json({ok:false,error:data?.error?.message||`Groq HTTP ${r.status}`});
    const text=data?.choices?.[0]?.message?.content?.trim()||'';
    if(!text) return res.status(502).json({ok:false,error:'لم تُرجع خدمة الذكاء الاصطناعي نصًا.'});
    return res.status(200).json({ok:true,message:text,model,religious:true,sources:{islamweb:islamweb.results,videos:youtube.results,channelUrl:CHANNEL_URL,islamwebSearchUrl:islamweb.searchUrl},sourceErrors:{islamweb:islamweb.error||null,youtube:youtube.error||null}});
  }catch(e){console.error(e);return res.status(500).json({ok:false,error:'حدث خطأ داخلي أثناء معالجة السؤال.'});}
};
