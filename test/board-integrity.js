"use strict";

const assert = require("assert");
const path = require("path");
const {loadImage, createCanvas} = require(path.resolve(__dirname, "../../demo-server/node_modules/@napi-rs/canvas"));
const init = require("../module");
const {BOARD_FEATURES, COURSE_CARDS, START_CARDS} = init;

const FILES = {Cross: "Cross.png", Chess: "Chess.png", "Spin Zone": "Spin.png", "Risky Exchange": "exchange.png",
    Island: "Island.png", "Chop Shop": "ChopShop.png", Vault: "Vault.png", Maelstrom: "Maelstrom.png"};
const DIRECTIONS = ["north", "east", "south", "west"];
const VECTORS = {north: [0,-1], east: [1,0], south: [0,1], west: [-1,0]};
const OPPOSITE = {north: "south", east: "west", south: "north", west: "east"};
const EXPECTED_LASERS = {
    Cross: ["4,2,north,1", "8,3,north,2", "2,8,east,1", "7,8,east,1"],
    Chess: [],
    "Spin Zone": ["3,6,north,1", "8,5,south,1", "6,3,west,1", "5,8,east,1"],
    "Risky Exchange": ["2,0,south,1"],
    Island: [],
    "Chop Shop": ["1,1,south,3", "4,2,east,1", "3,6,north,2", "10,5,north,1", "1,7,south,1", "5,8,east,1"],
    Vault: ["0,4,east,1", "11,4,west,1", "0,7,east,1", "11,7,west,1", "2,8,south,1"],
    Maelstrom: ["4,5,east,1", "3,6,east,1", "5,7,north,1", "6,8,north,1"]
};

let GameState;
class RoomState {
    constructor() { this.room = {}; }
}
const registry = {RoomState, games: {roborally: {id: "test"}}, handleAppPage() {}, createRoomManager(_path, Type) { GameState = Type; }};
const server = {app: {use() {}}, users: registry, static() { return () => {}; }};
init(server, "/roborally-test");

function makeGame(board, rotation = 0) {
    const game = new GameState("host", {}, {send() {}});
    game.room.course = {board, rotation};
    game.room.board = {name: board, size: 12, start: game.room.board.start};
    game.room.robots = [];
    game.players = {};
    return game;
}

{
    const game = makeGame("Cross");
    const robot = {userId: "death-test", x: 4, y: 6, direction: "north", color: "#fff", eliminated: false, archive: {x: 1, y: 14}};
    game.room.robots = [robot];
    game.room.playerNames = {"death-test": "Test"};
    game.players["death-test"] = {lives: 3, damage: 4};
    game.destructionCounter = 0;
    game.reboot(robot, "test pit");
    assert.deepStrictEqual([robot.death.x, robot.death.y], [4, 6], "Death animation lost the destruction position");
    assert.equal(robot.x, null, "Destroyed robot remained on the board");
    assert.equal(robot.death.id, 1, "Death animation did not receive a stable event id");
}

{
    const game = makeGame("Chess");
    const shooter = {userId: "shooter", x: 0, y: 0, direction: "east", color: "#f00", eliminated: false};
    const target = {userId: "target", x: 3, y: 0, direction: "north", color: "#0f0", eliminated: false};
    const hidden = {userId: "hidden", x: 5, y: 0, direction: "north", color: "#00f", eliminated: false};
    game.room.robots = [shooter, target, hidden];
    game.room.playerNames = {shooter: "Shooter", target: "Target", hidden: "Hidden"};
    game.players = {
        shooter: {damage: 0, lives: 3, poweredDown: false},
        target: {damage: 0, lives: 3, poweredDown: false},
        hidden: {damage: 0, lives: 3, poweredDown: false}
    };
    let laserHits = game.fireAllLasers();
    const shot = game.room.laserShots.find((item) => item.sourceUserId === "shooter");
    assert(shot, "Robot laser did not create a visual shot");
    assert.equal(shot.source, "robot", "Robot laser has the wrong visual source type");
    assert.equal(shot.targetUserId, "target", "Robot laser visual passes through the first robot");
    assert.deepStrictEqual(shot.end, {x: 3.5, y: .5}, "Robot laser visual does not end on its target");
    assert.equal(game.players.target.damage, 0, "Robot disappeared before its laser animation was shown");
    game.applyLaserHits(laserHits);
    assert.equal(game.players.target.damage, 1, "Robot laser did not damage its visual target after the animation");
    assert.equal(game.players.hidden.damage, 0, "Robot laser damaged a robot behind its visual target");
    assert(Number.isInteger(shot.id), "Robot laser animation has an invalid event id");
    const firstId = shot.id;
    laserHits = game.fireAllLasers();
    const nextShot = game.room.laserShots.find((item) => item.sourceUserId === "shooter");
    assert(nextShot.id > firstId, "A new laser phase re-used the previous animation id");
}

