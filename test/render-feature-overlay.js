"use strict";

const path = require("path");
const os = require("os");
const {loadImage, createCanvas} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));
const {BOARD_FEATURES} = require("../module");

const files = {Cross: "Cross.png", Chess: "Chess.png", "Spin Zone": "Spin.png", "Risky Exchange": "exchange.png",
    Island: "Island.png", "Chop Shop": "ChopShop.png", Vault: "Vault.png", Maelstrom: "Maelstrom.png"};
const vectors = {north: [0,-1], east: [1,0], south: [0,1], west: [-1,0]};

function wallLine(x, y, direction) {
    if (direction === "north") return [x,y,x + 1,y];
    if (direction === "south") return [x,y + 1,x + 1,y + 1];
    if (direction === "west") return [x,y,x,y + 1];
    return [x + 1,y,x + 1,y + 1];
}

(async () => {
    for (const [name, file] of Object.entries(files)) {
        if (process.env.OVERLAY_BOARD && process.env.OVERLAY_BOARD !== name) continue;
        const image = await loadImage(path.resolve(__dirname, "../../Roborally/Поля целиком", file));
        const size = Number(process.env.OVERLAY_SIZE || 1200), canvas = createCanvas(size,size), context = canvas.getContext("2d"), unit = size / 12;
        context.drawImage(image,0,0,size,size);
        const features = BOARD_FEATURES[name];
        context.lineCap = "round";
        if (!process.env.OVERLAY_RAW) {
        Object.entries(features.conveyors).forEach(([key,direction]) => {
            const [x,y] = key.split(",").map(Number), [dx,dy] = vectors[direction];
            const cx=(x+.5)*unit, cy=(y+.5)*unit;
            context.strokeStyle="#ff35e7";context.fillStyle="#ff35e7";context.lineWidth=unit*.04;
            context.beginPath();context.moveTo(cx-dx*unit*.2,cy-dy*unit*.2);context.lineTo(cx+dx*unit*.29,cy+dy*unit*.29);context.stroke();
            context.beginPath();context.moveTo(cx+dx*unit*.34,cy+dy*unit*.34);context.lineTo(cx+dx*unit*.2-dy*unit*.09,cy+dy*unit*.2+dx*unit*.09);
            context.lineTo(cx+dx*unit*.2+dy*unit*.09,cy+dy*unit*.2-dx*unit*.09);context.closePath();context.fill();
        });
        context.strokeStyle="#00ffff";context.lineWidth=unit*.05;
        features.walls.forEach((wall) => {
            const [x,y,direction]=wall.split(","), line=wallLine(Number(x),Number(y),direction);
            context.beginPath();context.moveTo(line[0]*unit,line[1]*unit);context.lineTo(line[2]*unit,line[3]*unit);context.stroke();
        });
        context.strokeStyle="#64ff47";context.lineWidth=unit*.03;
        features.lasers.forEach((laser) => {
            const [dx,dy]=vectors[laser.direction], offsets=laser.count===3?[-unit*.2,0,unit*.2]:laser.count===2?[-unit*.17,unit*.17]:[0];
            offsets.forEach((offset) => {const ox=dy?offset:0,oy=dx?offset:0;context.beginPath();context.moveTo((laser.x+.5)*unit+ox,(laser.y+.5)*unit+oy);
                context.lineTo((laser.x+.5+dx*.42)*unit+ox,(laser.y+.5+dy*.42)*unit+oy);context.stroke();});
        });
        context.strokeStyle="#ff3131";context.lineWidth=unit*.04;
        features.pits.forEach((key)=>{const[x,y]=key.split(",").map(Number);context.strokeRect(x*unit+unit*.04,y*unit+unit*.04,unit*.92,unit*.92);});
        }
        const output=path.join(os.tmpdir(),`rr-overlay-${file.replace(/\.png$/i,"")}.png`);
        if (process.env.OVERLAY_QUADRANTS) {
            for (let row=0;row<2;row++) for (let column=0;column<2;column++) {
                const crop=createCanvas(size/2,size/2), cropContext=crop.getContext("2d");
                cropContext.drawImage(canvas,column*size/2,row*size/2,size/2,size/2,0,0,size/2,size/2);
                const part=output.replace(/\.png$/,`-${row}-${column}.png`);
                require("fs").writeFileSync(part,crop.toBuffer("image/png"));
                console.log(part);
            }
        } else {
            require("fs").writeFileSync(output,canvas.toBuffer("image/png"));
            console.log(output);
        }
    }
})().catch((error)=>{console.error(error);process.exit(1);});
