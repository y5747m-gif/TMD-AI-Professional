"use strict";

/**
 * mishkat/test/helpers.js
 * ---------------------------------------------------------------
 * أدوات مشتركة للاختبارات (ليست ملف اختبار — لا تُشغَّل وحدها):
 *   • قراءة ملفات fixtures.
 *   • استبدال global.fetch مؤقتًا لتشغيل الاختبارات بلا شبكة.
 *   • عميل HTTP صغير (node:http) حتى لا يتعارض استبدال fetch معه.
 * ---------------------------------------------------------------
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

const FIXTURES = path.join(__dirname, "fixtures");

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURES, name), "utf8");
}

/**
 * يستبدل global.fetch تلقائيًا.
 * @param {(url:string, options:object) => ({ok?:boolean,status?:number,body?:string,contentType?:string,headers?:object,throw?:string}|Promise)} handler
 * @returns {() => void} دالة إرجاع الحالة الأصلية
 */
function stubFetch(handler) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    const target = typeof url === "string" ? url : String(url && url.url ? url.url : url);
    const result = await handler(target, options);
    if (!result) throw new Error(`لا استجابة مُعدّة للرابط: ${target}`);
    if (result.throw) throw new Error(result.throw);
    const status = result.status == null ? 200 : result.status;
    const body = result.body == null ? "" : String(result.body);
    return {
      ok: result.ok != null ? result.ok : status >= 200 && status < 300,
      status,
      headers: new Map(Object.entries(result.headers || { "content-type": result.contentType || "text/html" })),
      text: async () => body,
      json: async () => JSON.parse(body || "{}")
    };
  };
  return () => {
    globalThis.fetch = original;
  };
}

/** هل الرابط طلبُ قارئ صفحات؟ */
function isReaderUrl(url) {
  return /r\.jina\.ai|reader/i.test(url);
}

/** عميل HTTP بسيط (يتجنّب fetch حتى نستطيع استبداله داخل الاختبارات) */
function request(port, { method = "GET", path: target = "/", body = null, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const payload = body == null ? null : typeof body === "string" ? body : JSON.stringify(body);
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        method,
        path: target,
        headers: {
          ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          resolve({
            status: res.statusCode,
            headers: res.headers,
            text,
            json: () => JSON.parse(text || "{}")
          });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = { fixture, stubFetch, isReaderUrl, request, FIXTURES };