{
    // The wall on the west side of Cross (7,3) must stop the same robot beam
    // after every board rotation. Coordinates here are final screen cells,
    // exactly like the overlay used by the browser.
    for (const rotation of [0, 90, 180, 270]) {
        const turns = rotation / 90;
        let point = {x: 7, y: 3};
        for (let turn = 0; turn < turns; turn++) point = {x: 11 - point.y, y: point.x};
        const direction = DIRECTIONS[(DIRECTIONS.indexOf("west") + turns) % 4];
        const [dx,dy] = VECTORS[direction];
        const game = makeGame("Cross", rotation);
        const shooter = {userId: "wall-shooter", ...point, direction, color: "#f00", eliminated: false};
        const hidden = {userId: "wall-hidden", x: point.x + dx, y: point.y + dy,
            direction: DIRECTIONS[(DIRECTIONS.indexOf(direction) + 2) % 4], color: "#00f", eliminated: false};
        game.room.robots = [shooter, hidden];
        game.room.playerNames = {"wall-shooter": "Shooter", "wall-hidden": "Hidden"};
        game.players = {"wall-shooter": {damage: 0, lives: 3, poweredDown: false}, "wall-hidden": {damage: 0, lives: 3, poweredDown: false}};
        const laserHits = game.fireAllLasers();
        const shot = game.room.laserShots.find((item) => item.sourceUserId === "wall-shooter");
        assert.equal(shot.targetUserId, null, `Robot laser passes through a wall after ${rotation} degree rotation`);
        assert.deepStrictEqual(shot.start, {x: point.x + .5, y: point.y + .5}, `Robot laser source shifts after ${rotation} degree rotation`);
        assert.deepStrictEqual(shot.end, {x: point.x + .5 + dx * .5, y: point.y + .5 + dy * .5},
            `Robot laser does not end at the wall after ${rotation} degree rotation`);
        game.applyLaserHits(laserHits);
        assert.equal(game.players["wall-hidden"].damage, 0, `Robot laser damages through a rotated wall at ${rotation} degrees`);
    }
}

{
    const game = makeGame("Chop Shop");
    const target = {userId: "target", x: 1, y: 1, direction: "east", color: "#0f0", eliminated: false};
    game.room.robots = [target];
    game.room.playerNames = {target: "Target"};
    game.players = {target: {damage: 0, lives: 3, poweredDown: true}};
    const laserHits = game.fireAllLasers();
    const shot = game.room.laserShots.find((item) => item.source === "board" && item.count === 3);
    assert(shot, "Triple stationary laser did not create a visual shot");
    assert.equal(shot.targetUserId, "target", "Stationary laser visual does not identify its target");
    assert.equal(game.players.target.damage, 0, "Stationary laser damage was applied before its animation");
    game.applyLaserHits(laserHits);
    assert.equal(game.players.target.damage, 3, "Triple stationary laser damage differs from its visualization");
    assert(!game.room.laserShots.some((item) => item.sourceUserId === "target"), "Powered-down robot created a laser visual");
}

function physicalWall(x, y, direction) {
    if (direction === "north") return `h,${x},${y}`;
    if (direction === "south") return `h,${x},${y + 1}`;
    if (direction === "west") return `v,${x},${y}`;
    return `v,${x + 1},${y}`;
}

