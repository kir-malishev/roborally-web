"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const game = require("../module");

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
console.log(`All ${urls.length} self-contained web assets passed (${(total / 1024 / 1024).toFixed(2)} MB total).`);
