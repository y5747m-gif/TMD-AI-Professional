"use strict";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_CLASSIFIER_MODEL || "openai/gpt-oss-20b";

function norm(v) {
  return String(v || "").toLowerCase()
    .replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .replace(/[ًٌٍَُِّْـ]/g,"").replace(/\s+/g," ").trim();
}

const RELIGIOUS = [
 "الله","الاسلام","اسلام","المسلم","الدين","القران","قران","الحديث","السنه","النبي","الرسول",
 "محمد","صحابي","فتوى","فتاوى","حلال","حرام","يجوز","يصح","الصلاه","صلاه","الوضوء","وضوء",
 "الغسل","الصيام","صيام","رمضان","الزكاه","زكاه","الحج","العمره","الصدقه","الدعاء","اذكار",
 "تفسير","فقه","سيره","عقيده","توحيد","شرك","ايمان","كفر","ذنب","معصيه","توبه","مسجد",
 "جمعة","الجمعه","وتر","قيام الليل","الزكاة","الصوم","الصلاة","المصحف","ايه","آيه","سوره",
 "الصحابه","العلماء","الشيخ","الداعيه","السلف","الشرع","شرعي","فتوى","فتاوى"
];

function heuristic(q) {
  const n = norm(q);
  return RELIGIOUS.some(x => n.includes(norm(x)));
}

module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"Method Not Allowed"});
  const query=String(req.body?.query||"").trim().slice(0,2000);
  if(!query) return res.status(400).json({ok:false,isSharia:false});
  if(heuristic(query)) return res.status(200).json({ok:true,isSharia:true,method:"heuristic"});
  const key=process.env.GROQ_API_KEY;
  if(!key) return res.status(200).json({ok:true,isSharia:false,method:"heuristic"});
  try{
    const r=await fetch(GROQ_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":`Bearer ${key}`},
      body:JSON.stringify({
        model:MODEL, temperature:0, max_completion_tokens:20,
        messages:[
          {role:"system",content:"صنف السؤال فقط. أجب بكلمة واحدة: YES إذا كان السؤال متعلقًا بالدين الإسلامي أو القرآن أو الحديث أو الفقه أو العقيدة أو السيرة أو العبادة أو حكم شرعي، وإلا NO."},
          {role:"user",content:query}
        ]
      })
    });
    const d=await r.json().catch(()=>({}));
    const out=String(d?.choices?.[0]?.message?.content||"").trim().toUpperCase();
    return res.status(200).json({ok:true,isSharia:out.includes("YES"),method:"semantic"});
  }catch{
    return res.status(200).json({ok:true,isSharia:heuristic(query),method:"heuristic"});
  }
};
