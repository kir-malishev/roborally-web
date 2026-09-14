"use strict";

const fs = require("fs");
const path = require("path");
const {createCanvas, loadImage} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));
const {BOARD_FEATURES, BOARD_CARDS, COURSE_CARDS, START_CARDS, START_LAYOUTS, orientFeatures} = require("../module");

const DIRECTIONS = ["north", "east", "south", "west"];
const VECTORS = {north: [0,-1], east: [1,0], south: [0,1], west: [-1,0]};
const OPPOSITE = {north: "south", east: "west", south: "north", west: "east"};
const size = Math.max(900, Number(process.env.AUDIT_SIZE || 1800));
const panelWidth = Math.round(size * .25);
const unit = size / 12;
const outputDir = path.resolve(process.env.AUDIT_OUTPUT || path.join(__dirname, "..", "board-audit"));
const materialsDir = path.resolve(__dirname, "../../Roborally/Поля целиком");

function keyPoint(key) { return key.split(",").map(Number); }

function wallLine(x, y, direction) {
    if (direction === "north") return [x,y,x + 1,y];
    if (direction === "south") return [x,y + 1,x + 1,y + 1];
    if (direction === "west") return [x,y,x,y + 1];
    return [x + 1,y,x + 1,y + 1];
}

function hasWall(walls, x, y, direction) {
    if (walls.has(`${x},${y},${direction}`)) return true;
    const [dx,dy] = VECTORS[direction];
    return walls.has(`${x + dx},${y + dy},${OPPOSITE[direction]}`);
}

function drawRotatedBoard(context,image,side,rotation) {
    context.save();
    context.translate(side/2,side/2);
    context.rotate((Number(rotation)||0)*Math.PI/180);
    context.drawImage(image,-side/2,-side/2,side,side);
    context.restore();
}

function laserSegment(laser, walls) {
    const [dx,dy] = VECTORS[laser.direction];
    let x = laser.x, y = laser.y;
    const start = [x + .5 - dx * .5,y + .5 - dy * .5];
    let end = [x + .5 + dx * .5,y + .5 + dy * .5];
    while (x >= 0 && x < 12 && y >= 0 && y < 12) {
        end = [x + .5 + dx * .5,y + .5 + dy * .5];
        if (hasWall(walls,x,y,laser.direction)) break;
        const nx=x+dx, ny=y+dy;
        if (nx < 0 || nx >= 12 || ny < 0 || ny >= 12) break;
        x=nx;y=ny;
    }
    return [start,end];
}

function arrow(context, x, y, direction, color = "#ff37d1") {
    const [dx,dy] = VECTORS[direction], cx=(x+.5)*unit, cy=(y+.5)*unit;
    context.save();
    context.strokeStyle=color;context.fillStyle=color;context.lineWidth=unit*.055;context.lineCap="round";
    context.beginPath();context.moveTo(cx-dx*unit*.22,cy-dy*unit*.22);context.lineTo(cx+dx*unit*.23,cy+dy*unit*.23);context.stroke();
    context.beginPath();context.moveTo(cx+dx*unit*.34,cy+dy*unit*.34);
    context.lineTo(cx+dx*unit*.16-dy*unit*.11,cy+dy*unit*.16+dx*unit*.11);
    context.lineTo(cx+dx*unit*.16+dy*unit*.11,cy+dy*unit*.16-dx*unit*.11);context.closePath();context.fill();
    context.restore();
}

function cellBox(context, key, fill, stroke, inset=.045) {
    const [x,y]=keyPoint(key);
    context.fillStyle=fill;context.strokeStyle=stroke;context.lineWidth=unit*.035;
    context.fillRect((x+inset)*unit,(y+inset)*unit,(1-inset*2)*unit,(1-inset*2)*unit);
    context.strokeRect((x+inset)*unit,(y+inset)*unit,(1-inset*2)*unit,(1-inset*2)*unit);
}

function label(context, text, x, y, color="#fff", fontSize=unit*.2) {
    context.font=`700 ${fontSize}px Arial`;context.textAlign="center";context.textBaseline="middle";
    context.lineWidth=Math.max(2,fontSize*.16);context.strokeStyle="rgba(0,0,0,.9)";context.strokeText(text,x,y);
    context.fillStyle=color;context.fillText(text,x,y);
}

