"use strict";

const path = require("path");
const {loadImage, createCanvas} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));
const {BOARD_FEATURES} = require("../module");

const files = {Cross: "Cross.png", Chess: "Chess.png", "Spin Zone": "Spin.png", "Risky Exchange": "exchange.png",
    Island: "Island.png", "Chop Shop": "ChopShop.png", Vault: "Vault.png", Maelstrom: "Maelstrom.png"};
const vectors = {north: [0,-1], east: [1,0], south: [0,1], west: [-1,0]};

function edgeScore(data, x, y, dx, dy) {
    let dark = 0, total = 0;
    // Sample the belt itself on both sides of the shared cell boundary. The
    // central 120 px deliberately excludes the metallic side rails.
    for (let depth = -12; depth <= 12; depth += 3) for (let across = -60; across <= 60; across += 3) {
        const px = Math.round((x + .5 + dx * .5) * 300 + (dy ? across : depth));
        const py = Math.round((y + .5 + dy * .5) * 300 + (dx ? across : depth));
        const offset = (py * 3600 + px) * 4;
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        if (r < 85 && g < 92 && b < 92) dark++;
        total++;
    }
    return dark / total;
}

(async () => {
    for (const [name, file] of Object.entries(files)) {
        const image = await loadImage(path.resolve(__dirname, "../../Roborally/Поля целиком", file));
        const canvas = createCanvas(3600, 3600), context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, 3600, 3600).data;
        const conveyors = BOARD_FEATURES[name].conveyors;
        const suspicious = [];
        Object.keys(conveyors).forEach((key) => {
            const [x,y] = key.split(",").map(Number);
            [[1,0],[0,1]].forEach(([dx,dy]) => {
                const neighbor = `${x + dx},${y + dy}`;
                if (!(neighbor in conveyors)) return;
                const [ax,ay] = vectors[conveyors[key]], [bx,by] = vectors[conveyors[neighbor]];
                const inferred = (ax === dx && ay === dy) || (bx === -dx && by === -dy);
                const score = edgeScore(data,x,y,dx,dy);
                if ((inferred && score < .30) || (!inferred && score > .55))
                    suspicious.push(`${key}<->${neighbor} image=${score.toFixed(2)} inferred=${inferred}`);
            });
        });
        console.log(`\n${name}`);
        console.log(suspicious.join("\n") || "OK");
    }
})().catch((error) => { console.error(error); process.exit(1); });
