"use strict";

const CHANNEL_ID = "UCv0g_v1C6JcZALvrkDu98AQ";
const API = "https://www.googleapis.com/youtube/v3/search";

function normalizeArabic(value) {
  return String(value || "").toLowerCase()
    .replace(/[إأآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه")
    .replace(/[ًٌٍَُِّْـ]/g, "").replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ").trim();
}
function clean(value) { return String(value || "").replace(/[\r\n]+/g," ").replace(/\s+/g," ").trim().slice(0,180); }
function score(item, query) {
  const tokens = normalizeArabic(query).split(/\s+/).filter(x=>x.length>2);
  const title = normalizeArabic(item.snippet?.title);
  const desc = normalizeArabic(item.snippet?.description);
  let n=0;
  for (const t of tokens) { if(title.includes(t)) n+=7; else if(desc.includes(t)) n+=2; }
  return n;
}
async function search(apiKey, query, order="relevance") {
  const params = new URLSearchParams({part:"snippet", q:query, type:"video", channelId:CHANNEL_ID, maxResults:"25", order, relevanceLanguage:"ar", key:apiKey});
  const r = await fetch(`${API}?${params}`);
  const d = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(d?.error?.message || "YouTube API error");
  return (Array.isArray(d.items)?d.items:[])
    .filter(x=>x?.id?.videoId && x?.snippet?.channelId===CHANNEL_ID)
    .map(x=>({videoId:x.id.videoId,title:x.snippet.title||"",description:x.snippet.description||"",channelId:x.snippet.channelId,channelTitle:x.snippet.channelTitle||"",publishedAt:x.snippet.publishedAt||"",thumbnail:x.snippet.thumbnails?.maxres?.url||x.snippet.thumbnails?.high?.url||x.snippet.thumbnails?.medium?.url||x.snippet.thumbnails?.default?.url||""}));
}

module.exports = async function handler(req,res){
  res.setHeader("Cache-Control","no-store"); res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method!=="POST") return res.status(405).json({ok:false,error:"Method not allowed"});
  const key=process.env.YOUTUBE_API_KEY;
  if(!key) return res.status(500).json({ok:false,error:"YOUTUBE_API_KEY غير مضبوط في Vercel."});
  const body=typeof req.body==='string'?JSON.parse(req.body||"{}"):req.body||{};
  const q=clean(body.query);
  const searchQuery=clean(body.searchQuery)||q;
  if(!q) return res.status(400).json({ok:false,error:"query مطلوب"});
  try{
    let pool=[];
    const queries=[searchQuery,q,normalizeArabic(searchQuery).split(/\s+/).filter(x=>x.length>2).slice(0,7).join(" ")].filter(Boolean);
    for(const term of [...new Set(queries)]){
      const items=await search(key,term,"relevance");
      pool.push(...items.map(x=>({...x,_score:score(x,searchQuery)+score(x,q)})));
      if(pool.length>60) break;
    }
    let unique=pool.filter((x,i,a)=>a.findIndex(y=>y.videoId===x.videoId)===i).sort((a,b)=>b._score-a._score);
    // إذا لم توجد مطابقة نصية، نأخذ أحدث فيديو من نفس القناة بدل أن نترك السؤال بلا فيديو.
    if(!unique.length){
      unique=await search(key,"دين","date");
    }
    if(!unique.length) return res.status(200).json({ok:true,found:false,channelId:CHANNEL_ID});
    const best=unique[0];
    return res.status(200).json({ok:true,found:true,channelId:CHANNEL_ID,query:q,searchQuery,video:{...best,url:`https://www.youtube.com/watch?v=${encodeURIComponent(best.videoId)}`}});
  }catch(e){
    console.error("sharia-search",e);
    return res.status(200).json({ok:true,found:false,channelId:CHANNEL_ID});
  }
};
