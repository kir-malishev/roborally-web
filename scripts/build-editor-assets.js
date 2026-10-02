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

// Source cells on Maelstrom, normalized so every authored junction exits east.
const junctions = {
    "belt-turn": [1, 1, 0],
    "belt-merge": [5, 1, 0],
    "belt-double-turn": [10, 1, -90],
    "express-turn": [3, 4, 0],
    "express-merge": [1, 6, 90],
    "express-double-turn": [1, 10, 90]
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
    const maelstrom = await loadImage(path.join(source, "maelstrom.webp"));
    const size = maelstrom.width / 12;
    const cropJunction = (x, y, rotation) => {
        const canvas = createCanvas(size, size);
        const context = canvas.getContext("2d");
        context.translate(size / 2, size / 2);
        context.rotate(rotation * Math.PI / 180);
        context.drawImage(maelstrom, x * size, y * size, size, size, -size / 2, -size / 2, size, size);
        return canvas;
    };
    for (const [name, [x, y, rotation]] of Object.entries(junctions))
        fs.writeFileSync(path.join(destination, `${name}.webp`), cropJunction(x, y, rotation).toBuffer("image/webp", 82));
    // Use the original merge for the top half and its vertical reflection for
    // the bottom half. Their straight lanes meet at the center without a seam.
    for (const prefix of ["belt", "express"]) {
        const canvas = cropJunction(...junctions[`${prefix}-merge`]);
        const context = canvas.getContext("2d");
        context.resetTransform();
        context.save();
        context.beginPath();
        context.rect(0, size / 2, size, size / 2);
        context.clip();
        context.translate(0, size);
        context.scale(1, -1);
        context.drawImage(canvas, 0, 0);
        context.restore();
        fs.writeFileSync(path.join(destination, `${prefix}-triple-merge.webp`), canvas.toBuffer("image/webp", 82));
    }
    console.log(`Created ${Object.keys(cells).length + Object.keys(junctions).length + 2} field-editor sprites.`);
}

if (require.main === module) build().catch((error) => { console.error(error); process.exitCode = 1; });
module.exports = build;
