"use strict";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_SOURCE_MODEL || "openai/gpt-oss-20b";
const BASES = [
  "https://www.islamweb.net/ar/fatwa/",
  "https://islamweb.net/ar/fatwa/",
  "https://services.islamweb.net/ar/fatwa/index.php"
];

function decode(s) {
  return String(s || "")
    .replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'").replace(/&lt;/gi,"<").replace(/&gt;/gi,">");
}
function text(s) {
  return decode(String(s || "").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/\s+/g," ")).trim();
}
function norm(s) {
  return text(s).toLowerCase().replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه").replace(/[ًٌٍَُِّْـ]/g,"").trim();
}
function cleanQuery(q) {
  return String(q || "").replace(/[\r\n]+/g," ").replace(/\s+/g," ").trim().slice(0,500);
}
function searchUrls(q) {
  const enc = encodeURIComponent(q);
  return [
    `https://www.islamweb.net/ar/fatwa/?keyword=${enc}`,
    `https://www.islamweb.net/ar/fatwa/index.php?keyword=${enc}`,
    `https://www.islamweb.net/ar/fatwa/?searchtext=${enc}`,
    `https://services.islamweb.net/ar/fatwa/index.php?keyword=${enc}`,
    `https://services.islamweb.net/ar/fatwa/index.php?searchtext=${enc}`
  ];
}
async function fetchText(url) {
  const r = await fetch(url, {headers:{"User-Agent":"Mozilla/5.0 (compatible; TMD-AI/1.0)","Accept-Language":"ar,en;q=0.8"}});
  if (!r.ok) return null;
  return await r.text();
}
function extractCandidates(html) {
  const out=[]; const seen=new Set();
  const re=/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))){
    const href=decode(m[1]);
    const label=text(m[2]);
    if(!label || label.length<12) continue;
    if(!/(?:\/ar\/fatwa\/(?:\d+|print\.php\?id=\d+)|\/ar\/fatwa\/print\.php\?id=\d+)/i.test(href)) continue;
    const absolute=new URL(href,"https://www.islamweb.net").toString();
    if(seen.has(absolute)) continue; seen.add(absolute);
    out.push({url:absolute,title:label});
    if(out.length>=12) break;
  }
  return out;
}
function extractAnswer(html) {
  const body=text(html);
  const marker=norm(body).indexOf("الاجابه");
  if(marker>=0){
    const raw=body.slice(marker, marker+12000);
    return raw.replace(/^الإجابة\s*:?\s*/i,"").trim();
  }
  return body.slice(0,12000);
}
async function groundedAnswer(question, title, sourceText) {
  const key=process.env.GROQ_API_KEY;
  if(!key) return null;
  const prompt=`أجب عن سؤال المستخدم اعتمادًا حصريًا على نص الفتوى المأخوذ من المرجع الموثوق أدناه. لا تستخدم معلومات خارج النص. لا تخترع ولا تستنتج حكمًا غير مذكور. إذا لم يكن النص يجيب عن السؤال بوضوح، أعد كلمة NO_ANSWER فقط. أعد جوابًا عربيًا موجزًا ومنظمًا.

سؤال المستخدم: ${question}
عنوان الفتوى: ${title}
نص المصدر:
${sourceText.slice(0,22000)}`;
  const r=await fetch(GROQ_URL,{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},body:JSON.stringify({model:MODEL,temperature:0.1,messages:[{role:"system",content:"أنت محرر إجابات مقيدة بالمصدر فقط."},{role:"user",content:prompt}],max_completion_tokens:700})});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) return null;
  const a=d?.choices?.[0]?.message?.content?.trim();
  if(!a || a.includes("NO_ANSWER")) return null;
  return a;
}

module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"Method Not Allowed"});
  const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):req.body||{};
  const query=cleanQuery(body.query);
  if(!query) return res.status(400).json({ok:false,error:"query مطلوب"});

  try{
    const pages=[];
    for(const u of searchUrls(query)){
      try{ const html=await fetchText(u); if(html) pages.push(...extractCandidates(html)); }catch(e){}
      if(pages.length>=12) break;
    }
    const unique=[...new Map(pages.map(x=>[x.url,x])).values()];
    if(!unique.length) return res.status(200).json({ok:true,found:false});

    const nq=norm(query);
    unique.sort((a,b)=>{
      const score=x=>{const t=norm(x.title); let s=0; for(const w of nq.split(/\s+/).filter(w=>w.length>2)){if(t.includes(w))s+=4;} return s;};
      return score(b)-score(a);
    });

    for(const candidate of unique.slice(0,5)){
      try{
        const html=await fetchText(candidate.url); if(!html) continue;
        const source=extractAnswer(html); if(!source || source.length<80) continue;
        const answer=await groundedAnswer(query,candidate.title,source);
        if(answer) return res.status(200).json({ok:true,found:true,title:candidate.title,answer});
      }catch(e){ console.error("Islamweb candidate error",e); }
    }
    return res.status(200).json({ok:true,found:false});
  }catch(e){
    console.error("islamweb-search:",e);
    return res.status(200).json({ok:true,found:false});
  }
};
