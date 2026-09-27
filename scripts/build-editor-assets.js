"use strict";

const fs = require("fs");
const path = require("path");
const {createCanvas, loadImage} = require("@napi-rs/canvas");

// The runtime sprite sheet is derived from the small, committed WebP boards.
// Neither the game nor this script needs the external scans.
const cells = {
    floor: ["cross.webp", 0, 0],
    repair: ["cross.webp", 11, 0],
    "gear-right": ["spin.webp", 2, 2],
    "gear-left": ["spin.webp", 5, 2],
    "belt-straight": ["cross.webp", 2, 1],
    "express-straight": ["chess.webp", 2, 1]
};

async function build() {
    const source = path.join(__dirname, "..", "public", "assets", "boards");
    const destination = path.join(__dirname, "..", "public", "assets", "editor");
    fs.mkdirSync(destination, {recursive: true});
    const images = new Map();
    for (const [name, [file, x, y]] of Object.entries(cells)) {
        if (!images.has(file)) images.set(file, await loadImage(path.join(source, file)));
        const image = images.get(file);
        const size = image.width / 12;
        const canvas = createCanvas(size, size);
        canvas.getContext("2d").drawImage(image, x * size, y * size, size, size, 0, 0, size, size);
        fs.writeFileSync(path.join(destination, `${name}.webp`), canvas.toBuffer("image/webp", 82));
    }
    console.log(`Created ${Object.keys(cells).length} field-editor sprites.`);
}

if (require.main === module) build().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = build;