function wrench(context, cx, cy, scale=unit) {
    context.save();context.strokeStyle="#fff";context.lineWidth=scale*.085;context.lineCap="round";
    context.beginPath();context.moveTo(cx-scale*.2,cy+scale*.2);context.lineTo(cx+scale*.18,cy-scale*.18);context.stroke();
    context.beginPath();context.arc(cx-scale*.23,cy+scale*.23,scale*.07,0,Math.PI*2);context.stroke();
    context.beginPath();context.arc(cx+scale*.22,cy-scale*.22,scale*.12,.2,Math.PI*1.55);context.stroke();context.restore();
}

function flag(context, cx, cy, number, scale=unit) {
    context.save();context.strokeStyle="#fff";context.fillStyle="#fff";context.lineWidth=scale*.035;
    context.beginPath();context.moveTo(cx-scale*.13,cy+scale*.2);context.lineTo(cx-scale*.13,cy-scale*.22);context.stroke();
    context.beginPath();context.moveTo(cx-scale*.12,cy-scale*.21);context.lineTo(cx+scale*.17,cy-scale*.11);context.lineTo(cx-scale*.12,cy-.01*scale);context.closePath();context.fill();context.restore();
    label(context,String(number),cx+scale*.08,cy+scale*.17,"#fff",scale*.15);
}

function panel(context, course, features) {
    const left=size, width=panelWidth;
    context.fillStyle="#111923";context.fillRect(left,0,width,size);
    context.textAlign="left";context.textBaseline="top";
    context.fillStyle="#fff";context.font=`700 ${unit*.22}px Arial`;context.fillText(course.name,left+unit*.18,unit*.2);
    context.fillStyle="#aebdca";context.font=`${unit*.135}px Arial`;
    context.fillText(`${course.board} · ${course.rotation || 0}°`,left+unit*.18,unit*.52);
    const counts=[
        ["Конвейеры",Object.keys(features.conveyors).length,"#ff37d1"],
        ["Экспресс",features.express.size,"#35bfff"],
        ["Ямы",features.pits.size,"#ff334f"],
        ["Ремонт",features.repairs.size,"#36f28a"],
        ["Шестерни",Object.keys(features.gears).length,"#ffb52b"],
        ["Стены",new Set([...features.walls].map((wall)=>{const[x,y,d]=wall.split(",");return wallLine(+x,+y,d).join(",");})).size,"#00f6ff"],
        ["Лазеры",features.lasers.length,"#70ff45"],
        ["Толкатели",features.pushers.length,"#d875ff"],
        ["Флаги",course.flags.length,"#53e77a"]
    ];
    counts.forEach(([name,count,color],index)=>{
        const y=unit*(1.02+index*.42);context.fillStyle=color;context.fillRect(left+unit*.18,y,unit*.16,unit*.16);
        context.fillStyle="#e8eef3";context.font=`${unit*.145}px Arial`;context.fillText(`${name}: ${count}`,left+unit*.44,y-unit*.01);
    });
    context.fillStyle="#9aacb9";context.font=`${unit*.115}px Arial`;
    const notes=["Стрелка — сохранённое направление.","Голубая линия — физическая стена.","Зелёные лучи обрываются у стены.","Фиолетовый блок — толкатель;",  "числа показывают его регистры.","Координаты клеток имеют вид x,y."];
    notes.forEach((text,index)=>context.fillText(text,left+unit*.18,unit*(5.1+index*.27)));
}