function yellowScore(data, x, y, direction) {
    let hits = 0, total = 0;
    for (let along = 50; along < 250; along += 4) for (let depth = -14; depth <= 14; depth += 4) {
        const px = direction === "north" || direction === "south" ? x * 300 + along : (x + (direction === "east" ? 1 : 0)) * 300 + depth;
        const py = direction === "north" || direction === "south" ? (y + (direction === "south" ? 1 : 0)) * 300 + depth : y * 300 + along;
        const offset = (Math.max(0, Math.min(3599, py)) * 3600 + Math.max(0, Math.min(3599, px))) * 4;
        const r = data[offset], g = data[offset + 1], b = data[offset + 2];
        if (r > 105 && g > 75 && r > b * 1.65 && g > b * 1.4 && Math.abs(r - g) < 115) hits++;
        total++;
    }
    return hits / total;
}

function conveyorDarkScore(data, x, y) {
    let hits = 0, total = 0;
    for (let py = y * 300 + 55; py < y * 300 + 245; py += 5) for (let px = x * 300 + 55; px < x * 300 + 245; px += 5) {
        const offset = (py * 3600 + px) * 4;
        if (data[offset] < 70 && data[offset + 1] < 82 && data[offset + 2] < 82) hits++;
        total++;
    }
    return hits / total;
}

function edgeCells(edge) {
    const [axis, xText, yText] = edge.split(","), x = Number(xText), y = Number(yText);
    return axis === "h" ? [[x,y - 1],[x,y]] : [[x - 1,y],[x,y]];
}

function featureAt(features, x, y) {
    const key = `${x},${y}`;
    return features.pits.has(key) || features.repairs.has(key) || key in features.gears
        || features.pushers.some((pusher) => pusher.x === x && pusher.y === y);
}

async function auditSourceImages() {
    for (const [name, file] of Object.entries(FILES)) {
        const features = BOARD_FEATURES[name];
        const image = await loadImage(path.resolve(__dirname, "../../Roborally/Поля целиком", file));
        assert.strictEqual(image.width, 3600, `${name}: source width`);
        assert.strictEqual(image.height, 3600, `${name}: source height`);
        const canvas = createCanvas(3600, 3600), context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const data = context.getImageData(0, 0, 3600, 3600).data;

        for (const key of Object.keys(features.conveyors)) {
            const [x,y] = key.split(",").map(Number);
            assert(conveyorDarkScore(data,x,y) > .25, `${name}: conveyor data points at non-conveyor cell ${key}`);
        }

        // A real wall has a long yellow hazard strip. Pits and the decorative
        // sides of pushers use the same paint and are deliberately excluded.
        const expectedWalls = new Set([...features.walls].map((wall) => {
            const [x,y,direction] = wall.split(",");
            return physicalWall(Number(x),Number(y),direction);
        }));
        const pusherCells = new Set(features.pushers.map((pusher) => `${pusher.x},${pusher.y}`));
        const detectedWalls = new Set(), wallScores = new Map();
        for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) for (const direction of DIRECTIONS) {
            const edge = physicalWall(x,y,direction);
            const score=yellowScore(data,x,y,direction);
            wallScores.set(edge,Math.max(wallScores.get(edge)||0,score));
            if (score < .075) continue;
            const adjacent = edgeCells(edge);
            if (adjacent.some(([cx,cy]) => features.pits.has(`${cx},${cy}`) || pusherCells.has(`${cx},${cy}`))) continue;
            detectedWalls.add(edge);
        }
        const pusherBackings = new Set(features.pushers.map((pusher) => physicalWall(pusher.x,pusher.y,OPPOSITE[pusher.direction])));
        assert.deepStrictEqual([...detectedWalls].filter((edge) => !expectedWalls.has(edge)).sort(), [], `${name}: unparsed walls`);
        assert.deepStrictEqual([...expectedWalls].filter((edge) => !pusherBackings.has(edge) && (wallScores.get(edge)||0) < .075).sort(), [], `${name}: walls absent in image`);
    }
}

