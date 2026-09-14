"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const game = require("../module");
const {GUIDE_ASSETS, OUTPUT_DIR} = require("../scripts/build-guide-assets");

const publicDir = path.resolve(__dirname, "../public");
const urls = [...Object.values(game.BOARD_IMAGES), ...Object.values(game.START_IMAGES), "/roborally/assets/boards/markers.webp"];
let total = 0;
urls.forEach((url) => {
    assert(url.startsWith("/roborally/assets/"), `External material URL remains: ${url}`);
    const file = path.join(publicDir, url.replace(/^\/roborally\//, ""));
    assert(fs.existsSync(file), `Web asset is missing: ${file}`);
    const size = fs.statSync(file).size;
    assert(size > 1000 && size < 400000, `Unexpected web asset size for ${file}: ${size}`);
    total += size;
});
assert(total < 3 * 1024 * 1024, `Web board payload is too large: ${total}`);

let guideTotal = 0;
GUIDE_ASSETS.forEach(({id}) => {
    const file = path.join(OUTPUT_DIR, `${id}.webp`);
    assert(fs.existsSync(file), `Guide asset is missing: ${file}`);
    const contents = fs.readFileSync(file);
    assert(contents.length > 1000, `Guide asset is empty: ${file}`);
    assert.equal(contents.subarray(0, 4).toString("ascii"), "RIFF", `Guide asset is not RIFF WebP: ${file}`);
    assert.equal(contents.subarray(8, 12).toString("ascii"), "WEBP", `Guide asset is not WebP: ${file}`);
    guideTotal += contents.length;
});
assert(guideTotal <= 250 * 1024, `Guide asset payload exceeds 250 KB: ${guideTotal}`);
console.log(`All ${urls.length} board assets passed (${(total / 1024 / 1024).toFixed(2)} MB); `
    + `${GUIDE_ASSETS.length} guide assets passed (${(guideTotal / 1024).toFixed(1)} KB).`);
