"use strict";

const CHANNEL_ID = "UCv0g_v1C6JcZALvrkDu98AQ";
const SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";

function normalizeArabic(value) {
  return String(value || "").toLowerCase()
    .replace(/[إأآ]/g,"ا").replace(/ى/g,"ي").replace(/ة/g,"ه")
    .replace(/[ًٌٍَُِّْـ]/g,"").replace(/[^\p{L}\p{N}\s]/gu," ")
    .replace(/\s+/g," ").trim();
}
function cleanQuery(value){return String(value||"").replace(/[\r\n]+/g," ").replace(/\s+/g," ").trim().slice(0,180)}
function variants(q){
  const n=normalizeArabic(q);
  const stop=new Set(["ما","ماذا","هل","كيف","لماذا","متى","اين","أين","من","هو","هي","لي","لي؟","في","عن","على","الى","إلى","هذا","هذه","ذلك","تلك","يمكن","اريد","أريد","ممكن","لو","اذا","إذا","انا","أنا","عندي","عندي؟"]);
  const words=n.split(/\s+/).filter(w=>w.length>2&&!stop.has(w));
  const core=words.slice(0,10).join(" ");
  return [...new Set([cleanQuery(q),core,`سؤال شرعي ${core}`,`حكم ${core}`].filter(Boolean))].slice(0,4);
}
function scoreVideo(item, query){
  const qt=normalizeArabic(query).split(/\s+/).filter(t=>t.length>2);
  const title=normalizeArabic(item.snippet?.title); const desc=normalizeArabic(item.snippet?.description);
  let s=0; for(const t of qt){if(title.includes(t))s+=8; else if(desc.includes(t))s+=2;} return s;
}
async function search(apiKey,q){
  const p=new URLSearchParams({part:"snippet",q,type:"video",channelId:CHANNEL_ID,maxResults:"25",order:"relevance",relevanceLanguage:"ar",key:apiKey});
  const r=await fetch(`${SEARCH_URL}?${p}`); const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d?.error?.message||"فشل البحث في YouTube");
  return (Array.isArray(d.items)?d.items:[]).filter(x=>x?.id?.videoId&&x?.snippet?.channelId===CHANNEL_ID).map(x=>({
    videoId:x.id.videoId,title:x.snippet.title||"",description:x.snippet.description||"",channelId:x.snippet.channelId,channelTitle:x.snippet.channelTitle||"",publishedAt:x.snippet.publishedAt||"",
    thumbnail:x.snippet.thumbnails?.maxres?.url||x.snippet.thumbnails?.high?.url||x.snippet.thumbnails?.medium?.url||x.snippet.thumbnails?.default?.url||""
  }));
}
module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"Method Not Allowed"});
  const key=process.env.YOUTUBE_API_KEY; const body=typeof req.body==="string"?JSON.parse(req.body||"{}"):req.body||{}; const query=cleanQuery(body.query);
  if(!key) return res.status(500).json({ok:false,error:"YOUTUBE_API_KEY غير مضبوط في Vercel."});
  if(!query) return res.status(400).json({ok:false,error:"query مطلوب"});
  try{
    const all=new Map();
    for(const q of variants(query)) for(const item of await search(key,q)) all.set(item.videoId,item);
    const items=[...all.values()].sort((a,b)=>scoreVideo(b,query)-scoreVideo(a,query));
    const best=items[0];
    if(!best) return res.status(200).json({ok:true,found:false,channelId:CHANNEL_ID,query,video:null});
    return res.status(200).json({ok:true,found:true,channelId:CHANNEL_ID,query,video:{...best,url:`https://www.youtube.com/watch?v=${encodeURIComponent(best.videoId)}`}});
  }catch(e){console.error("sharia-search:",e);return res.status(200).json({ok:true,found:false,channelId:CHANNEL_ID,query,video:null});}
};