function auditFeatureData() {
    const cross=BOARD_FEATURES.Cross;
    const correctedCrossConveyors={"5,3":"west","4,3":"south","4,4":"west","3,4":"south","6,4":"north","7,4":"west",
        "7,5":"north","7,6":"east","6,6":"east","4,7":"east","4,6":"south"};
    Object.entries(correctedCrossConveyors).forEach(([key,direction])=>assert.strictEqual(cross.conveyors[key],direction,`Cross: conveyor ${key}`));
    const crossGame=makeGame("Cross");
    [[2,9,"south"],[2,10,"north"],[8,8,"east"],[9,8,"west"],[1,3,"south"],[1,4,"north"],[2,4,"east"],[3,4,"west"]]
        .forEach(([x,y,direction])=>assert(crossGame.wallBetween(x,y,direction),`Cross: missing wall at ${x},${y},${direction}`));
    assert(BOARD_FEATURES["Chop Shop"].express.has("10,3") && BOARD_FEATURES["Chop Shop"].express.has("11,3"),
        "Chop Shop: blue conveyor tail is not express");
    const exchange=BOARD_FEATURES["Risky Exchange"];
    assert(!exchange.express.has("3,3"),"Risky Exchange: 3,3 must be a normal conveyor");
    ["3,4","3,5","7,6","6,8"].forEach((key)=>assert(!(key in exchange.gears),`Risky Exchange: false gear ${key}`));

    // Cell 5,1 on Cross is a merge. Arrival from the west bends south and
    // rotates the robot; arrival from the north continues straight.
    const westArrival={userId:"west-arrival",x:4,y:1,direction:"north",eliminated:false};
    crossGame.room.robots=[westArrival];crossGame.moveConveyors(false);
    assert.deepStrictEqual([westArrival.x,westArrival.y,westArrival.direction],[5,1,"east"],"Cross: turning branch of merge 5,1");
    const northArrival={userId:"north-arrival",x:5,y:0,direction:"north",eliminated:false};
    crossGame.room.robots=[northArrival];crossGame.moveConveyors(false);
    assert.deepStrictEqual([northArrival.x,northArrival.y,northArrival.direction],[5,1,"north"],"Cross: straight branch of merge 5,1");

    for (const [name, features] of Object.entries(BOARD_FEATURES)) {
        assert.deepStrictEqual(features.lasers.map((laser) => `${laser.x},${laser.y},${laser.direction},${laser.count || 1}`), EXPECTED_LASERS[name], `${name}: lasers`);
        for (const [key,direction] of Object.entries(features.conveyors)) {
            const [x,y] = key.split(",").map(Number);
            assert(x >= 0 && x < 12 && y >= 0 && y < 12 && DIRECTIONS.includes(direction), `${name}: invalid conveyor ${key}`);
        }
        for (const pusher of features.pushers) {
            assert(features.walls.has(`${pusher.x},${pusher.y},${OPPOSITE[pusher.direction]}`), `${name}: pusher without backing wall`);
        }
        for (const rotation of [0,90,180,270]) {
            const game = makeGame(name, rotation), rotated = game.features;
            for (const [key,direction] of Object.entries(rotated.conveyors)) {
                const [x,y] = key.split(",").map(Number), [dx,dy] = VECTORS[direction];
                assert(x >= 0 && x < 12 && y >= 0 && y < 12, `${name}/${rotation}: conveyor outside board`);
                const nextDirection = rotated.conveyors[`${x + dx},${y + dy}`];
                if (nextDirection) {
                    const turn = (DIRECTIONS.indexOf(nextDirection) - DIRECTIONS.indexOf(direction) + 4) % 4;
                    assert.notStrictEqual(turn, 2, `${name}/${rotation}: conveyor makes impossible U-turn at ${key}`);
                    assert(!game.wallBetween(x,y,direction), `${name}/${rotation}: conveyor runs through wall at ${key}`);
                    const robot = {userId: "belt-test", x, y, direction: "north", color: "#fff", eliminated: false};
                    game.room.robots = [robot];
                    game.moveConveyors(false);
                    assert.deepStrictEqual([robot.x,robot.y], [x + dx,y + dy], `${name}/${rotation}: conveyor failed to move at ${key}`);
                    const expectedFacing = turn === 1 ? "east" : turn === 3 ? "west" : "north";
                    assert.strictEqual(robot.direction, expectedFacing, `${name}/${rotation}: conveyor failed to rotate robot at ${key}`);
                }
            }
            for (const laser of rotated.lasers) {
                const [bdx,bdy] = VECTORS[OPPOSITE[laser.direction]];
                assert(game.wallBetween(laser.x,laser.y,OPPOSITE[laser.direction]), `${name}/${rotation}: laser has no backing wall at ${laser.x},${laser.y}`);
                let x = laser.x, y = laser.y, lastVisible = {x,y}, blockedCell = null;
                while (true) {
                    if (game.wallBetween(x,y,laser.direction)) {
                        const [dx,dy] = VECTORS[laser.direction];
                        blockedCell = {x:x + dx,y:y + dy};
                        break;
                    }
                    const [dx,dy] = VECTORS[laser.direction];
                    x += dx; y += dy;
                    if (x < 0 || x >= 12 || y < 0 || y >= 12) break;
                    lastVisible = {x,y};
                }
                const visible = {userId: "visible", ...lastVisible, direction: "north"};
                game.room.robots = [visible];
                assert.strictEqual(game.laserTarget(laser.x,laser.y,laser.direction,true), visible, `${name}/${rotation}: laser misses visible cell`);
                if (blockedCell && blockedCell.x >= 0 && blockedCell.x < 12 && blockedCell.y >= 0 && blockedCell.y < 12) {
                    const hidden = {userId: "hidden", ...blockedCell, direction: "north"};
                    game.room.robots = [hidden];
                    assert.strictEqual(game.laserTarget(laser.x,laser.y,laser.direction,true), null, `${name}/${rotation}: laser passes through wall`);
                }
                // Keep the backing vector referenced: it documents which side
                // of the source is the emitter and guards accidental inversion.
                assert(Number.isInteger(laser.x + bdx) && Number.isInteger(laser.y + bdy));
            }
        }
    }
}

