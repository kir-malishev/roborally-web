"use strict";

const path = require("path");
const {loadImage, createCanvas} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));
const {BOARD_FEATURES} = require("../module");

const files = {Cross: "Cross.png", Chess: "Chess.png", "Spin Zone": "Spin.png", "Risky Exchange": "exchange.png",
    Island: "Island.png", "Chop Shop": "ChopShop.png", Vault: "Vault.png", Maelstrom: "Maelstrom.png"};

function fraction(data, predicate, x1, y1, x2, y2, step = 4) {
    let count = 0, total = 0;
    for (let y = y1; y < y2; y += step) for (let x = x1; x < x2; x += step) {
        const offset = (Math.max(0, Math.min(3599, y)) * 3600 + Math.max(0, Math.min(3599, x))) * 4;
        if (predicate(data[offset], data[offset + 1], data[offset + 2])) count++;
        total++;
    }
    return count / total;
}

(async () => {
    for (const [name, file] of Object.entries(files)) {
        const image = await loadImage(path.resolve(__dirname, "../../Roborally/Поля целиком", file));
        const canvas = createCanvas(3600, 3600), context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, 3600, 3600).data;
        const features = BOARD_FEATURES[name];
        const scores = [];
        for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) {
            const dark = fraction(data, (r,g,b) => r < 70 && g < 82 && b < 82,
                x * 300 + 55, y * 300 + 55, x * 300 + 245, y * 300 + 245, 5);
            const red = fraction(data, (r,g,b) => r > 120 && r > g * 1.55 && r > b * 1.3,
                x * 300 + 20, y * 300 + 20, x * 300 + 280, y * 300 + 280, 3);
            const key = `${x},${y}`;
            scores.push({key, dark, red, conveyor: key in features.conveyors, pit: features.pits.has(key)});
        }
        console.log(`\n${name}`);
        console.log("expected conveyor low", scores.filter((cell) => cell.conveyor).sort((a,b) => a.dark - b.dark).slice(0,8)
            .map((cell) => `${cell.key}:${cell.dark.toFixed(2)}`).join(" "));
        console.log("unexpected dark high", scores.filter((cell) => !cell.conveyor && !cell.pit).sort((a,b) => b.dark - a.dark).slice(0,12)
            .map((cell) => `${cell.key}:${cell.dark.toFixed(2)}`).join(" "));
        console.log("red cells", scores.filter((cell) => cell.red > .002).sort((a,b) => b.red - a.red)
            .map((cell) => `${cell.key}:${cell.red.toFixed(3)}`).join(" "));
    }
})().catch((error) => { console.error(error); process.exit(1); });
