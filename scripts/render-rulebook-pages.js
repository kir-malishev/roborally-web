"use strict";

const fs = require("fs");
const path = require("path");
const {pathToFileURL} = require("url");
const {createCanvas} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));

(async () => {
    const pdfjs = await import(pathToFileURL(path.resolve(__dirname, "../../demo-server/node_modules/pdfjs-dist/legacy/build/pdf.mjs")));
    const document = await pdfjs.getDocument({url: pathToFileURL(path.resolve(__dirname, "../../Roborally/roborally.pdf")).href}).promise;
    const output = path.resolve(process.argv[2] || path.join(__dirname, "../rulebook-pages"));
    const pages = process.argv.slice(3).map(Number).filter((number) => number >= 1 && number <= document.numPages);
    fs.mkdirSync(output, {recursive: true});
    for (const number of pages) {
        const page = await document.getPage(number);
        const viewport = page.getViewport({scale: 2.5});
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        await page.render({canvasContext: canvas.getContext("2d"), viewport}).promise;
        fs.writeFileSync(path.join(output, `page-${number}.png`), canvas.toBuffer("image/png"));
    }
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
