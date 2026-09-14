"use strict";

const path = require("path");
const {loadImage, createCanvas} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));
const {BOARD_FEATURES} = require("../module");

const boardName = process.argv[2] || "Vault";
const threshold = Number(process.argv[3] || .12);
const fileNames = {Cross: "Cross.png", Chess: "Chess.png", "Spin Zone": "Spin.png", "Risky Exchange": "exchange.png",
    Island: "Island.png", "Chop Shop": "ChopShop.png", Vault: "Vault.png", Maelstrom: "Maelstrom.png"};

(async () => {
    const image = await loadImage(path.resolve(__dirname, "../../Roborally/Поля целиком", fileNames[boardName]));
    const canvas = createCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    const data = context.getImageData(0, 0, image.width, image.height).data;
    const yellow = (x, y) => {
        const offset = (Math.max(0, Math.min(3599, y)) * 3600 + Math.max(0, Math.min(3599, x))) * 4;
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        return r > 105 && g > 75 && r > b * 1.65 && g > b * 1.4 && Math.abs(r - g) < 115;
    };
    const score = (x, y, direction) => {
        let hits = 0, total = 0;
        for (let along = 50; along < 250; along += 4) {
            for (let depth = -14; depth <= 14; depth += 4) {
                let px, py;
                if (direction === "north" || direction === "south") {
                    px = x * 300 + along;
                    py = (y + (direction === "south" ? 1 : 0)) * 300 + depth;
                } else {
                    px = (x + (direction === "east" ? 1 : 0)) * 300 + depth;
                    py = y * 300 + along;
                }
                hits += yellow(px, py) ? 1 : 0;
                total++;
            }
        }
        return hits / total;
    };
    const candidates = [];
    const physical = new Map();
    const physicalKey = (x, y, direction) => direction === "north" ? `h,${x},${y}`
        : direction === "south" ? `h,${x},${y + 1}` : direction === "west" ? `v,${x},${y}` : `v,${x + 1},${y}`;
    for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) for (const direction of ["north", "west", "east", "south"]) {
        const value = score(x, y, direction);
        const edge = physicalKey(x, y, direction);
        physical.set(edge, Math.max(physical.get(edge) || 0, value));
        if (value >= threshold) candidates.push({key: `${x},${y},${direction}`, score: value});
    }
    candidates.sort((left, right) => right.score - left.score);
    console.log(boardName);
    candidates.forEach(({key, score: value}) => console.log(key, value.toFixed(3)));
    const features = BOARD_FEATURES[boardName];
    const expected = new Set([...features.walls].map((wall) => {
        const [x, y, direction] = wall.split(",");
        return physicalKey(Number(x), Number(y), direction);
    }));
    const pusherBacking = new Set(features.pushers.map((pusher) => physicalKey(pusher.x, pusher.y,
        {north: "south", east: "west", south: "north", west: "east"}[pusher.direction])));
    const besidePit = (edge) => {
        const [axis, xText, yText] = edge.split(",");
        const x = Number(xText), y = Number(yText);
        const cells = axis === "h" ? [[x,y - 1],[x,y]] : [[x - 1,y],[x,y]];
        return cells.some(([cx,cy]) => features.pits.has(`${cx},${cy}`));
    };
    const besidePusher = (edge) => {
        const [axis, xText, yText] = edge.split(",");
        const x = Number(xText), y = Number(yText);
        const adjacent = axis === "h" ? [[x,y - 1],[x,y]] : [[x - 1,y],[x,y]];
        return adjacent.some(([cx,cy]) => features.pushers.some((pusher) => pusher.x === cx && pusher.y === cy));
    };
    const detected = new Set([...physical].filter(([edge, value]) => value >= threshold
        && (process.env.INCLUDE_HAZARDS || (!besidePit(edge) && !besidePusher(edge)))).map(([edge]) => edge));
    console.log("MISSING", [...detected].filter((edge) => !expected.has(edge)).join(" "));
    console.log("NOT_DETECTED", [...expected].filter((edge) => !pusherBacking.has(edge) && (physical.get(edge) || 0) < threshold).join(" "));
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
