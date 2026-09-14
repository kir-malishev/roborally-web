"use strict";

const assert = require("assert");
const path = require("path");
const {createCanvas} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));
const {drawRotatedBoard} = require("../scripts/render-board-audit");

const source = createCanvas(20,20), sourceContext = source.getContext("2d");
sourceContext.fillStyle="#ff0000"; sourceContext.fillRect(0,0,10,10);
sourceContext.fillStyle="#00ff00"; sourceContext.fillRect(10,0,10,10);
sourceContext.fillStyle="#0000ff"; sourceContext.fillRect(0,10,10,10);
sourceContext.fillStyle="#ffff00"; sourceContext.fillRect(10,10,10,10);

const expectedCorners = {
    0: ["ff0000","00ff00","ffff00","0000ff"],
    90: ["0000ff","ff0000","00ff00","ffff00"],
    180: ["ffff00","0000ff","ff0000","00ff00"],
    270: ["00ff00","ffff00","0000ff","ff0000"]
};

function colorAt(context,x,y) {
    return [...context.getImageData(x,y,1,1).data.slice(0,3)]
        .map((value)=>value.toString(16).padStart(2,"0")).join("");
}

for (const rotation of [0,90,180,270]) {
    const target=createCanvas(20,20),context=target.getContext("2d");
    drawRotatedBoard(context,source,20,rotation);
    const corners=[[4,4],[15,4],[15,15],[4,15]].map(([x,y])=>colorAt(context,x,y));
    assert.deepStrictEqual(corners,expectedCorners[rotation],`Audit background rotates incorrectly at ${rotation} degrees`);
}

console.log("Board audit background rotation passed");
