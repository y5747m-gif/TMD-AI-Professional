function limitDocumentText(text, maxLength = 9000) {
  const value = String(text || "");

  if (value.length <= maxLength) {
    return value;
  }

  return (
    value.slice(0, maxLength) +
    "\n\n[تم اختصار محتوى الملف تلقائيًا لتجنب تجاوز حد الطلب]"
  );
}


/*
 * تقليل سجل المحادثة قبل إرساله إلى Groq.
 *
 * السبب:
 * Groq يحسب كل الرسائل السابقة ضمن input tokens.
 * لذلك لا نرسل كل المحادثة القديمة في كل طلب.
 */
function compactConversationMessages(messages, maxCharacters = 12000) {

  const result = [];

  let totalCharacters = 0;

  for (
    let i = messages.length - 1;
    i >= 0;
    i--
  ) {

    const message = messages[i];

    if (!message) {
      continue;
    }

    if (
      message.role !== "user" &&
      message.role !== "assistant"
    ) {
      continue;
    }

    if (
      typeof message.content !== "string" ||
      !message.content.trim()
    ) {
      continue;
    }

    const content =
      message.content.trim();

    /*
     * لا نضيف رسالة إذا كانت ستجعل الطلب ضخمًا.
     */
    if (
      totalCharacters + content.length >
      maxCharacters
    ) {

      /*
       * لو لم نضف أي رسالة بعد،
       * نأخذ جزءًا من آخر رسالة.
       */
      if (result.length === 0) {

        result.unshift({
          role: message.role,
          content:
            content.slice(
              -Math.max(
                500,
                maxCharacters
              )
            )
        });

      }

      break;
    }

    result.unshift({
      role: message.role,
      content
    });

    totalCharacters +=
      content.length;
  }

  return result;
}


/*
 * تجهيز الصورة بطريقة مناسبة للكمبيوتر والهاتف.
 *
 * يتم:
 * - تصغير الصورة
 * - تحويلها إلى JPEG
 * - ضغطها
 *
 * هذا يمنع الصور القادمة من كاميرا الهاتف
 * من جعل POST request ضخمًا.
 */
async function prepareImage(file) {

  if (
    !file ||
    !file.type ||
    !file.type.startsWith("image/")
  ) {

    throw new Error(
      "الملف المحدد ليس صورة مدعومة."
    );

  }


  /*
   * نسمح حتى 20MB للملف الأصلي،
   * لكن الصورة التي سيتم إرسالها إلى Groq
   * ستكون أصغر بكثير.
   */
  if (
    file.size >
    20 * 1024 * 1024
  ) {

    throw new Error(
      "حجم الصورة الأصلية أكبر من 20MB."
    );

  }


  const dataUrl =
    await fileToDataURL(file);


  return await new Promise(
    (resolve, reject) => {

      const img =
        new Image();


      img.onload = () => {

        try {

          const originalWidth =
            img.naturalWidth ||
            img.width;

          const originalHeight =
            img.naturalHeight ||
            img.height;


          /*
           * 1280 مناسب جدًا للتحليل
           * ويقلل حجم الصورة على الهاتف.
           */
          const MAX_SIDE = 1280;


          const scale =
            Math.min(
              1,
              MAX_SIDE /
                Math.max(
                  originalWidth,
                  originalHeight
                )
            );


          const width =
            Math.max(
              1,
              Math.round(
                originalWidth * scale
              )
            );


          const height =
            Math.max(
              1,
              Math.round(
                originalHeight * scale
              )
            );


          const canvas =
            document.createElement(
              "canvas"
            );


          canvas.width =
            width;

          canvas.height =
            height;


          const ctx =
            canvas.getContext(
              "2d",
              {
                alpha: false
              }
            );


          if (!ctx) {

            throw new Error(
              "تعذر تجهيز الصورة على هذا الجهاز."
            );

          }


          ctx.drawImage(
            img,
            0,
            0,
            width,
            height
          );


          /*
           * ضغط جيد مع حجم منخفض.
           */
          let compressed =
            canvas.toDataURL(
              "image/jpeg",
              0.65
            );


          /*
           * حماية إضافية:
           * إذا كانت الصورة ما زالت كبيرة،
           * نقلل الجودة تدريجيًا.
           */
          const MAX_DATA_URL =
            3 * 1024 * 1024;


          if (
            compressed.length >
            MAX_DATA_URL
          ) {

            compressed =
              canvas.toDataURL(
                "image/jpeg",
                0.50
              );

          }


          if (
            compressed.length >
            MAX_DATA_URL
          ) {

            compressed =
              canvas.toDataURL(
                "image/jpeg",
                0.38
              );

          }


          if (
            !compressed ||
            compressed.length < 100
          ) {

            throw new Error(
              "تعذر ضغط الصورة."
            );

          }


          resolve(
            compressed
          );


        } catch (error) {

          reject(error);

        } finally {

          img.src = "";

        }

      };


      img.onerror = () => {

        reject(
          new Error(
            "الهاتف لم يتمكن من قراءة الصورة."
          )
        );

      };


      img.src =
        dataUrl;

    }
  );

}


/*
 * إنشاء الرسائل التي سيتم إرسالها إلى API.
 *
 * مهم جدًا:
 * لا نرسل كل تاريخ المحادثة.
 */
async function buildOutgoingMessages(userText) {

  /*
   * سجل مختصر فقط.
   */
  const history =
    compactConversationMessages(
      state.messages,
      9000
    );


  /*
   * =========================
   * IMAGE
   * =========================
   */
  if (state.selectedImage) {

    const imageData =
      await prepareImage(
        state.selectedImage
      );


    const content = [];


    content.push({
      type: "text",
      text:
        userText ||
        "حلل هذه الصورة وقدم النتيجة للمستخدم."
    });


    content.push({
      type: "image_url",
      image_url: {
        url: imageData
      }
    });


    /*
     * الصورة تحتاج مساحة أكبر،
     * لذلك نرسل عددًا أقل من الرسائل السابقة.
     */
    const imageHistory =
      compactConversationMessages(
        state.messages,
        4500
      );


    imageHistory.push({
      role: "user",
      content
    });


    return {

      messages:
        imageHistory,

      displayContent:
        userText ||
        "تحليل الصورة",

      imageData,

      fileName: null

    };

  }


  /*
   * =========================
   * DOCUMENT
   * =========================
   */
  if (state.selectedDocument) {

    const documentText =
      await extractDocument(
        state.selectedDocument
      );


    const content =
      limitDocumentText(
        documentText,
        7000
      );


    const prompt =
      (
        userText ||
        "حلل الملف المرفق وقدم أهم المعلومات المفيدة."
      ) +
      "\n\n" +
      `اسم الملف: ${state.selectedDocument.name}` +
      "\n\n" +
      "محتوى الملف:\n" +
      content;


    /*
     * نقلل سجل المحادثة عند الملفات.
     */
    const documentHistory =
      compactConversationMessages(
        state.messages,
        5000
      );


    documentHistory.push({
      role: "user",
      content: prompt
    });


    return {

      messages:
        documentHistory,

      displayContent:
        userText ||
        `تحليل الملف: ${state.selectedDocument.name}`,

      imageData: null,

      fileName:
        state.selectedDocument.name

    };

  }


  /*
   * =========================
   * NORMAL CHAT
   * =========================
   */

  history.push({

    role: "user",

    content:
      userText

  });


  return {

    messages:
      history,

    displayContent:
      userText,

    imageData: null,

    fileName: null

  };

}
