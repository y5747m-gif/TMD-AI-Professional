"use strict";

/*
 * يبحث عن إجابة منشورة في إسلام ويب من الخادم.
 * الرابط لا يعاد إلى الواجهة؛ يستخدم المصدر داخليًا فقط.
 *
 * ملاحظة: إسلام ويب لا يوفر API عامًا ثابتًا للبحث في الفتاوى،
 * لذلك نستخدم نتائج البحث المقيّدة بالموقع ثم نقرأ صفحة الفتوى نفسها.
 */

function clean(v) {
  return String(v || "")
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/&nbsp;/gi," ")
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&amp;/gi,"&")
    .replace(/\s+/g," ")
    .trim();
}

function decode(v) {
  return String(v||"")
    .replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16)));
}

function norm(v){
  return String(v||"").toLowerCase()
    .replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .replace(/[ًٌٍَُِّْـ]/g,"").replace(/\s+/g," ").trim();
}

function tokens(q){
  return norm(q).split(/\s+/).filter(x=>x.length>2).slice(0,14);
}

function score(title, snippet, q){
  const t=norm(title), s=norm(snippet);
  let n=0;
  for(const x of tokens(q)){
    if(t.includes(x)) n+=6;
    else if(s.includes(x)) n+=2;
  }
  return n;
}

function extractSearchResults(html,q){
  const out=[];
  const re=/<a[^>]+href=["'](https?:\/\/(?:www\.)?islamweb\.(?:net|org)\/ar\/(?:fatwa|fatawa)\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html)) && out.length<10){
    const url=m[1].replace(/&amp;/g,"&");
    if(!/\/(?:fatwa|fatawa)\//i.test(url)) continue;
    const title=clean(decode(m[2]));
    if(!title || title.length<8) continue;
    const near=clean(decode(html.slice(m.index, m.index+1400)));
    out.push({url,title,snippet:near,score:score(title,near,q)});
  }
  return out.sort((a,b)=>b.score-a.score);
}

async function searchWeb(query){
  const q=encodeURIComponent(`site:islamweb.net/ar/fatwa ${query}`);
  const urls=[
    `https://www.google.com/search?q=${q}&hl=ar&num=10`,
    `https://www.bing.com/search?q=${q}&setlang=ar`
  ];
  for(const url of urls){
    try{
      const r=await fetch(url,{headers:{
        "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
        "Accept-Language":"ar,en;q=0.8"
      }});
      if(!r.ok) continue;
      const html=await r.text();
      const results=extractSearchResults(html,query);
      if(results.length) return results;
    }catch{}
  }
  return [];
}

function extractAnswer(html){
  const text=clean(decode(html));
  // نحاول التقاط الجزء الواقع بعد "الإجابة:" وحتى نهاية الفتوى/المقال.
  const m=text.match(/الإجاب(?:ة|ه)\s*[:：]\s*([\s\S]{80,12000}?)(?:والله أعلم|مصدر الفتوى|إسلام ويب|حقوق النشر|$)/i);
  if(m) return m[1].trim();
  // بعض الصفحات الحديثة تستخدم "الجواب:"
  const m2=text.match(/(?:الجواب|الجواب الشرعي)\s*[:：]\s*([\s\S]{80,12000}?)(?:والله أعلم|إسلام ويب|حقوق النشر|$)/i);
  return m2 ? m2[1].trim() : null;
}

async function fetchFatwa(url){
  try{
    const r=await fetch(url,{headers:{
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
      "Accept-Language":"ar,en;q=0.8"
    }});
    if(!r.ok) return null;
    const html=await r.text();
    const answer=extractAnswer(html);
    return answer ? {answer} : null;
  }catch{return null;}
}

module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"Method Not Allowed"});
  const query=String(req.body?.query||"").replace(/\s+/g," ").trim().slice(0,240);
  if(!query) return res.status(400).json({ok:false,found:false});
  try{
    const results=await searchWeb(query);
    for(const item of results.slice(0,5)){
      const page=await fetchFatwa(item.url);
      if(page?.answer && page.answer.length>=80){
        return res.status(200).json({
          ok:true,found:true,title:item.title,answer:page.answer
        });
      }
    }
    return res.status(200).json({ok:true,found:false});
  }catch(error){
    console.error("islamweb-search error",error);
    return res.status(200).json({ok:true,found:false});
  }
};