async function render(course) {
    const image = await loadImage(path.join(materialsDir,BOARD_CARDS[course.board]));
    const rotation = Number(course.rotation)||0;
    const features = orientFeatures(BOARD_FEATURES[course.board],rotation);
    const canvas=createCanvas(size+panelWidth,size),context=canvas.getContext("2d");
    // Match the browser: the square Factory Floor and all parsed features use
    // the same clockwise rotation around the center. Previously only the
    // feature overlay rotated, which made every non-zero audit look corrupt.
    drawRotatedBoard(context,image,size,rotation);

    Object.entries(features.conveyors).forEach(([key,direction])=>{
        cellBox(context,key,features.express.has(key)?"rgba(30,166,255,.20)":"rgba(255,185,38,.14)",features.express.has(key)?"rgba(53,191,255,.85)":"rgba(255,211,70,.65)");
        const [x,y]=keyPoint(key);arrow(context,x,y,direction);
    });
    features.pits.forEach((key)=>cellBox(context,key,"rgba(255,28,54,.23)","#ff334f",.025));
    features.repairs.forEach((key)=>{cellBox(context,key,"rgba(21,255,124,.18)","#36f28a",.1);const[x,y]=keyPoint(key);wrench(context,(x+.5)*unit,(y+.5)*unit);});
    Object.entries(features.gears).forEach(([key,turn])=>{const[x,y]=keyPoint(key);context.strokeStyle="#ffb52b";context.lineWidth=unit*.045;context.beginPath();context.arc((x+.5)*unit,(y+.5)*unit,unit*.37,0,Math.PI*2);context.stroke();label(context,turn>0?"↻":"↺",(x+.5)*unit,(y+.5)*unit,"#ffcf62",unit*.42);});

    const walls=new Set(features.walls);context.strokeStyle="#00f6ff";context.lineWidth=unit*.065;context.lineCap="round";
    const physical=new Set();
    walls.forEach((wall)=>{const[x,y,direction]=wall.split(","),line=wallLine(+x,+y,direction),id=line.join(",");if(physical.has(id))return;physical.add(id);context.beginPath();context.moveTo(line[0]*unit,line[1]*unit);context.lineTo(line[2]*unit,line[3]*unit);context.stroke();});

    features.lasers.forEach((laser,index)=>{
        const [[x1,y1],[x2,y2]]=laserSegment(laser,walls),[dx,dy]=VECTORS[laser.direction];
        const offsets=(laser.count||1)===3?[-.22,0,.22]:(laser.count||1)===2?[-.18,.18]:[0];
        context.strokeStyle="#70ff45";context.lineWidth=unit*.038;context.lineCap="round";
        offsets.forEach((offset)=>{const ox=dy?offset:0,oy=dx?offset:0;context.beginPath();context.moveTo((x1+ox)*unit,(y1+oy)*unit);context.lineTo((x2+ox)*unit,(y2+oy)*unit);context.stroke();});
        label(context,`L${index+1}×${laser.count||1}`,(laser.x+.5)*unit,(laser.y+.5)*unit,"#70ff45",unit*.13);
    });

    features.pushers.forEach((pusher)=>{
        const [dx,dy]=VECTORS[pusher.direction],cx=(pusher.x+.5-dx*.31)*unit,cy=(pusher.y+.5-dy*.31)*unit;
        context.fillStyle="rgba(202,74,255,.3)";context.strokeStyle="#d875ff";context.lineWidth=unit*.04;
        context.fillRect(cx-unit*.17,cy-unit*.17,unit*.34,unit*.34);context.strokeRect(cx-unit*.17,cy-unit*.17,unit*.34,unit*.34);
        label(context,(pusher.active||[]).join("/"),cx,cy,"#fff",unit*.105);arrow(context,pusher.x,pusher.y,pusher.direction,"#d875ff");
    });

    // Course flags already use final screen coordinates from the Course Manual.
    // Only the Factory Floor image and its parsed features rotate.
    course.flags.forEach(([fx,fy],index)=>{
        const cx=(fx+.5)*unit,cy=(fy+.5)*unit;
        context.fillStyle="rgba(52,220,104,.45)";context.strokeStyle="#baffc9";context.lineWidth=unit*.035;
        context.beginPath();context.arc(cx,cy,unit*.32,0,Math.PI*2);context.fill();context.stroke();
        flag(context,cx,cy,index+1);
    });

    context.strokeStyle="rgba(255,255,255,.42)";context.lineWidth=Math.max(1,unit*.008);
    for(let i=0;i<=12;i++){context.beginPath();context.moveTo(i*unit,0);context.lineTo(i*unit,size);context.stroke();context.beginPath();context.moveTo(0,i*unit);context.lineTo(size,i*unit);context.stroke();}
    for(let y=0;y<12;y++)for(let x=0;x<12;x++){
        context.fillStyle="rgba(0,0,0,.62)";context.fillRect(x*unit+unit*.025,y*unit+unit*.025,unit*.27,unit*.16);
        context.fillStyle="#fff";context.font=`${unit*.09}px Arial`;context.textAlign="center";context.textBaseline="middle";context.fillText(`${x},${y}`,x*unit+unit*.16,y*unit+unit*.105);
    }
    panel(context,course,features);
    const safe=course.id.replace(/[^a-z0-9-]/gi,"-");
    const output=path.join(outputDir,`${safe}.png`);fs.writeFileSync(output,canvas.toBuffer("image/png"));
    return {course:course.name,board:course.board,rotation,output:path.relative(path.resolve(__dirname,".."),output),
        counts:{conveyors:Object.keys(features.conveyors).length,express:features.express.size,pits:features.pits.size,repairs:features.repairs.size,
            gears:Object.keys(features.gears).length,walls:physical.size,lasers:features.lasers.length,pushers:features.pushers.length,flags:course.flags.length}};
}