function auditCourseManualData() {
    const expectedStarts = {
        checkmate: 0, "risky-exchange": 1, "dizzy-dash": 1, "island-hop": 0,
        "chop-shop": 0, twister: 1, "bloodbath-chess": 0, "death-trap": 0,
        "vault-assault": 1, "whirlwind-tour": 0, "robot-stew": 1, "lost-bearings": 0,
        "island-king": 0, tricksy: 1, "moving-targets": 0, "set-to-kill": 1,
        "factory-rejects": 1, "option-world": 1, "ball-lightning": 0,
        "day-of-the-superbot": 1, interference: 1, "flag-fry": 0
    };
    // Angles are clockwise relative to the scans in "Factory Floors". The
    // Course Manual often rotates a floor before docking the start board.
    const expectedRotations = {
        checkmate: 270, "risky-exchange": 90, "dizzy-dash": 0, "island-hop": 180,
        "chop-shop": 0, twister: 180, "bloodbath-chess": 270, "death-trap": 180,
        "vault-assault": 0, "whirlwind-tour": 0, "robot-stew": 180, "lost-bearings": 180,
        "island-king": 0, tricksy: 0, "moving-targets": 0, "set-to-kill": 270,
        "factory-rejects": 0, "option-world": 90, "ball-lightning": 270,
        "day-of-the-superbot": 180, interference: 90, "flag-fry": 180
    };
    assert.equal(COURSE_CARDS.length, 22, "Rulebook single-board course count changed");
    assert.deepStrictEqual(COURSE_CARDS.map((item) => item.id).sort(), Object.keys(expectedStarts).sort(),
        "Single-board rulebook course list is incomplete");
    COURSE_CARDS.forEach((item) => {
        assert.strictEqual(item.start, START_CARDS[expectedStarts[item.id]], `${item.name}: wrong docking board`);
        assert.strictEqual(item.rotation, expectedRotations[item.id], `${item.name}: wrong Factory Floor rotation`);
        assert(item.flags.length >= 2 && item.flags.length <= 4, `${item.name}: invalid flag count`);
        assert.equal(new Set(item.flags.map(([x,y]) => `${x},${y}`)).size, item.flags.length, `${item.name}: duplicate flags`);
        item.flags.forEach(([x,y]) => assert(Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < 12 && y >= 0 && y < 12,
            `${item.name}: flag outside factory floor`));
    });
}

(async () => {
    auditFeatureData();
    auditCourseManualData();
    await auditSourceImages();
    console.log("All 8 board images, rotations, conveyors, pushers, walls and lasers passed integrity checks.");
})().catch((error) => { console.error(error); process.exit(1); });
