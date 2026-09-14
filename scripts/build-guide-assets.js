"use strict";

const fs = require("fs");
const path = require("path");
const {createCanvas, loadImage} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));

const SOURCE_DIR = path.resolve(__dirname, "../../Roborally/Поля целиком");
const OUTPUT_DIR = path.resolve(__dirname, "../public/assets/guide");

// Coordinates use the native 12x12 card grid. Fractional rectangles retain
// enough neighbouring floor to make walls and multi-beam lasers readable.
const GUIDE_ASSETS = [
    {id: "conveyor-straight", board: "Cross.png", x: 2, y: 1, width: 1, height: 1},
    {id: "conveyor-turn", board: "Cross.png", x: 1, y: 1, width: 1, height: 1},
    {id: "express-straight", board: "Vault.png", x: 1, y: 1, width: 1, height: 1},
    {id: "pusher-even", board: "Vault.png", x: 4.85, y: 0.85, width: 1.3, height: 1.3},
    {id: "pusher-odd", board: "Vault.png", x: 5.85, y: 1.85, width: 1.3, height: 1.3},
    {id: "gear-clockwise", board: "Spin.png", x: 1.85, y: 1.85, width: 1.3, height: 1.3},
    {id: "gear-counterclockwise", board: "Spin.png", x: 4.85, y: 1.85, width: 1.3, height: 1.3},
    {id: "laser-double", board: "Cross.png", x: 7.65, y: 0.65, width: 1.7, height: 3.35},
    {id: "wall", board: "Vault.png", x: 3.85, y: 3.85, width: 1.3, height: 1.3},
    {id: "pit", board: "Cross.png", x: 8.85, y: 1.85, width: 1.3, height: 1.3},
    {id: "repair", board: "Spin.png", x: 1.85, y: 2.85, width: 1.3, height: 1.3}
];

async function buildGuideAssets() {
    if (!fs.existsSync(SOURCE_DIR))
        throw new Error(`Source board directory not found: ${SOURCE_DIR}`);
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
    const expectedFiles = new Set(GUIDE_ASSETS.map(({id}) => `${id}.webp`));
    for (const file of fs.readdirSync(OUTPUT_DIR))
        if (file.endsWith(".webp") && !expectedFiles.has(file)) fs.unlinkSync(path.join(OUTPUT_DIR, file));
    const images = new Map();
    let total = 0;
    for (const asset of GUIDE_ASSETS) {
        if (!images.has(asset.board))
            images.set(asset.board, await loadImage(path.join(SOURCE_DIR, asset.board)));
        const image = images.get(asset.board);
        const cellWidth = image.width / 12;
        const cellHeight = image.height / 12;
        const sourceWidth = asset.width * cellWidth;
        const sourceHeight = asset.height * cellHeight;
        const scale = Math.min(360 / sourceWidth, 360 / sourceHeight);
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        const canvas = createCanvas(width, height);
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(image, asset.x * cellWidth, asset.y * cellHeight, sourceWidth, sourceHeight, 0, 0, width, height);
        const output = path.join(OUTPUT_DIR, `${asset.id}.webp`);
        const encoded = canvas.toBuffer("image/webp", 80);
        fs.writeFileSync(output, encoded);
        total += encoded.length;
        console.log(`${asset.id.padEnd(24)} ${(encoded.length / 1024).toFixed(1)} KB  ${width}x${height}`);
    }
    console.log(`Total: ${(total / 1024).toFixed(1)} KB`);
    return total;
}

if (require.main === module)
    buildGuideAssets().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });

module.exports = {GUIDE_ASSETS, OUTPUT_DIR, buildGuideAssets};