async function renderStartCard(card,index) {
    const features=START_LAYOUTS[card],height=size/3;
    const image=await loadImage(path.join(materialsDir,card));
    const canvas=createCanvas(size+panelWidth,height),context=canvas.getContext("2d");
    context.drawImage(image,0,0,size,height);
    const localKey=(key)=>{const[x,y]=keyPoint(key);return `${x},${y-12}`;};
    Object.entries(features.conveyors||{}).forEach(([key,direction])=>{
        const local=localKey(key);cellBox(context,local,"rgba(255,185,38,.17)","rgba(255,211,70,.75)");
        const[x,y]=keyPoint(local);arrow(context,x,y,direction);
    });
    context.strokeStyle="#00f6ff";context.lineWidth=unit*.065;context.lineCap="round";
    const physical=new Set();
    features.walls.forEach((wall)=>{const[xText,yText,direction]=wall.split(","),line=wallLine(+xText,+yText-12,direction),id=line.join(",");
        if(physical.has(id))return;physical.add(id);context.beginPath();context.moveTo(line[0]*unit,line[1]*unit);context.lineTo(line[2]*unit,line[3]*unit);context.stroke();});
    features.starts.forEach((point,slot)=>{const cx=(point.x+.5)*unit,cy=(point.y-11.5)*unit;
        context.fillStyle="rgba(55,130,255,.52)";context.strokeStyle="#fff";context.lineWidth=unit*.035;context.beginPath();context.arc(cx,cy,unit*.31,0,Math.PI*2);context.fill();context.stroke();label(context,String(slot+1),cx,cy,"#fff",unit*.2);});
    context.strokeStyle="rgba(255,255,255,.42)";context.lineWidth=Math.max(1,unit*.008);
    for(let x=0;x<=12;x++){context.beginPath();context.moveTo(x*unit,0);context.lineTo(x*unit,height);context.stroke();}
    for(let y=0;y<=4;y++){context.beginPath();context.moveTo(0,y*unit);context.lineTo(size,y*unit);context.stroke();}
    for(let y=0;y<4;y++)for(let x=0;x<12;x++){context.fillStyle="rgba(0,0,0,.62)";context.fillRect(x*unit+unit*.025,y*unit+unit*.025,unit*.27,unit*.16);
        context.fillStyle="#fff";context.font=`${unit*.09}px Arial`;context.textAlign="center";context.textBaseline="middle";context.fillText(`${x},${y+12}`,x*unit+unit*.16,y*unit+unit*.105);}
    context.fillStyle="#111923";context.fillRect(size,0,panelWidth,height);context.textAlign="left";context.textBaseline="top";
    context.fillStyle="#fff";context.font=`700 ${unit*.22}px Arial`;context.fillText(`Старт ${index+1}`,size+unit*.18,unit*.2);
    context.fillStyle="#e8eef3";context.font=`${unit*.145}px Arial`;context.fillText(`Стартовые позиции: ${features.starts.length}`,size+unit*.18,unit*.65);
    context.fillText(`Конвейеры: ${Object.keys(features.conveyors||{}).length}`,size+unit*.18,unit*.95);context.fillText(`Стены: ${physical.size}`,size+unit*.18,unit*1.25);
    const output=path.join(outputDir,`start-${index+1}.png`);fs.writeFileSync(output,canvas.toBuffer("image/png"));
    return {type:"start",course:`Старт ${index+1}`,board:card,rotation:0,output:path.relative(path.resolve(__dirname,".."),output),
        counts:{starts:features.starts.length,conveyors:Object.keys(features.conveyors||{}).length,walls:physical.size}};
}

async function main() {
    fs.mkdirSync(outputDir,{recursive:true});
    const manifest=[];
    for(const course of COURSE_CARDS){const result=await render(course);manifest.push(result);console.log(result.output);}
    for(let index=0;index<START_CARDS.length;index++){const result=await renderStartCard(START_CARDS[index],index);manifest.push(result);console.log(result.output);}
    fs.writeFileSync(path.join(outputDir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    console.log(`Saved ${manifest.length} audit images and manifest.json in ${outputDir}`);
}

module.exports = {drawRotatedBoard};
if (require.main === module)
    main().catch((error)=>{console.error(error);process.exit(1);});
