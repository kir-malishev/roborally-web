"use strict";

const fs=require("fs"),os=require("os"),path=require("path");
const {loadImage,createCanvas}=require(path.resolve(__dirname,"../../demo-server/node_modules/@napi-rs/canvas"));
const files={Cross:"Cross.png",Chess:"Chess.png","Spin Zone":"Spin.png","Risky Exchange":"exchange.png",Island:"Island.png","Chop Shop":"ChopShop.png",Vault:"Vault.png",Maelstrom:"Maelstrom.png"};
const board=process.argv[2]||"Cross",cells=(process.argv[3]||"").split(/\s+/).filter(Boolean);
(async()=>{
    const image=await loadImage(path.resolve(__dirname,"../../Roborally/Поля целиком",files[board]));
    const columns=Math.min(5,cells.length),rows=Math.ceil(cells.length/columns),tile=360;
    const canvas=createCanvas(columns*tile,rows*tile),context=canvas.getContext("2d");
    cells.forEach((key,index)=>{const[x,y]=key.split(",").map(Number),left=(index%columns)*tile,top=Math.floor(index/columns)*tile;
        context.drawImage(image,x*300,y*300,300,300,left,top,tile,tile);context.fillStyle="rgba(0,0,0,.8)";context.fillRect(left,top,80,34);
        context.fillStyle="#fff";context.font="24px Arial";context.textBaseline="top";context.fillText(key,left+8,top+4);});
    const output=path.join(os.tmpdir(),`rr-cells-${files[board].replace(/\.png$/i,"")}.png`);fs.writeFileSync(output,canvas.toBuffer("image/png"));console.log(output);
})().catch((error)=>{console.error(error);process.exit(1);});
