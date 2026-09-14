"use strict";

const path = require("path");
const {pathToFileURL} = require("url");

(async () => {
    const pdfjs = await import(pathToFileURL(path.resolve(__dirname, "../../demo-server/node_modules/pdfjs-dist/legacy/build/pdf.mjs")));
    const document = await pdfjs.getDocument({url: pathToFileURL(path.resolve(__dirname, "../../Roborally/roborally.pdf")).href}).promise;
    const pattern = new RegExp(process.argv.slice(2).join("|") || ".", "i");
    for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        const text = content.items.map((item) => item.str).join(" ");
        if (pattern.test(text))
            console.log(`PAGE ${number}\n${text}\n`);
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
