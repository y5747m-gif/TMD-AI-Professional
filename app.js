async function extractDocument(file) {

  const name =
    file.name.toLowerCase();


  /*
   * الملفات النصية
   */

  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".js") ||
    name.endsWith(".json") ||
    name.endsWith(".html") ||
    name.endsWith(".css") ||
    name.endsWith(".py") ||
    name.endsWith(".csv")
  ) {

    return await file.text();

  }


  /*
   * PDF
   */

  if (name.endsWith(".pdf")) {

    if (
      !window.pdfjsLib &&
      window.pdfjsReady
    ) {

      await window.pdfjsReady;

    }


    if (!window.pdfjsLib) {

      throw new Error(
        "مكتبة PDF غير متاحة. أعد تحميل الصفحة."
      );

    }


    const buffer =
      await file.arrayBuffer();


    const pdf =
      await window.pdfjsLib
        .getDocument({
          data: buffer
        })
        .promise;


    const pages = [];


    for (
      let pageNumber = 1;
      pageNumber <= pdf.numPages;
      pageNumber++
    ) {

      const page =
        await pdf.getPage(
          pageNumber
        );


      const content =
        await page.getTextContent();


      pages.push(

        content.items
          .map(item => item.str)
          .join(" ")

      );

    }


    return pages
      .map(
        (text, index) =>
          `--- الصفحة ${index + 1} ---\n${text}`
      )
      .join("\n\n");

  }


  /*
   * DOCX
   */

  if (name.endsWith(".docx")) {

    if (!window.mammoth) {

      throw new Error(
        "مكتبة DOCX غير متاحة. أعد تحميل الصفحة."
      );

    }


    const buffer =
      await file.arrayBuffer();


    const result =
      await window.mammoth
        .extractRawText({
          arrayBuffer:
            buffer
        });


    return result.value;

  }


  throw new Error(
    "نوع الملف غير مدعوم."
  );

}
