"use strict";

const path = require("path");

const DIRECTIONS = ["north", "east", "south", "west"];
const VECTORS = {
    north: {x: 0, y: -1},
    east: {x: 1, y: 0},
    south: {x: 0, y: 1},
    west: {x: -1, y: 0}
};
const ROBOT_COLORS = ["#f04444", "#2d82ff", "#ffd23f", "#27c56d", "#b66dff", "#ff8b38", "#32c8cb", "#f26bb4"];
const BOARD_SIZE = 12;
const STAGE_ROWS = 16;
const STEP_DELAY_MS = 360;
const PROGRAMMING_TIMER_MS = 30000;
const AUTO_FILL_DISPLAY_MS = 900;
const BOARD_CARDS = {
    Cross: "Cross.png", "Spin Zone": "Spin.png", "Chess": "Chess.png", "Chop Shop": "ChopShop.png",
    "Risky Exchange": "exchange.png", "Island": "Island.png", "Maelstrom": "Maelstrom.png", "Vault": "Vault.png"
};
const BOARD_IMAGES = {
    Cross: "/roborally/assets/boards/cross.webp", "Spin Zone": "/roborally/assets/boards/spin.webp",
    Chess: "/roborally/assets/boards/chess.webp", "Chop Shop": "/roborally/assets/boards/chop-shop.webp",
    "Risky Exchange": "/roborally/assets/boards/risky-exchange.webp", Island: "/roborally/assets/boards/island.webp",
    Maelstrom: "/roborally/assets/boards/maelstrom.webp", Vault: "/roborally/assets/boards/vault.webp"
};
const START_CARDS = ["Старт 1.jpg", "Старт 2.jpg"];
const START_IMAGES = {
    [START_CARDS[0]]: "/roborally/assets/boards/start-1.webp",
    [START_CARDS[1]]: "/roborally/assets/boards/start-2.webp"
};
const START_LAYOUTS = {
    [START_CARDS[0]]: {
        starts: [{x:5,y:14},{x:6,y:14},{x:3,y:14},{x:8,y:14},{x:1,y:14},{x:10,y:14},{x:0,y:14},{x:11,y:14}],
        conveyors: {}, express: new Set(),
        walls: cells(`2,12,north 4,12,north 7,12,north 9,12,north
            1,14,west 3,14,west 5,14,west 6,14,west 7,14,west 9,14,west 11,14,west
            2,15,south 4,15,south 7,15,south 9,15,south`)
    },
    [START_CARDS[1]]: {
        starts: [{x:5,y:15},{x:6,y:15},{x:3,y:14},{x:8,y:14},{x:1,y:13},{x:10,y:13},{x:0,y:12},{x:11,y:12}],
        conveyors: mapped(`0,14,east 1,14,east 2,14,south 9,14,south 10,14,west 11,14,west
            2,15,east 3,15,east 4,15,east 7,15,west 8,15,west 9,15,west`),
        express: new Set(),
        walls: cells(`2,12,north 4,12,north 7,12,north 9,12,north 4,12,west 7,12,east
            1,13,west 1,13,east 10,13,west 10,13,east 6,14,west 6,15,west`)
    }
};
const COURSE_SPECIAL_RULES = {
    "moving-targets": {description: "В каждой фазе регистра флаги движутся конвейерами как роботы. Упавший в яму флаг возвращается в исходную клетку в начале следующей фазы регистра.", status: "implemented", statusText: "Реализовано.", movingFlags: true},
    "set-to-kill": {description: "Каждый лазер робота наносит 2 повреждения.", status: "implemented", statusText: "Реализовано.", robotLaserDamage: 2},
    "factory-rejects": {description: "Все роботы начинают с 2 повреждениями и не могут использовать Power Down.", status: "implemented", statusText: "Реализовано.", startingDamage: 2, disablePowerDown: true},
    "ball-lightning": {description: "На программирование каждого раунда всем игрокам даётся только 30 секунд; незаполненные регистры заполняются случайно.", status: "implemented", statusText: "Реализовано.", programmingSeconds: 30},
    // Tight Collar uses the same mechanism with 60 seconds, but the course
    // itself remains omitted because it requires two Factory Floor boards.
    "tight-collar": {description: "На программирование каждого раунда всем игрокам даётся 60 секунд; незаполненные регистры заполняются случайно.", status: "implemented", statusText: "Механика таймера реализована.", programmingSeconds: 60}
};
const course = (id, name, board, start, players, length, level, flags, rotation = 0) => {
    const [min, max = min] = players.split("–").map(Number);
    return {id, name, board, start, rotation: normalizeRotation(rotation), players, min, max, length, level, flags,
        specialRules: COURSE_SPECIAL_RULES[id] || null};
};
const COURSE_CARDS = [
    // Every non-team course in the rulebook that uses one Factory Floor.
    // Multi-board courses are intentionally omitted: the lobby and rules
    // engine represent a single 12x12 floor plus one docking bay.
    course("checkmate", "Checkmate", "Chess", START_CARDS[0], "5–8", "короткая", "лёгкая", [[7,2],[3,8]], 270),
    course("risky-exchange", "Risky Exchange", "Risky Exchange", START_CARDS[1], "2–8", "средняя", "лёгкая", [[7,1],[9,7],[1,4]], 90),
    course("dizzy-dash", "Dizzy Dash", "Spin Zone", START_CARDS[1], "2–8", "короткая", "лёгкая", [[5,4],[10,11],[1,6]]),
    course("island-hop", "Island Hop", "Island", START_CARDS[0], "2–8", "средняя", "средняя", [[6,1],[1,6],[11,4]], 180),
    course("chop-shop", "Chop Shop Challenge", "Chop Shop", START_CARDS[0], "2–4", "средняя", "средняя", [[4,9],[9,11],[1,10],[11,7]]),
    course("twister", "Twister", "Spin Zone", START_CARDS[1], "5–8", "средняя", "средняя", [[2,9],[3,2],[9,2],[8,9]], 180),
    course("bloodbath-chess", "Bloodbath Chess", "Chess", START_CARDS[0], "2–4", "средняя", "средняя", [[6,5],[2,9],[8,7],[3,4]], 270),
    course("death-trap", "Death Trap", "Island", START_CARDS[0], "2–4", "короткая", "сложная", [[7,7],[0,4],[6,5]], 180),
    course("vault-assault", "Vault Assault", "Vault", START_CARDS[1], "2–4", "короткая", "эксперт", [[6,3],[4,10],[8,5]]),
    course("whirlwind-tour", "Whirlwind Tour", "Maelstrom", START_CARDS[0], "5–8", "средняя", "эксперт", [[8,0],[3,11],[11,6]]),
    course("robot-stew", "Robot Stew", "Chop Shop", START_CARDS[1], "2–4", "средняя", "эксперт", [[0,4],[9,7],[2,10]], 180),
    course("lost-bearings", "Lost Bearings", "Cross", START_CARDS[0], "2–4", "средняя", "эксперт", [[1,2],[10,9],[2,8]], 180),
    course("island-king", "Island King", "Island", START_CARDS[0], "5–8", "короткая", "эксперт", [[5,4],[7,7],[5,6]]),
    course("tricksy", "Tricksy", "Cross", START_CARDS[1], "2–4", "длинная", "эксперт", [[9,1],[0,1],[8,11],[3,7]]),
    course("moving-targets", "Moving Targets", "Maelstrom", START_CARDS[0], "2–8", "средняя", "эксперт", [[1,0],[10,11],[11,5],[0,6]]),
    course("set-to-kill", "Set to Kill", "Risky Exchange", START_CARDS[1], "5–8", "средняя", "эксперт", [[5,0],[2,11],[10,9],[2,4]], 270),
    course("factory-rejects", "Factory Rejects", "Chop Shop", START_CARDS[1], "5–8", "короткая", "эксперт", [[7,1],[4,11],[2,4]]),
    course("option-world", "Option World", "Vault", START_CARDS[1], "2–8", "средняя", "эксперт", [[3,5],[9,1],[5,8],[2,0]], 90),
    course("ball-lightning", "Ball Lightning", "Spin Zone", START_CARDS[0], "2–8", "короткая", "эксперт", [[7,5],[2,2],[5,9],[10,0]], 270),
    course("day-of-the-superbot", "Day of the SuperBot", "Maelstrom", START_CARDS[1], "5–8", "средняя", "эксперт", [[8,0],[0,5]], 180),
    course("interference", "Interference", "Chess", START_CARDS[1], "2–4", "средняя", "эксперт", [[5,2],[7,8],[0,0]], 90),
    course("flag-fry", "Flag Fry", "Cross", START_CARDS[0], "2–8", "короткая", "эксперт", [[3,3],[9,3],[3,10]], 180)
];

// Yellow hazard strips shared by all full-size cards. Gaps are intentionally
// left open: a robot that crosses an open outer edge falls off the course.
const COMMON_WALLS = new Set([
    "2,0,north", "4,0,north", "7,0,north", "9,0,north",
    "0,2,west", "0,4,west", "0,7,west", "0,9,west",
    "11,2,east", "11,4,east", "11,7,east", "11,9,east",
    "2,11,south", "4,11,south", "7,11,south", "9,11,south"
]);

// The source cards are 3600×3600 with 300 px cells: exactly 12×12.
const CROSS_FEATURES = {
    size: BOARD_SIZE,
    pits: new Set(["9,2", "1,4", "2,4", "5,4", "4,5", "5,5", "6,5", "5,6", "9,8", "2,10", "0,11"]),
    repairs: new Set(["11,0", "3,3", "0,9"]),
    gears: {},
    conveyors: {
        "1,0": "south", "5,0": "south", "6,0": "north", "10,0": "north",
        "1,1": "east", "2,1": "east", "3,1": "east", "4,1": "east", "5,1": "south", "6,1": "north", "10,1": "north", "11,1": "west",
        "5,2": "south", "6,2": "north", "4,3": "south", "5,3": "west", "6,3": "north",
        "3,4": "south", "4,4": "west", "6,4": "north", "7,4": "west",
        "0,5": "west", "1,5": "west", "2,5": "west", "3,5": "west", "7,5": "north", "8,5": "west", "9,5": "west", "10,5": "west", "11,5": "west",
        "0,6": "east", "1,6": "east", "2,6": "east", "3,6": "east", "4,6": "south", "6,6": "east", "7,6": "east", "8,6": "east", "9,6": "east", "10,6": "east", "11,6": "east",
        "4,7": "east", "5,7": "south", "6,7": "north", "5,8": "south", "6,8": "north",
        "5,9": "south", "6,9": "north",
        "0,10": "east", "1,10": "south", "5,10": "south", "6,10": "north", "7,10": "west", "8,10": "west", "9,10": "west", "10,10": "west",
        "1,11": "south", "5,11": "south", "6,11": "north", "10,11": "north"
    },
    express: new Set(),
    hintConnections: ["4,3|5,3"],
    conveyorTurns: {},
    pushers: [],
    walls: new Set([...COMMON_WALLS,
        "8,1,north", "9,1,north", "10,1,west", "7,2,west", "1,3,east", "4,3,north", "4,3,west",
        "7,3,south", "7,3,west", "1,4,north", "3,4,north", "3,4,west", "8,4,north", "10,4,north", "9,5,north",
        "2,7,north", "7,7,north", "7,7,west", "1,8,north", "2,8,west", "3,8,north", "4,8,north",
        "4,8,west", "7,8,west", "9,8,west", "10,8,north", "8,9,west", "2,10,north", "7,11,east"
    ]),
    lasers: [
        {x: 4, y: 2, direction: "north", count: 1},
        {x: 8, y: 3, direction: "north", count: 2},
        {x: 2, y: 8, direction: "east", count: 1},
        {x: 7, y: 8, direction: "east", count: 1}
    ]
};
const EMPTY_FEATURES = {pits: new Set(), repairs: new Set(), gears: {}, conveyors: {}, express: new Set(), hintConnections: [], conveyorTurns: {}, pushers: [], walls: new Set(), lasers: []};

function cells(text) {
    return new Set(String(text || "").trim().split(/\s+/).filter(Boolean));
}

function mapped(text, valueParser = (value) => value) {
    const result = {};
    String(text || "").trim().split(/\s+/).filter(Boolean).forEach((entry) => {
        const [x, y, value] = entry.split(",");
        result[`${x},${y}`] = valueParser(value);
    });
    return result;
}

function boardFeatures({pits = "", repairs = "", gears = "", conveyors = "", express = "", walls = "", lasers = [], pushers = [], hintConnections = []}) {
    const pusherWalls = pushers.map((pusher) => `${pusher.x},${pusher.y},${rotate(pusher.direction, 2)}`);
    return {size: BOARD_SIZE, pits: cells(pits), repairs: cells(repairs), gears: mapped(gears, Number),
        conveyors: mapped(conveyors), express: cells(express), hintConnections, conveyorTurns: {},
        walls: new Set([...COMMON_WALLS, ...cells(walls), ...pusherWalls]), lasers, pushers};
}

const CHESS_FEATURES = boardFeatures({
    pits: "8,3 4,5 7,6 5,8",
    repairs: "0,0 6,5 5,6 11,11",
    conveyors: `1,1,east 2,1,east 3,1,east 4,1,east 5,1,east 6,1,east 7,1,east 8,1,east 9,1,east 10,1,south
        1,2,north 3,2,south 5,2,south 7,2,south 9,2,south 10,2,south
        1,3,north 2,3,south 4,3,south 6,3,south 10,3,south
        1,4,north 3,4,south 5,4,south 7,4,south 9,4,south 10,4,south
        1,5,north 2,5,south 8,5,south 10,5,south
        1,6,north 3,6,north 9,6,north 10,6,south
        1,7,north 2,7,north 4,7,north 6,7,north 8,7,north 10,7,south
        1,8,north 3,8,north 7,8,north 9,8,north 10,8,south
        1,9,north 2,9,north 4,9,north 6,9,north 8,9,north 10,9,south
        1,10,north 2,10,west 3,10,west 4,10,west 5,10,west 6,10,west 7,10,west 8,10,west 9,10,west 10,10,west`,
    express: "1,1 2,1 3,1 4,1 5,1 6,1 7,1 8,1 9,1 10,1 1,2 10,2 1,3 10,3 1,4 10,4 1,5 10,5 1,6 10,6 1,7 10,7 1,8 10,8 1,9 10,9 1,10 2,10 3,10 4,10 5,10 6,10 7,10 8,10 9,10 10,10",
    walls: "3,2,north 5,2,north 6,2,north 8,2,north 2,3,west 10,3,west 2,5,west 10,5,west 2,6,west 10,6,west 2,8,west 10,8,west 3,10,north 5,10,north 6,10,north 8,10,north"
});

const SPIN_FEATURES = boardFeatures({
    repairs: "2,3 8,3 3,8 9,8",
    gears: "2,2,1 3,3,1 8,2,1 9,3,1 2,8,1 3,9,1 8,8,1 9,9,1 5,2,-1 6,4,-1 4,5,-1 9,5,-1 2,6,-1 7,6,-1 5,7,-1 6,9,-1",
    conveyors: `1,1,east 2,1,east 3,1,east 4,1,south 1,2,north 4,2,south 1,3,north 4,3,south 1,4,north 2,4,west 3,4,west 4,4,west
        7,1,east 8,1,east 9,1,east 10,1,south 7,2,north 10,2,south 7,3,north 10,3,south 7,4,north 8,4,west 9,4,west 10,4,west
        1,7,east 2,7,east 3,7,east 4,7,south 1,8,north 4,8,south 1,9,north 4,9,south 1,10,north 2,10,west 3,10,west 4,10,west
        7,7,east 8,7,east 9,7,east 10,7,south 7,8,north 10,8,south 7,9,north 10,9,south 7,10,north 8,10,west 9,10,west 10,10,west`,
    express: "1,1 2,1 3,1 4,1 1,2 4,2 1,3 4,3 1,4 2,4 3,4 4,4 7,1 8,1 9,1 10,1 7,2 10,2 7,3 10,3 7,4 8,4 9,4 10,4 1,7 2,7 3,7 4,7 1,8 4,8 1,9 4,9 1,10 2,10 3,10 4,10 7,7 8,7 9,7 10,7 7,8 10,8 7,9 10,9 7,10 8,10 9,10 10,10",
    walls: "3,2,south 5,3,west 6,3,east 3,6,south 5,8,west 6,8,east 8,5,north 8,8,south",
    lasers: [{x: 3, y: 6, direction: "north", count: 1}, {x: 8, y: 5, direction: "south", count: 1},
        {x: 6, y: 3, direction: "west", count: 1}, {x: 5, y: 8, direction: "east", count: 1}]
});

const EXCHANGE_FEATURES = boardFeatures({
    pits: "1,9 10,11", repairs: "11,0 0,11 2,2 7,4",
    gears: "1,1,1 10,1,1 8,3,-1 3,8,-1 8,8,-1",
    conveyors: `1,0,south 3,0,north 5,0,south 6,0,north 8,0,south 10,0,north 0,1,west 3,1,north 5,1,south 6,1,north 8,1,south 11,1,west
        3,2,north 5,2,south 6,2,north 8,2,south 0,3,east 1,3,east 2,3,east 3,3,east 5,3,south 6,3,north 9,3,east 10,3,east 11,3,east
        5,4,south 6,4,north 0,5,west 1,5,west 2,5,west 3,5,west 4,5,west 7,5,west 8,5,west 9,5,west 10,5,west
        0,6,east 1,6,east 2,6,east 3,6,east 4,6,east 7,6,east 8,6,east 9,6,east 10,6,east 11,6,east
        5,7,south 6,7,north 0,8,west 1,8,west 2,8,west 5,8,south 6,8,north 9,8,west 10,8,west 11,8,west
        3,9,north 5,9,south 6,9,north 8,9,south 3,10,north 5,10,south 6,10,north 8,10,south 1,11,south 3,11,north 5,11,south 8,11,south`,
    express: "3,0 6,0 3,1 6,1 3,2 6,2 6,3 6,4 7,6 8,6 9,6 10,6 11,6",
    walls: "9,1,west 2,3,north 4,4,east 7,4,south 7,4,west 4,5,north 4,7,north 4,7,east 7,7,north 7,7,west 10,9,north 11,10,west",
    lasers: [{x: 2, y: 0, direction: "south", count: 1}]
});

const ISLAND_FEATURES = boardFeatures({
    pits: "1,1 2,1 1,2 9,1 10,1 10,2 6,4 7,4 7,5 4,6 4,7 5,7 1,9 1,10 2,10 10,9 9,10 10,10",
    repairs: "6,5 0,9",
    gears: "2,2,1 9,2,1 3,3,-1 8,3,-1 3,8,-1 8,8,-1",
    conveyors: `3,2,east 4,2,east 5,2,east 6,2,east 7,2,east 8,2,east 2,3,north 4,3,west 5,3,west 6,3,west 7,3,west 9,3,south
        2,4,north 3,4,south 8,4,north 9,4,south 2,5,north 3,5,south 4,5,west 5,5,west 8,5,north 9,5,south
        2,6,north 3,6,south 6,6,east 7,6,east 8,6,north 9,6,south 2,7,north 3,7,south 8,7,north 9,7,south
        2,8,north 4,8,east 5,8,east 6,8,east 7,8,east 9,8,south
        2,9,west 3,9,west 4,9,west 5,9,west 6,9,west 7,9,west 8,9,west 9,9,south`,
    walls: "5,3,north 3,5,west 9,6,west 5,9,north"
});

const CHOP_SHOP_FEATURES = boardFeatures({
    pits: "10,1 2,5 5,7 2,9 8,9", repairs: "11,0 2,2 6,5 7,9 0,11",
    gears: "6,2,1 3,4,1 6,8,1 5,2,-1 3,5,-1 7,6,-1 3,8,-1",
    conveyors: `5,0,south 6,0,north 0,1,west 2,1,west 3,1,west 4,1,west 5,1,west 6,1,north
        0,3,east 1,3,east 2,3,east 4,3,east 5,3,east 6,3,east 7,3,east 8,3,east 9,3,east 10,3,east 11,3,east
        9,4,north 7,5,south 9,5,north 10,5,west 11,5,west 4,6,west 5,6,west 6,6,west 8,6,east 9,6,east 10,6,east 11,6,east
        6,7,north 0,8,west 1,8,west 2,8,west 9,8,west 10,8,west 11,8,west
        3,9,north 6,9,north 9,9,west 10,9,west 3,10,north 6,10,north 10,10,north 3,11,north 6,11,north 10,11,north`,
    express: "4,3 5,3 6,3 7,3 8,3 9,3 10,3 11,3 9,4 9,5 10,5 11,5",
    walls: "1,1,north 1,2,north 4,2,west 10,2,west 3,3,north 10,3,north 8,5,north 8,5,west 6,6,north 10,6,north 1,7,north 3,7,north 5,8,west 8,8,west 1,10,north 5,10,west",
    lasers: [{x: 1, y: 1, direction: "south", count: 3}, {x: 4, y: 2, direction: "east", count: 1},
        {x: 3, y: 6, direction: "north", count: 2}, {x: 10, y: 5, direction: "north", count: 1},
        {x: 1, y: 7, direction: "south", count: 1}, {x: 5, y: 8, direction: "east", count: 1}]
});

const VAULT_FEATURES = boardFeatures({
    pits: "3,2 8,2 3,9 8,9", repairs: "0,0 5,5 6,5 5,6 6,6 11,11", gears: "0,1,1 1,8,1",
    conveyors: `3,0,north 6,0,north 10,0,north 1,1,east 2,1,east 3,1,north 6,1,north 10,1,north 0,2,south 10,2,north
        0,3,east 1,3,south 10,3,north 1,4,south 1,5,south 1,6,south 10,6,east 11,6,east 1,7,south 10,7,north
        0,8,west 10,8,north 10,9,north 0,10,east 1,10,south 6,10,east 7,10,east 8,10,east 9,10,east 10,10,north 1,11,south 6,11,north`,
    express: "3,0 6,0 1,1 2,1 3,1 6,1",
    walls: "5,1,west 5,3,north 6,3,north 4,4,north 4,4,west 7,4,north 7,4,east 3,5,west 9,5,west 3,6,west 9,6,west 4,7,south 4,7,west 7,7,east 8,7,west 2,8,north 4,8,north 7,8,north 5,9,north 6,9,north",
    lasers: [{x: 0, y: 4, direction: "east", count: 1}, {x: 11, y: 4, direction: "west", count: 1},
        {x: 0, y: 7, direction: "east", count: 1}, {x: 11, y: 7, direction: "west", count: 1}, {x: 2, y: 8, direction: "south", count: 1}],
    pushers: [{x: 5, y: 1, direction: "east", active: [2,4]}, {x: 6, y: 2, direction: "north", active: [1,3,5]},
        {x: 2, y: 6, direction: "west", active: [1,3,5]}, {x: 9, y: 5, direction: "east", active: [1,3,5]},
        {x: 9, y: 6, direction: "east", active: [2,4]}, {x: 6, y: 9, direction: "south", active: [1,3,5]}]
});

const MAELSTROM_FEATURES = boardFeatures({
    pits: "5,5 6,5 5,6 6,6", repairs: "0,0 0,8 11,11",
    conveyors: `1,0,south 5,0,south 6,0,north 1,1,east 2,1,east 3,1,east 4,1,east 5,1,east 6,1,east 7,1,east 8,1,east 9,1,east 10,1,south 11,1,west
        1,2,east 2,2,east 3,2,east 4,2,east 5,2,east 6,2,east 7,2,east 8,2,east 9,2,south 10,2,south
        1,3,north 2,3,east 3,3,east 4,3,east 5,3,east 6,3,east 7,3,east 8,3,south 9,3,south 10,3,south
        1,4,north 2,4,north 3,4,east 4,4,east 5,4,east 6,4,east 7,4,south 8,4,south 9,4,south 10,4,south
        0,5,west 1,5,north 2,5,north 3,5,north 4,5,east 7,5,south 8,5,south 9,5,south 10,5,south 11,5,west
        0,6,east 1,6,north 2,6,north 3,6,north 4,6,north 7,6,west 8,6,south 9,6,south 10,6,south
        1,7,north 2,7,north 3,7,north 4,7,north 5,7,west 6,7,west 7,7,west 8,7,west 9,7,south 10,7,south
        1,8,north 2,8,north 3,8,north 4,8,west 5,8,west 6,8,west 7,8,west 8,8,west 9,8,west 10,8,south
        1,9,north 2,9,north 3,9,west 4,9,west 5,9,west 6,9,west 7,9,west 8,9,west 9,9,west 10,9,west
        0,10,east 1,10,north 2,10,west 3,10,west 4,10,west 5,10,west 6,10,west 7,10,west 8,10,west 9,10,west 10,10,west 6,11,north 10,11,north`,
    express: "1,2 2,2 3,2 4,2 5,2 6,2 7,2 8,2 9,2 1,3 9,3 1,4 3,4 4,4 5,4 6,4 7,4 9,4 1,5 3,5 7,5 9,5 0,6 1,6 3,6 7,6 9,6 1,7 3,7 9,7 1,8 3,8 4,8 5,8 6,8 7,8 8,8 9,8 1,9 0,10 1,10 2,10 3,10 4,10 5,10 6,10 7,10 8,10 9,10 10,10 6,11 10,11",
    walls: "5,3,north 6,4,north 4,5,west 9,5,west 3,6,west 8,6,west 5,8,north 6,9,north",
    lasers: [{x: 4, y: 5, direction: "east", count: 1}, {x: 3, y: 6, direction: "east", count: 1},
        {x: 5, y: 7, direction: "north", count: 1}, {x: 6, y: 8, direction: "north", count: 1}],
    pushers: [
        {x:2,y:0,direction:"south",active:[2,4]},{x:4,y:0,direction:"south",active:[1,3,5]},{x:7,y:0,direction:"south",active:[1,3,5]},{x:9,y:0,direction:"south",active:[2,4]},
        {x:0,y:2,direction:"east",active:[2,4]},{x:0,y:4,direction:"east",active:[1,3,5]},{x:0,y:7,direction:"east",active:[1,3,5]},{x:0,y:9,direction:"east",active:[2,4]},
        {x:11,y:2,direction:"west",active:[2,4]},{x:11,y:4,direction:"west",active:[1,3,5]},{x:11,y:7,direction:"west",active:[1,3,5]},{x:11,y:9,direction:"west",active:[2,4]},
        {x:2,y:11,direction:"north",active:[2,4]},{x:4,y:11,direction:"north",active:[1,3,5]},{x:7,y:11,direction:"north",active:[1,3,5]},{x:9,y:11,direction:"north",active:[2,4]}
    ]
});

const BOARD_FEATURES = {Cross: CROSS_FEATURES, Chess: CHESS_FEATURES, "Spin Zone": SPIN_FEATURES,
    "Risky Exchange": EXCHANGE_FEATURES, Island: ISLAND_FEATURES, "Chop Shop": CHOP_SHOP_FEATURES,
    Vault: VAULT_FEATURES, Maelstrom: MAELSTROM_FEATURES};

function normalizeRotation(rotation) {
    const value = Number(rotation) || 0;
    return [0, 90, 180, 270].includes(value) ? value : 0;
}

function rotatePoint(x, y, rotation) {
    switch (normalizeRotation(rotation)) {
    case 90: return {x: BOARD_SIZE - 1 - y, y: x};
    case 180: return {x: BOARD_SIZE - 1 - x, y: BOARD_SIZE - 1 - y};
    case 270: return {x: y, y: BOARD_SIZE - 1 - x};
    default: return {x, y};
    }
}

function orientFeatures(features, rotation) {
    const quarterTurns = normalizeRotation(rotation) / 90;
    if (!quarterTurns) return features;
    const pointKey = (key) => {
        const [x, y] = key.split(",").map(Number);
        const point = rotatePoint(x, y, rotation);
        return positionKey(point.x, point.y);
    };
    const mappedCells = (source) => new Set([...source].map(pointKey));
    const mappedValues = (source, directionValues = false) => Object.fromEntries(Object.entries(source).map(([key, value]) =>
        [pointKey(key), directionValues ? rotate(value, quarterTurns) : value]));
    return {
        size: BOARD_SIZE,
        pits: mappedCells(features.pits),
        repairs: mappedCells(features.repairs),
        gears: mappedValues(features.gears),
        conveyors: mappedValues(features.conveyors, true),
        express: mappedCells(features.express),
        hintConnections: (features.hintConnections || []).map((connection) => connection.split("|").map(pointKey).join("|")),
        conveyorTurns: mappedValues(features.conveyorTurns || {}),
        walls: new Set([...features.walls].map((wall) => {
            const [x, y, direction] = wall.split(",");
            const point = rotatePoint(Number(x), Number(y), rotation);
            return `${point.x},${point.y},${rotate(direction, quarterTurns)}`;
        })),
        lasers: features.lasers.map((laser) => ({...rotatePoint(laser.x, laser.y, rotation),
            direction: rotate(laser.direction, quarterTurns), count: laser.count})),
        pushers: features.pushers.map((pusher) => ({...rotatePoint(pusher.x, pusher.y, rotation),
            direction: rotate(pusher.direction, quarterTurns), active: [...pusher.active]}))
    };
}

function positionKey(x, y) {
    return `${x},${y}`;
}

function rotate(direction, amount) {
    return DIRECTIONS[(DIRECTIONS.indexOf(direction) + amount + 4) % 4];
}

function conveyorArrivalTurn(incomingDirection, outgoingDirection) {
    if (!incomingDirection || !outgoingDirection) return 0;
    const difference=(DIRECTIONS.indexOf(outgoingDirection)-DIRECTIONS.indexOf(incomingDirection)+4)%4;
    return difference===1?1:difference===3?-1:0;
}

function makeDeck() {
    const cards = [];
    let id = 1;
    const add = (type, label, count, startPriority, step) => {
        for (let index = 0; index < count; index++)
            cards.push({id: `card-${id++}`, type, label, priority: startPriority + index * step});
    };
    add("move1", "Вперёд 1", 18, 490, 10);
    add("move2", "Вперёд 2", 12, 670, 10);
    add("move3", "Вперёд 3", 6, 790, 10);
    add("backup", "Назад", 6, 430, 10);
    add("left", "Повернуть влево", 18, 70, 20);
    add("right", "Повернуть вправо", 18, 80, 20);
    add("uturn", "Разворот", 6, 10, 10);
    return cards;
}

function publicFieldFeatures(factory, start) {
    return {
        pits: [...factory.pits],
        repairs: [...factory.repairs],
        gears: {...factory.gears},
        starts: (start.starts || []).map((point, slot) => ({...point, slot: slot + 1})),
        conveyors: {...factory.conveyors, ...(start.conveyors || {})},
        express: [...factory.express, ...((start.express && [...start.express]) || [])],
        hintConnections: [...(factory.hintConnections || [])],
        walls: [...factory.walls, ...((start.walls && [...start.walls]) || [])],
        lasers: factory.lasers.map((laser) => ({...laser})),
        pushers: factory.pushers.map((pusher) => ({...pusher, active: [...(pusher.active || [])]}))
    };
}

function shuffle(items) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index--) {
        const next = Math.floor(Math.random() * (index + 1));
        [result[index], result[next]] = [result[next], result[index]];
    }
    return result;
}

function wait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function init(wsServer, gamePath) {
    const app = wsServer.app;
    const registry = wsServer.users;
    registry.handleAppPage(gamePath, path.join(__dirname, "public", "app.html"));
    app.use("/roborally", wsServer.static(path.join(__dirname, "public")));

    class GameState extends wsServer.users.RoomState {
        constructor(hostId, hostData, userRegistry) {
            super(hostId, hostData, userRegistry, registry.games.roborally.id, gamePath);
            this.players = {};
            this.deck = [];
            this.discard = [];
            this.laserEventCounter = 0;
            this.boardEventCounter = 0;
            this.programmingTimerHandle = null;
            this.programmingTimerGeneration = 0;
            this.autoFillResolveHandle = null;
            this.room = {
                ...this.room,
                inited: true,
                title: "RoboRally",
                hostId,
                phase: "lobby",
                round: 0,
                register: null,
                playerNames: {},
                playerSlots: Array(8).fill(null),
                playerColors: {},
                startAssignments: {},
                onlinePlayers: new Set(),
                spectators: new Set(),
                robots: [],
                flags: [],
                log: ["Комната создана. Выберите роль игрока или зрителя."],
                winnerId: null,
                resolution: null,
                laserShots: [],
                boardEvents: [],
                programmingTimer: null,
                programmingAutoFill: null,
                powerDownChoice: null,
                board: {name: "Cross", size: BOARD_SIZE, start: START_CARDS[1]},
                course: {...COURSE_CARDS.find((course) => course.id === "lost-bearings")},
                courses: COURSE_CARDS,
                robotColors: ROBOT_COLORS,
                boardCards: BOARD_CARDS,
                boardImages: BOARD_IMAGES,
                startCards: START_CARDS,
                startImages: START_IMAGES
            };
        }

        publicState() {
            const showPrograms = this.room.phase === "resolving" || this.room.phase === "finished";
            const revealed = showPrograms ? (this.room.revealedRegisters || 0) : 0;
            const startLayout = START_LAYOUTS[this.room.course.start] || START_LAYOUTS[START_CARDS[1]];
            return {
                ...this.room,
                startPositions: startLayout.starts.map((position) => ({...position})),
                fieldFeatures: publicFieldFeatures(this.features, this.startFeatures),
                programs: Object.fromEntries(this.room.playerSlots.filter((userId) => userId && this.players[userId]).map((userId) => {
                    const player = this.players[userId];
                    const cards = player.selected.map((id) => this.cardById(player, id));
                    return [userId, {poweredDown: player.poweredDown,
                        lockedRegisters: player.lockedRegisters || [],
                        cards: cards.map((card, index) => (player.lockedRegisters || []).includes(index)
                            || (showPrograms && index < revealed) ? card : null)}];
                })),
                playerStats: Object.fromEntries(Object.entries(this.players).map(([userId, player]) => [userId, {
                    damage: player.damage,
                    lives: player.lives,
                    checkpoints: player.checkpoints,
                    ready: !!player.locked,
                    poweredDown: player.poweredDown,
                    powerDownNextRound: player.powerDownNextRound,
                }])),
                onlinePlayers: [...this.room.onlinePlayers],
                spectators: [...this.room.spectators],
                robots: this.room.robots.map((robot) => ({...robot})),
                log: this.room.log.slice(-12)
            };
        }

        privateState(userId) {
            const player = this.players[userId];
            const powerDownDisabled = !!this.specialRules.disablePowerDown;
            return player ? {
                hand: player.hand,
                selected: player.selected,
                registerCards: player.selected.map((id) => this.cardById(player, id)),
                lockedRegisters: player.lockedRegisters || [],
                locked: player.locked,
                autoFilledRegisters: player.autoFilledRegisters || [],
                damage: player.damage,
                lives: player.lives,
                checkpoints: player.checkpoints,
                poweredDown: player.poweredDown,
                powerDownIntent: player.powerDownIntent,
                canPowerDown: player.damage > 0 && !player.poweredDown && !powerDownDisabled,
                powerDownUnavailableReason: powerDownDisabled ? "Курс запрещает Power Down"
                    : player.damage <= 0 ? "Power Down доступен только повреждённому роботу" : null,
                powerDownChoice: this.room.phase === "power-down-choice" ? {
                    eligible: (this.powerDownChoiceUsers || []).includes(userId),
                    answered: !!(this.powerDownChoices && this.powerDownChoices.has(userId)),
                    choice: this.powerDownChoices && this.powerDownChoices.has(userId) ? this.powerDownChoices.get(userId) : null
                } : null,
                resolving: this.room.phase === "resolving",
                reentry: this.room.phase === "reentry" ? {
                    active: this.room.reentryUserId === userId,
                    candidates: this.room.reentryUserId === userId ? this.reentryCandidates(userId) : [],
                    needsPowerDownChoice: this.room.reentryUserId === userId && !!player.powerDownReentryChoiceRequired
                } : null
            } : {hand: [], selected: [], registerCards: [], lockedRegisters: [], locked: false};
        }

        addLog(text) {
            this.room.log.push(text);
            if (this.room.log.length > 30)
                this.room.log.splice(0, this.room.log.length - 30);
        }

        clearBoardEvents() {
            this.room.boardEvents = [];
        }

        addBoardEvent(type, robot, details = {}) {
            if (!robot)
                return null;
            const death = robot.death || {};
            const x = details.x == null ? (robot.x == null ? death.x : robot.x) : details.x;
            const y = details.y == null ? (robot.y == null ? death.y : robot.y) : details.y;
            if (!Number.isFinite(x) || !Number.isFinite(y))
                return null;
            const event = {
                id: ++this.boardEventCounter,
                type,
                userId: robot.userId,
                color: robot.color,
                ...details,
                x,
                y
            };
            this.room.boardEvents.push(event);
            return event;
        }

        randomizeStartAssignments(requireChange = false) {
            const users = this.room.playerSlots.filter(Boolean);
            const previous = this.room.startAssignments || {};
            let positions = users.map((unused, index) => index);
            let attempts = 0;
            do {
                positions = shuffle(positions);
                attempts += 1;
            } while (requireChange && users.length > 1 && attempts < 100
                && users.every((userId, index) => previous[userId] === positions[index]));
            this.room.startAssignments = Object.fromEntries(users.map((userId, index) => [userId, positions[index]]));
        }

        hasValidStartAssignments() {
            const users = this.room.playerSlots.filter(Boolean);
            const positions = users.map((userId) => (this.room.startAssignments || {})[userId]);
            return positions.every((position) => Number.isInteger(position) && position >= 0 && position < users.length)
                && new Set(positions).size === users.length;
        }

        update() {
            this.room.serverTime = Date.now();
            this.userRegistry.send(this.room.onlinePlayers, "state", this.publicState());
            this.room.onlinePlayers.forEach((userId) =>
                this.userRegistry.send(userId, "player-state", this.privateState(userId)));
        }

        getRobot(userId) {
            return this.room.robots.find((robot) => robot.userId === userId);
        }

        get features() {
            const board = this.room.course.board;
            const rotation = normalizeRotation(this.room.course.rotation);
            const key = `${board}:${rotation}`;
            this.orientedFeatureCache = this.orientedFeatureCache || new Map();
            if (!this.orientedFeatureCache.has(key))
                this.orientedFeatureCache.set(key, orientFeatures(BOARD_FEATURES[board] || EMPTY_FEATURES, rotation));
            return this.orientedFeatureCache.get(key);
        }

        get specialRules() {
            return (this.room.course && this.room.course.specialRules) || {};
        }

        get startFeatures() {
            return START_LAYOUTS[this.room.board.start] || START_LAYOUTS[START_CARDS[1]];
        }

        boardKey(robot) {
            return positionKey(robot.x, robot.y);
        }

        turnRobot(robot, amount) {
            if (!robot || !amount) return;
            const currentTurns = Number.isFinite(robot.headingTurns) ? robot.headingTurns : DIRECTIONS.indexOf(robot.direction);
            robot.headingTurns = currentTurns + amount;
            robot.direction = rotate(robot.direction, amount);
        }

        isOnFactory(robot) {
            return robot && robot.y >= 0 && robot.y < BOARD_SIZE;
        }

        conveyorAt(robot) {
            if (!robot) return null;
            return (this.isOnFactory(robot) ? this.features.conveyors : this.startFeatures.conveyors)[this.boardKey(robot)];
        }

        isExpressAt(robot) {
            return (this.isOnFactory(robot) ? this.features.express : this.startFeatures.express).has(this.boardKey(robot));
        }

        robotAt(x, y, excludedUserId) {
            return this.room.robots.find((robot) => !robot.eliminated && !robot.destroyed && robot.userId !== excludedUserId && robot.x === x && robot.y === y);
        }

        isInside(x, y) {
            return x >= 0 && y >= 0 && x < BOARD_SIZE && y < STAGE_ROWS;
        }

        cardById(player, id) {
            if (!id)
                return null;
            return [...player.hand, ...(player.registers || [])].filter(Boolean).find((card) => card.id === id) || null;
        }

        drawProgramCard() {
            if (!this.deck.length)
                this.deck.push(...shuffle(this.discard.splice(0)));
            if (!this.deck.length)
                this.deck.push(...shuffle(makeDeck()));
            return this.deck.shift();
        }

        lockedRegisterIndexes(damage) {
            const count = Math.min(5, Math.max(0, damage - 4));
            return Array.from({length: count}, (_, index) => 5 - count + index);
        }

        discardProgram(player) {
            this.discard.push(...player.hand.filter(Boolean), ...(player.registers || []).filter(Boolean));
            player.hand = [];
            player.registers = [];
            player.selected = Array(5).fill(null);
            player.lockedRegisters = [];
            player.autoFilledRegisters = [];
        }

        syncPoweredDownRegisters(player) {
            if (!player.poweredDown)
                return;
            const required = this.lockedRegisterIndexes(player.damage);
            const requiredSet = new Set(required);
            const registers = Array(5).fill(null);
            (player.registers || []).forEach((card, index) => {
                if (card && requiredSet.has(index)) registers[index] = card;
                else if (card) this.discard.push(card);
            });
            required.forEach((index) => {
                if (!registers[index]) registers[index] = this.drawProgramCard();
            });
            player.registers = registers;
            player.lockedRegisters = required;
            player.selected = registers.map((card) => card ? card.id : null);
        }

        deal(userId) {
            const player = this.players[userId];
            if (!player)
                return;
            // Five or more damage locks the last registers from the previous program.
            // The remaining cards are returned before the new hand is dealt.
            const lockedCount = Math.min(5, Math.max(0, player.damage - 4));
            const previousProgram = player.registers || [];
            const lockedCards = previousProgram.slice(5 - lockedCount).filter(Boolean);
            this.discard.push(...previousProgram.filter((card) => card && !lockedCards.includes(card)));
            player.registers = lockedCards;
            player.lockedRegisters = Array.from({length: lockedCards.length}, (_, index) => 5 - lockedCards.length + index);
            const cardsNeeded = Math.max(0, 9 - player.damage);
            if (this.deck.length < cardsNeeded)
                this.deck.push(...shuffle(this.discard.splice(0)));
            if (this.deck.length < cardsNeeded)
                this.deck.push(...shuffle(makeDeck()));
            player.hand = this.deck.splice(0, cardsNeeded);
            player.selected = Array(5).fill(null);
            lockedCards.forEach((card, index) => player.selected[5 - lockedCards.length + index] = card.id);
            player.locked = false;
            player.autoFilledRegisters = [];
        }

        startRound() {
            this.cancelProgrammingTimer();
            this.cancelAutoFillResolution();
            this.room.programmingAutoFill = null;
            this.room.phase = "programming";
            this.room.round += 1;
            this.room.register = null;
            this.room.revealedRegisters = 0;
            this.room.resolution = null;
            this.room.laserShots = [];
            this.room.stage = "Подготовка нового раунда";
            this.room.playerSlots.filter(Boolean).forEach((userId) => {
                const player = this.players[userId];
                player.checkpointAvailable = player.checkpoints + 1;
                player.powerDownIntent = false;
                player.powerDownContinuation = null;
                const robot = this.getRobot(userId);
                if (robot && robot.eliminated) {
                    player.hand = [];
                    player.selected = Array(5).fill(null);
                    player.locked = true;
                    player.poweredDown = false;
                    player.powerDownNextRound = false;
                    player.powerDownReentryChoiceRequired = false;
                    return;
                }
                if (player.powerDownNextRound) {
                    this.discardProgram(player);
                    player.damage = 0;
                    player.powerDownDamage = 0;
                    player.poweredDown = true;
                    player.powerDownNextRound = false;
                    player.locked = true;
                    this.addLog(`${this.room.playerNames[userId]} входит в Power Down и снимает все повреждения.`);
                } else {
                    player.poweredDown = false;
                    player.powerDownNextRound = false;
                    player.powerDownDamage = 0;
                    this.deal(userId);
                }
            });
            this.addLog(`Раунд ${this.room.round}: выберите пять карт программы.`);
            this.maybeStartProgrammingTimer();
            this.update();
            if (this.areAllProgramsLocked())
                setTimeout(() => this.resolveRound().catch((error) => {
                    this.addLog(`Ошибка разрешения хода: ${error.message}`);
                    this.room.phase = "programming";
                    this.update();
                }), STEP_DELAY_MS);
        }

        startGame() {
            this.cancelProgrammingTimer();
            this.cancelAutoFillResolution();
            const users = this.room.playerSlots.filter(Boolean);
            if (users.length < 2)
                return;
            if (users.length < this.room.course.min || users.length > this.room.course.max)
                return this.userRegistry.send(this.room.hostId, "message", `Для курса «${this.room.course.name}» рекомендовано игроков: ${this.room.course.players}.`);
            this.room.phase = "programming";
            this.room.round = 0;
            this.room.winnerId = null;
            this.room.board = {name: this.room.course.board, size: BOARD_SIZE, start: this.room.course.start};
            this.room.flags = this.room.course.flags.map(([x, y], index) => ({x, y, homeX: x, homeY: y, number: index + 1}));
            const startLayout = START_LAYOUTS[this.room.course.start] || START_LAYOUTS[START_CARDS[1]];
            if (!this.hasValidStartAssignments())
                this.randomizeStartAssignments();
            this.room.robots = users.map((userId) => {
                const slot = this.room.startAssignments[userId];
                return {
                userId,
                slot,
                x: startLayout.starts[slot].x,
                y: startLayout.starts[slot].y,
                direction: "north",
                headingTurns: 0,
                color: this.room.playerColors[userId] || ROBOT_COLORS[slot],
                eliminated: false,
                archive: {...startLayout.starts[slot]}
                };
            });
            users.forEach((userId) => {
                this.players[userId] = {
                    hand: [], selected: Array(5).fill(null), registers: [], lockedRegisters: [], locked: false,
                    autoFilledRegisters: [],
                    damage: this.specialRules.startingDamage || 0, lives: 3, checkpoints: 0, poweredDown: false, powerDownIntent: false,
                    powerDownNextRound: false, powerDownContinuation: null, powerDownDamage: 0,
                    powerDownReentryChoiceRequired: false
                };
            });
            this.deck = shuffle(makeDeck());
            this.discard = [];
            this.powerDownChoiceUsers = [];
            this.powerDownChoices = new Map();
            this.room.powerDownChoice = null;
            this.destructionCounter = 0;
            // Every firing phase must produce fresh React keys.  Without an
            // initialized counter `++undefined` became NaN, so subsequent
            // laser animations were re-used by the browser and stayed ended.
            this.laserEventCounter = 0;
            this.boardEventCounter = 0;
            this.room.boardEvents = [];
            this.room.programmingTimer = null;
            this.room.programmingAutoFill = null;
            this.addLog("Игра началась. Роботы получили программы.");
            this.startRound();
        }

        reboot(robot, reason) {
            const player = this.players[robot.userId];
            const destructionId = ++this.destructionCounter;
            robot.death = {x: robot.x, y: robot.y, id: destructionId, reason};
            if (player.powerDownNextRound && !player.poweredDown)
                player.powerDownReentryChoiceRequired = true;
            player.lives -= 1;
            player.damage = 0;
            if (!player.poweredDown)
                player.powerDownDamage = 0;
            if (player.lives <= 0) {
                robot.eliminated = true;
                player.poweredDown = false;
                player.powerDownIntent = false;
                player.powerDownNextRound = false;
                player.powerDownReentryChoiceRequired = false;
                robot.x = null;
                robot.y = null;
                this.addLog(`${this.room.playerNames[robot.userId]} потерял последнюю жизнь.`);
                return;
            }
            robot.destroyed = true;
            robot.destroyedOrder = destructionId;
            robot.x = null;
            robot.y = null;
            this.addLog(`${this.room.playerNames[robot.userId]} уничтожен (${reason}) и вернётся в конце раунда.`);
        }

        preparePowerDownChoice() {
            const users = this.room.playerSlots.filter((userId) => {
                const robot = userId && this.getRobot(userId);
                return robot && this.players[userId] && this.players[userId].poweredDown && !robot.eliminated;
            });
            if (!users.length)
                return false;
            this.powerDownChoiceUsers = users;
            this.powerDownChoices = new Map();
            this.room.phase = "power-down-choice";
            this.room.register = null;
            this.room.powerDownChoice = {answered: 0, total: users.length};
            this.room.stage = "Решение о продолжении Power Down";
            this.update();
            return true;
        }

        choosePowerDownContinuation(userId, enabled) {
            if (this.room.phase !== "power-down-choice" || !(this.powerDownChoiceUsers || []).includes(userId)
                || this.powerDownChoices.has(userId))
                return;
            this.powerDownChoices.set(userId, enabled);
            this.room.powerDownChoice = {answered: this.powerDownChoices.size, total: this.powerDownChoiceUsers.length};
            if (this.powerDownChoices.size < this.powerDownChoiceUsers.length)
                return this.update();
            this.powerDownChoiceUsers.forEach((id) => {
                const staysDown = this.powerDownChoices.get(id);
                this.players[id].powerDownNextRound = staysDown;
                this.players[id].powerDownContinuation = staysDown;
            });
            this.powerDownChoiceUsers.forEach((id) => this.addLog(`${this.room.playerNames[id]} ${this.powerDownChoices.get(id)
                ? "остаётся в Power Down на следующий раунд."
                : "выходит из Power Down в следующем раунде."}`));
            this.powerDownChoiceUsers = [];
            this.powerDownChoices = new Map();
            this.room.powerDownChoice = null;
            if (!this.prepareReentry())
                this.startRound();
        }

        advanceToNextRound() {
            if (this.preparePowerDownChoice())
                return;
            if (this.prepareReentry())
                return;
            this.startRound();
        }

        prepareReentry() {
            const queue = this.room.robots.filter((robot) => robot.destroyed && !robot.eliminated)
                .sort((left, right) => (left.destroyedOrder || 0) - (right.destroyedOrder || 0))
                .map((robot) => robot.userId);
            if (!queue.length)
                return false;
            this.room.phase = "reentry";
            this.room.register = null;
            this.room.reentryQueue = queue;
            this.room.reentryUserId = queue[0];
            this.room.stage = "Выбор точки и направления возрождения";
            this.addLog(`${this.room.playerNames[queue[0]]} выбирает возрождение.`);
            this.update();
            return true;
        }

        reentryDirectionAllowed(x, y, direction) {
            const vector = VECTORS[direction];
            let currentX = x;
            let currentY = y;
            for (let distance = 1; distance <= 3; distance++) {
                if (this.wallBetween(currentX, currentY, direction))
                    return true;
                currentX += vector.x;
                currentY += vector.y;
                if (!this.isInside(currentX, currentY))
                    return true;
                if (this.robotAt(currentX, currentY))
                    return false;
            }
            return true;
        }

        reentryCandidates(userId) {
            const robot = this.getRobot(userId);
            if (!robot || !robot.destroyed || !robot.archive)
                return [];
            const archiveFree = !this.robotAt(robot.archive.x, robot.archive.y);
            const points = archiveFree ? [{...robot.archive, archive: true}]
                : [-1, 0, 1].flatMap((dy) => [-1, 0, 1].map((dx) => ({x: robot.archive.x + dx, y: robot.archive.y + dy})))
                    .filter((point) => point.x !== robot.archive.x || point.y !== robot.archive.y);
            return points.filter((point) => this.isInside(point.x, point.y) && !this.robotAt(point.x, point.y)
                    && !(point.y < BOARD_SIZE && this.features.pits.has(positionKey(point.x, point.y))))
                .map((point) => ({...point, directions: point.archive ? [...DIRECTIONS]
                    : DIRECTIONS.filter((direction) => this.reentryDirectionAllowed(point.x, point.y, direction))}))
                .filter((point) => point.directions.length);
        }

        chooseReentry(userId, choice) {
            if (this.room.phase !== "reentry" || this.room.reentryUserId !== userId || !choice)
                return;
            const x = Number(choice.x);
            const y = Number(choice.y);
            const direction = String(choice.direction || "");
            const player = this.players[userId];
            if (player.powerDownReentryChoiceRequired && typeof choice.poweredDown !== "boolean")
                return;
            const candidate = this.reentryCandidates(userId).find((item) => item.x === x && item.y === y
                && item.directions.includes(direction));
            if (!candidate)
                return;
            const robot = this.getRobot(userId);
            robot.x = x;
            robot.y = y;
            robot.direction = direction;
            robot.headingTurns = DIRECTIONS.indexOf(direction);
            robot.destroyed = false;
            delete robot.destroyedOrder;
            delete robot.death;
            const powerDownDamage = player.powerDownDamage || 0;
            player.damage = 2 + powerDownDamage;
            player.powerDownDamage = 0;
            if (player.powerDownReentryChoiceRequired) {
                player.powerDownNextRound = choice.poweredDown;
                player.powerDownReentryChoiceRequired = false;
                this.addLog(`${this.room.playerNames[userId]} возродится ${choice.poweredDown ? "в Power Down" : "в обычном режиме"}.`);
            }
            if (player.poweredDown)
                this.syncPoweredDownRegisters(player);
            this.addLog(`${this.room.playerNames[userId]} возрождается на клетке ${x + 1}, ${y + 1}.`);
            this.room.reentryQueue.shift();
            if (player.damage >= 10) {
                this.reboot(robot, "10 повреждений при возрождении");
                if (!robot.eliminated)
                    this.room.reentryQueue.push(userId);
            }
            this.room.reentryUserId = this.room.reentryQueue[0] || null;
            if (this.room.reentryUserId) {
                this.addLog(`${this.room.playerNames[this.room.reentryUserId]} выбирает возрождение.`);
                return this.update();
            }
            this.room.reentryQueue = [];
            this.startRound();
        }

        move(robot, direction, cause, visited = new Set()) {
            if (robot.eliminated || robot.destroyed)
                return false;
            const signature = `${robot.userId}:${robot.x},${robot.y}:${direction}`;
            if (visited.has(signature))
                return false;
            visited.add(signature);
            if (this.wallBetween(robot.x, robot.y, direction))
                return false;
            const vector = VECTORS[direction];
            const target = {x: robot.x + vector.x, y: robot.y + vector.y};
            if (!this.isInside(target.x, target.y)) {
                if (cause === "толкатель" || cause === "толчок")
                    this.addBoardEvent(cause === "толкатель" ? "pusher" : "push", robot, {direction});
                this.reboot(robot, "падение с поля");
                return true;
            }
            const blockingRobot = this.robotAt(target.x, target.y, robot.userId);
            if (blockingRobot && !this.move(blockingRobot, direction, "толчок", visited))
                return false;
            robot.x = target.x;
            robot.y = target.y;
            if (cause === "толкатель" || cause === "толчок")
                this.addBoardEvent(cause === "толкатель" ? "pusher" : "push", robot, {direction});
            if (this.isOnFactory(robot) && this.features.pits.has(this.boardKey(robot)))
                this.reboot(robot, "яма");
            return true;
        }

        wallBetween(x, y, direction) {
            const vector = VECTORS[direction];
            const opposite = rotate(direction, 2);
            const targetX = x + vector.x;
            const targetY = y + vector.y;
            const wallsAt = (cellY) => cellY < BOARD_SIZE ? this.features.walls : this.startFeatures.walls;
            const sourceWall = y >= 0 && y < STAGE_ROWS && wallsAt(y).has(`${x},${y},${direction}`);
            const targetWall = targetY >= 0 && targetY < STAGE_ROWS
                && wallsAt(targetY).has(`${targetX},${targetY},${opposite}`);
            return sourceWall || targetWall;
        }

        async showStage(stage, delay = STEP_DELAY_MS) {
            this.room.stage = stage;
            this.update();
            await wait(delay);
            this.clearBoardEvents();
        }

        async executeCard(robot, card) {
            if (robot.eliminated || robot.destroyed)
                return;
            if (card.type === "left") this.turnRobot(robot, -1);
            if (card.type === "right") this.turnRobot(robot, 1);
            if (card.type === "uturn") this.turnRobot(robot, 2);
            if (["left", "right", "uturn"].includes(card.type)) {
                await this.showStage(`${this.room.playerNames[robot.userId]}: ${card.label}`);
                return;
            }
            const steps = card.type === "move3" ? 3 : card.type === "move2" ? 2 : 1;
            const direction = card.type === "backup" ? rotate(robot.direction, 2) : robot.direction;
            for (let step = 0; step < steps && !robot.destroyed; step++) {
                if (!this.move(robot, direction, card.label)) break;
                await this.showStage(`${this.room.playerNames[robot.userId]}: ${card.label} · шаг ${step + 1}/${steps}`);
            }
        }

        damageRobot(robot, amount, source) {
            if (!robot || robot.eliminated || robot.destroyed)
                return;
            const player = this.players[robot.userId];
            player.damage += amount;
            if (player.poweredDown) {
                player.powerDownDamage = (player.powerDownDamage || 0) + amount;
                const previouslyLocked = new Set(player.lockedRegisters || []);
                this.syncPoweredDownRegisters(player);
                const added = player.lockedRegisters.filter((register) => !previouslyLocked.has(register));
                if (added.length)
                    this.addLog(`${this.room.playerNames[robot.userId]} получает случайные карты в заблокированные регистры ${added.map((index) => index + 1).join(", ")}.`);
            }
            this.addLog(`${this.room.playerNames[robot.userId]} получает ${amount} урон (${source}).`);
            if (player.damage >= 10)
                this.reboot(robot, "10 повреждений");
        }

        fireLaser(x, y, direction, source, includeOrigin = false) {
            const robot = this.traceLaser(x, y, direction, includeOrigin).target;
            if (robot)
                this.damageRobot(robot, 1, source);
        }

        laserTarget(x, y, direction, includeOrigin = false) {
            return this.traceLaser(x, y, direction, includeOrigin).target;
        }

        traceLaser(x, y, direction, includeOrigin = false) {
            const vector = VECTORS[direction];
            const start = includeOrigin
                ? {x: x + .5 - vector.x * .5, y: y + .5 - vector.y * .5}
                : {x: x + .5, y: y + .5};
            let cellX = includeOrigin ? x : x + vector.x;
            let cellY = includeOrigin ? y : y + vector.y;
            let end = {...start};
            if (!includeOrigin && this.wallBetween(x, y, direction)) {
                end = {x: x + .5 + vector.x * .5, y: y + .5 + vector.y * .5};
                return {start, end, target: null};
            }
            while (this.isInside(cellX, cellY)) {
                end = {x: cellX + .5, y: cellY + .5};
                const robot = this.robotAt(cellX, cellY);
                if (robot)
                    return {start, end, target: robot};
                if (this.wallBetween(cellX, cellY, direction)) {
                    end = {x: cellX + .5 + vector.x * .5, y: cellY + .5 + vector.y * .5};
                    return {start, end, target: null};
                }
                const nextX = cellX + vector.x;
                const nextY = cellY + vector.y;
                if (!this.isInside(nextX, nextY)) {
                    end = {x: cellX + .5 + vector.x * .5, y: cellY + .5 + vector.y * .5};
                    return {start, end, target: null};
                }
                cellX = nextX;
                cellY = nextY;
            }
            return {start, end, target: null};
        }

        moveConveyors(expressOnly) {
            this.clearBoardEvents();
            const candidates = this.room.robots.filter((robot) => !robot.eliminated && !robot.destroyed)
                .map((robot) => ({robot, source: this.boardKey(robot), direction: this.conveyorAt(robot)}))
                .filter((item) => item.direction && (!expressOnly || this.isExpressAt(item.robot)))
                .map((item) => {
                    const vector = VECTORS[item.direction];
                    return {...item, target: {x: item.robot.x + vector.x, y: item.robot.y + vector.y}};
                });
            const unobstructed = candidates.filter(({robot, direction}) => !this.wallBetween(robot.x, robot.y, direction));
            const targetCounts = new Map();
            unobstructed.forEach(({target}) => targetCounts.set(positionKey(target.x, target.y), (targetCounts.get(positionKey(target.x, target.y)) || 0) + 1));
            let allowed = unobstructed.filter(({target}) => targetCounts.get(positionKey(target.x, target.y)) === 1);
            let changed = true;
            while (changed) {
                changed = false;
                const movingIds = new Set(allowed.map(({robot}) => robot.userId));
                const filtered = allowed.filter(({robot, target}) => {
                    const occupant = this.robotAt(target.x, target.y, robot.userId);
                    return !occupant || movingIds.has(occupant.userId);
                });
                if (filtered.length !== allowed.length) {
                    allowed = filtered;
                    changed = true;
                }
            }
            allowed.forEach((item) => {
                const {robot, target, direction} = item;
                if (!this.isInside(target.x, target.y)) {
                    this.addBoardEvent("conveyor", robot, {direction, express: !!expressOnly});
                    return this.reboot(robot, "конвейер вынес за край");
                }
                robot.x = target.x;
                robot.y = target.y;
            });
            allowed.forEach(({robot, direction}) => {
                if (robot.destroyed) return;
                const destinationDirection = this.conveyorAt(robot);
                const turn=conveyorArrivalTurn(direction,destinationDirection);
                if (turn) this.turnRobot(robot, turn);
                this.addBoardEvent("conveyor", robot, {direction, turn: turn || 0, express: !!expressOnly});
                if (this.features.pits.has(this.boardKey(robot))) this.reboot(robot, "конвейер переместил в яму");
            });
            this.moveFlagsOnConveyors(expressOnly);
        }

        moveFlagsOnConveyors(expressOnly) {
            if (!this.specialRules.movingFlags) return;
            this.room.flags.filter((flag) => flag.x != null && flag.y != null).forEach((flag) => {
                const direction = this.conveyorAt(flag);
                if (!direction || (expressOnly && !this.isExpressAt(flag)) || this.wallBetween(flag.x, flag.y, direction))
                    return;
                const vector = VECTORS[direction];
                const targetX = flag.x + vector.x;
                const targetY = flag.y + vector.y;
                if (!this.isInside(targetX, targetY)
                    || (targetY < BOARD_SIZE && this.features.pits.has(positionKey(targetX, targetY)))) {
                    this.addLog(`Флаг ${flag.number} падает в яму и вернётся в начале следующей фазы регистра.`);
                    flag.x = null;
                    flag.y = null;
                    flag.offBoard = true;
                    return;
                }
                flag.x = targetX;
                flag.y = targetY;
            });
        }

        restoreMovingFlags() {
            if (!this.specialRules.movingFlags) return false;
            let restored = false;
            this.room.flags.forEach((flag) => {
                if (!flag.offBoard) return;
                flag.x = flag.homeX;
                flag.y = flag.homeY;
                flag.offBoard = false;
                restored = true;
                this.addLog(`Флаг ${flag.number} возвращается в исходную клетку.`);
            });
            return restored;
        }

        activatePushers() {
            this.clearBoardEvents();
            this.features.pushers.filter((pusher) => !pusher.active || pusher.active.includes(this.room.register))
                .forEach((pusher) => {
                    const robot = this.robotAt(pusher.x, pusher.y);
                    if (robot) this.move(robot, pusher.direction, "толкатель");
                });
        }

        activateGears() {
            this.clearBoardEvents();
            this.room.robots.forEach((robot) => {
                if (robot.eliminated || robot.destroyed)
                    return;
                const gear = this.isOnFactory(robot) && this.features.gears[this.boardKey(robot)];
                if (gear) {
                    this.turnRobot(robot, gear);
                    this.addBoardEvent("gear", robot, {turn: gear});
                }
            });
        }

        fireAllLasers() {
            // Determine every target first: laser fire is simultaneous, so a
            // robot destroyed by one beam still blocks the others this phase.
            const hits = new Map();
            const shots = [];
            const addShot = (trace, emitter, amount = 1, sourceUserId = null) => {
                this.laserEventCounter = (this.laserEventCounter || 0) + 1;
                const shot = {id: this.laserEventCounter, source: sourceUserId ? "robot" : "board", sourceUserId, direction: emitter.direction,
                    sourceColor: emitter.color || null, sourceName: sourceUserId ? this.room.playerNames[sourceUserId] : null,
                    start: trace.start, end: trace.end, count: amount,
                    targetUserId: trace.target ? trace.target.userId : null};
                shots.push(shot);
                if (trace.target)
                    hits.set(trace.target, (hits.get(trace.target) || 0) + amount);
            };
            this.features.lasers.forEach((laser) => {
                addShot(this.traceLaser(laser.x, laser.y, laser.direction, true), laser, laser.count || 1);
            });
            this.room.robots.forEach((robot) => {
                const player = this.players[robot.userId];
                if (!robot.eliminated && !robot.destroyed && player && !player.poweredDown)
                    addShot(this.traceLaser(robot.x, robot.y, robot.direction), robot,
                        this.specialRules.robotLaserDamage || 1, robot.userId);
            });
            this.room.laserShots = shots;
            // Keep every firing robot on the board while the simultaneous
            // beams are visible. Applying damage before the client update
            // made a destroyed shooter's legal beam look like a phantom.
            return [...hits.entries()].map(([robot, amount]) => ({userId: robot.userId, amount}));
        }

        applyLaserHits(hits) {
            (hits || []).forEach(({userId, amount}) =>
                this.damageRobot(this.getRobot(userId), amount, "лазеры"));
        }

        touchCheckpoints() {
            this.clearBoardEvents();
            this.room.robots.forEach((robot) => {
                if (robot.eliminated || robot.destroyed)
                    return;
                const player = this.players[robot.userId];
                const flag = this.room.flags.find((item) => item.x === robot.x && item.y === robot.y);
                const previousArchive = robot.archive && `${robot.archive.x},${robot.archive.y}`;
                if (flag) {
                    robot.archive = {x: robot.x, y: robot.y};
                    if (flag.number === player.checkpointAvailable) {
                        player.checkpoints += 1;
                        player.checkpointAvailable = null;
                        this.addBoardEvent("flag", robot, {flagNumber: flag.number});
                        this.addLog(`${this.room.playerNames[robot.userId]} активирует флаг ${flag.number}.`);
                        if (player.checkpoints === this.room.flags.length) {
                            this.room.phase = "finished";
                            this.room.winnerId = robot.userId;
                        }
                    } else if (previousArchive !== `${robot.x},${robot.y}`) {
                        this.addBoardEvent("archive", robot, {onFlag: true});
                    }
                }
                if (!flag && this.isOnFactory(robot) && this.features.repairs.has(this.boardKey(robot))) {
                    robot.archive = {x: robot.x, y: robot.y};
                    if (previousArchive !== `${robot.x},${robot.y}`)
                        this.addBoardEvent("archive", robot);
                }
            });
        }

        cleanupRound() {
            // Wrenches repair only after register 5, not after every register.
            this.clearBoardEvents();
            let repaired = 0;
            this.room.robots.forEach((robot) => {
                if (robot.eliminated || robot.destroyed || !this.isOnFactory(robot))
                    return;
                const onFlag = this.room.flags.some((flag) => flag.x === robot.x && flag.y === robot.y);
                if (this.features.repairs.has(this.boardKey(robot)) || onFlag) {
                    const player = this.players[robot.userId];
                    const previousDamage = player.damage;
                    player.damage = Math.max(0, previousDamage - 1);
                    this.syncPoweredDownRegisters(player);
                    robot.archive = {x: robot.x, y: robot.y};
                    this.addLog(`${this.room.playerNames[robot.userId]} обслуживает робота на ремонтной клетке.`);
                    if (player.damage < previousDamage) {
                        repaired += 1;
                        this.addBoardEvent("heal", robot, {amount: previousDamage - player.damage});
                    }
                }
            });
            return repaired;
        }

        confirmPowerDownIntents(userIds) {
            userIds.forEach((userId) => {
                const player = this.players[userId];
                player.powerDownNextRound = !!player.powerDownIntent;
            });
            userIds.filter((userId) => this.players[userId].powerDownNextRound).forEach((userId) => {
                this.addLog(`${this.room.playerNames[userId]} объявляет Power Down на следующий раунд.`);
            });
        }

        async resolveRound() {
            if (this.room.phase !== "programming")
                return;
            this.cancelProgrammingTimer();
            this.cancelAutoFillResolution();
            this.room.programmingAutoFill = null;
            this.room.phase = "resolving";
            this.room.revealedRegisters = 0;
            const resolutionId = (this.resolutionId || 0) + 1;
            this.resolutionId = resolutionId;
            const activeUsers = this.room.playerSlots.filter(Boolean);
            this.confirmPowerDownIntents(activeUsers);
            this.room.resolution = [];
            for (let register = 0; register < 5 && this.room.phase === "resolving" && this.resolutionId === resolutionId; register++) {
                this.restoreMovingFlags();
                this.room.register = register + 1;
                this.room.revealedRegisters = register + 1;
                await this.showStage(`Регистр ${register + 1}: карты открыты`, 500);
                const actions = activeUsers.map((userId) => ({
                    userId,
                    player: this.players[userId],
                    robot: this.getRobot(userId),
                    card: this.cardById(this.players[userId], this.players[userId].selected[register])
                })).filter((item) => item.robot && item.card && !item.player.poweredDown
                    && !item.robot.eliminated && !item.robot.destroyed)
                    .sort((left, right) => right.card.priority - left.card.priority);
                for (const {robot, card} of actions) {
                    await this.executeCard(robot, card);
                    this.room.resolution.push({register: register + 1, userId: robot.userId, card: card.label});
                }
                this.moveConveyors(true);
                await this.showStage(`Регистр ${register + 1}: экспресс-конвейеры`);
                this.moveConveyors(false);
                await this.showStage(`Регистр ${register + 1}: все конвейеры`);
                this.activatePushers();
                await this.showStage(`Регистр ${register + 1}: толкатели`);
                this.activateGears();
                await this.showStage(`Регистр ${register + 1}: шестерни`);
                const laserHits = this.fireAllLasers();
                await this.showStage(`Регистр ${register + 1}: лазеры`, Math.max(STEP_DELAY_MS, 850));
                this.room.laserShots = [];
                this.applyLaserHits(laserHits);
                await this.showStage(`Регистр ${register + 1}: попадания лазеров`, STEP_DELAY_MS);
                this.touchCheckpoints();
                await this.showStage(`Регистр ${register + 1}: флаги и архивы`);
            }
            if (this.resolutionId !== resolutionId || this.room.phase === "lobby")
                return;
            // A flag that falls during register 5 has no following register
            // whose opening could restore it. Return such flags as soon as all
            // five register phases are complete, before round cleanup and the
            // next programming phase begin.
            if (this.restoreMovingFlags())
                await this.showStage("Упавшие флаги возвращаются на исходные клетки", Math.max(STEP_DELAY_MS, 500));
            if (this.room.phase !== "finished") {
                const repaired = this.cleanupRound();
                if (repaired)
                    await this.showStage("Конец раунда: ремонт", Math.max(STEP_DELAY_MS, 700));
            }
            activeUsers.forEach((userId) => {
                const player = this.players[userId];
                if (player.poweredDown) {
                    player.hand = [];
                    player.locked = true;
                    return;
                }
                let program = player.selected.map((id) => this.cardById(player, id));
                this.discard.push(...player.hand.filter((card) => !program.includes(card)));
                player.registers = program;
                player.hand = [];
                player.selected = Array(5).fill(null);
                player.lockedRegisters = [];
                player.locked = false;
            });
            if (this.room.phase === "finished") {
                this.addLog(`${this.room.playerNames[this.room.winnerId]} собрал все флаги и победил!`);
                this.update();
            } else {
                this.addLog("Регистр 5 завершён. Начинается следующий раунд.");
                this.advanceToNextRound();
            }
        }

        areAllProgramsLocked() {
            return this.room.playerSlots.filter(Boolean).every((userId) => this.players[userId] && this.players[userId].locked);
        }

        cancelProgrammingTimer() {
            if (this.programmingTimerHandle) {
                clearInterval(this.programmingTimerHandle);
                this.programmingTimerHandle = null;
            }
            this.programmingTimerGeneration = (this.programmingTimerGeneration || 0) + 1;
            if (this.room)
                this.room.programmingTimer = null;
        }

        cancelAutoFillResolution() {
            if (this.autoFillResolveHandle) {
                clearTimeout(this.autoFillResolveHandle);
                this.autoFillResolveHandle = null;
            }
        }

        maybeStartProgrammingTimer() {
            if (this.room.phase !== "programming")
                return false;
            const players = this.room.playerSlots.filter((userId) => userId && this.players[userId]);
            const pending = players.filter((userId) => !this.players[userId].locked);
            const courseSeconds = Number(this.specialRules.programmingSeconds) || 0;
            const global = courseSeconds > 0;
            if (this.room.programmingTimer) {
                if (this.room.programmingTimer.global) {
                    this.room.programmingTimer.userIds = [...pending];
                    this.room.programmingTimer.userId = pending[0] || null;
                }
                return false;
            }
            if (players.length < 2 || !pending.length || (!global && pending.length !== 1))
                return false;
            const seconds = global ? courseSeconds : PROGRAMMING_TIMER_MS / 1000;
            const userIds = global ? pending : [pending[0]];
            const generation = ++this.programmingTimerGeneration;
            const endsAt = Date.now() + seconds * 1000;
            this.room.programmingTimer = {userId: userIds[0], userIds: [...userIds], global, endsAt, remaining: seconds};
            this.addLog(global
                ? `Особое правило «${this.room.course.name}»: запущен общий таймер программирования на ${seconds} секунд.`
                : `${this.room.playerNames[userIds[0]]} остаётся последним: запущен таймер программирования на 30 секунд.`);
            this.programmingTimerHandle = setInterval(() => {
                const timer = this.room.programmingTimer;
                const stillPending = players.filter((userId) => !this.players[userId].locked);
                if (generation !== this.programmingTimerGeneration || this.room.phase !== "programming"
                    || !timer || !stillPending.length || (!timer.global && this.players[timer.userId].locked)) {
                    if (generation === this.programmingTimerGeneration)
                        this.cancelProgrammingTimer();
                    return;
                }
                if (timer.global) {
                    timer.userIds = [...stillPending];
                    timer.userId = stillPending[0];
                }
                const remaining = Math.max(0, Math.ceil((timer.endsAt - Date.now()) / 1000));
                if (remaining <= 0)
                    return this.expireProgrammingTimer(timer.userId, generation);
                if (remaining !== timer.remaining) {
                    timer.remaining = remaining;
                    this.update();
                }
            }, 200);
            if (this.programmingTimerHandle.unref)
                this.programmingTimerHandle.unref();
            return true;
        }

        expireProgrammingTimer(userId, generation = this.programmingTimerGeneration) {
            const timer = this.room.programmingTimer;
            if (this.room.phase !== "programming" || !timer || generation !== this.programmingTimerGeneration)
                return false;
            const userIds = (timer.global ? this.room.playerSlots.filter((id) => id && this.players[id] && !this.players[id].locked)
                : [userId]).filter((id) => id && this.players[id] && !this.players[id].locked);
            if (!userIds.length || (!timer.global && timer.userId !== userId)) return false;
            this.cancelProgrammingTimer();
            const fills = userIds.map((id) => {
                const player = this.players[id];
                const selected = new Set(player.selected.filter(Boolean));
                const available = shuffle(player.hand.filter((card) => !selected.has(card.id))).map((card) => card.id);
                const registers = [];
                player.selected = player.selected.map((cardId, register) => {
                    if (cardId || player.lockedRegisters.includes(register)) return cardId;
                    const randomCard = available.shift() || null;
                    if (randomCard) registers.push(register);
                    return randomCard;
                });
                player.autoFilledRegisters = registers;
                player.locked = true;
                if (registers.length)
                    this.addLog(`Время ${this.room.playerNames[id]} истекло: пустые регистры заполнены случайными картами с руки.`);
                else
                    this.addLog(`Время ${this.room.playerNames[id]} истекло: готовая программа автоматически зафиксирована.`);
                return {userId: id, registers};
            });
            const first = fills[0];
            this.room.programmingAutoFill = {userId: first.userId, userIds: [...userIds], registers: [...first.registers],
                fills, count: fills.reduce((sum, fill) => sum + fill.registers.length, 0)};
            this.update();
            this.autoFillResolveHandle = setTimeout(() => {
                this.autoFillResolveHandle = null;
                if (this.room.phase !== "programming" || !this.areAllProgramsLocked()) return;
                this.resolveRound().catch((error) => {
                    this.addLog(`Ошибка разрешения хода: ${error.message}`);
                    this.room.phase = "programming";
                    this.update();
                });
            }, AUTO_FILL_DISPLAY_MS);
            if (this.autoFillResolveHandle.unref)
                this.autoFillResolveHandle.unref();
            return true;
        }

        userJoin(data) {
            const userId = data.userId;
            this.room.onlinePlayers.add(userId);
            if (!this.room.playerSlots.includes(userId))
                this.room.spectators.add(userId);
            this.room.playerNames[userId] = String(this.room.playerNames[userId] || data.userName || "Гость").trim().slice(0, 40) || "Гость";
            this.update();
        }

        userLeft(userId) {
            this.room.onlinePlayers.delete(userId);
            this.update();
        }

        selectCourse(course) {
            this.room.course = {...course, start: course.start || START_CARDS[1]};
            this.room.board = {name: course.board, size: BOARD_SIZE, start: this.room.course.start};
            this.room.flags = course.flags.map(([x, y], index) => ({x, y, homeX: x, homeY: y, number: index + 1}));
            this.addLog(`Выбран курс «${course.name}».`);
            this.update();
        }

        userEvent(userId, event, args) {
            const value = args[0];
            if ((event === "change-name" || event === "set-nickname") && typeof value === "string") {
                const nickname = value.trim().slice(0, 40);
                if (!nickname)
                    return this.userRegistry.send(userId, "message", "Никнейм не может быть пустым.");
                this.room.playerNames[userId] = nickname;
                return this.update();
            }
            if (userId === this.room.hostId && this.room.phase === "lobby" && event === "select-course") {
                const course = COURSE_CARDS.find((item) => item.id === value);
                if (course) this.selectCourse(course);
                return;
            }
            if (userId === this.room.hostId && this.room.phase === "lobby" && event === "set-custom-course" && value && typeof value === "object") {
                const flags = Array.isArray(value.flags) ? value.flags.filter((flag) => Array.isArray(flag) && flag.length === 2
                    && flag.every(Number.isInteger) && flag[0] >= 0 && flag[0] < BOARD_SIZE && flag[1] >= 0 && flag[1] < BOARD_SIZE).slice(0, 8) : [];
                const uniqueFlags = new Set(flags.map(([x, y]) => positionKey(x, y)));
                const rotation = normalizeRotation(value.rotation);
                const features = orientFeatures(BOARD_FEATURES[value.board] || EMPTY_FEATURES, rotation);
                const invalidFlag = flags.some(([x, y]) => features && features.pits.has(positionKey(x, y)));
                if (!BOARD_CARDS[value.board] || !START_CARDS.includes(value.start) || !flags.length
                    || uniqueFlags.size !== flags.length || invalidFlag)
                    return this.userRegistry.send(userId, "message", "Для своего курса выберите карту, старт и хотя бы один флаг.");
                this.selectCourse({id: "custom", name: String(value.name || "Мой курс").slice(0, 50), board: value.board,
                    start: value.start, rotation, players: "2–8", min: 2, max: 8, length: "своя", level: "авторская", flags});
                return;
            }
            if ((event === "join-game" || event === "players-join") && this.room.phase === "lobby") {
                if (this.room.playerSlots.includes(userId)) return;
                if (event === "join-game" && value && typeof value === "object" && typeof value.nickname === "string") {
                    const nickname = value.nickname.trim().slice(0, 40);
                    if (nickname) this.room.playerNames[userId] = nickname;
                }
                const requestedSlot = event === "players-join" && Number.isInteger(value) && value >= 0 && value < 8 ? value : this.room.playerSlots.indexOf(null);
                if (requestedSlot < 0 || this.room.playerSlots[requestedSlot] !== null)
                    return this.userRegistry.send(userId, "message", "В игре уже заняты все восемь мест.");
                const usedColors = new Set(Object.entries(this.room.playerColors)
                    .filter(([id]) => this.room.playerSlots.includes(id)).map(([, color]) => color));
                this.room.playerSlots[requestedSlot] = userId;
                if (!ROBOT_COLORS.includes(this.room.playerColors[userId]) || usedColors.has(this.room.playerColors[userId]))
                    this.room.playerColors[userId] = ROBOT_COLORS.find((color) => !usedColors.has(color));
                this.room.spectators.delete(userId);
                this.randomizeStartAssignments();
                this.addLog(`${this.room.playerNames[userId]} присоединился к игре.`);
                return this.update();
            }
            if (event === "spectators-join" && this.room.phase === "lobby") {
                const slot = this.room.playerSlots.indexOf(userId);
                if (slot >= 0) this.room.playerSlots[slot] = null;
                this.room.spectators.add(userId);
                delete this.room.playerColors[userId];
                this.randomizeStartAssignments();
                this.addLog(`${this.room.playerNames[userId]} перешёл в зрители.`);
                return this.update();
            }
            if (event === "shuffle-starts" && userId === this.room.hostId && this.room.phase === "lobby") {
                this.randomizeStartAssignments(true);
                this.addLog("Хост заново перемешал стартовые позиции роботов.");
                return this.update();
            }
            if (event === "select-color" && this.room.phase === "lobby" && this.room.playerSlots.includes(userId)
                && ROBOT_COLORS.includes(value)) {
                const occupied = this.room.playerSlots.some((id) => id && id !== userId && this.room.playerColors[id] === value);
                if (occupied)
                    return this.userRegistry.send(userId, "message", "Этот цвет уже выбрал другой игрок.");
                this.room.playerColors[userId] = value;
                return this.update();
            }
            if (event === "start-game" && userId === this.room.hostId && this.room.phase === "lobby") {
                this.startGame();
                return;
            }
            if (event === "restart-game" && userId === this.room.hostId) {
                this.cancelProgrammingTimer();
                this.cancelAutoFillResolution();
                this.resolutionId = (this.resolutionId || 0) + 1;
                this.powerDownChoiceUsers = [];
                this.powerDownChoices = new Map();
                this.room.phase = "lobby";
                this.room.robots = [];
                this.room.winnerId = null;
                this.room.powerDownChoice = null;
                this.room.boardEvents = [];
                this.room.programmingAutoFill = null;
                this.addLog("Хост вернул игру в лобби.");
                return this.update();
            }
            if (event === "choose-reentry" && this.room.phase === "reentry") {
                this.chooseReentry(userId, value);
                return;
            }
            if (event === "choose-power-down-continuation" && this.room.phase === "power-down-choice"
                && value && typeof value.enabled === "boolean") {
                this.choosePowerDownContinuation(userId, value.enabled);
                return;
            }
            const player = this.players[userId];
            if (!player || this.room.phase !== "programming")
                return;
            if (event === "set-power-down-intent") {
                if (player.locked || player.poweredDown || !value || typeof value.enabled !== "boolean") return;
                if (value.enabled && (player.damage <= 0 || this.specialRules.disablePowerDown)) return;
                player.powerDownIntent = value.enabled;
                return this.update();
            }
            if (player.locked)
                return;
            if (event === "assign-register" && value && typeof value === "object") {
                const register = Number(value.register);
                const cardId = String(value.cardId || "");
                if (!Number.isInteger(register) || register < 0 || register >= 5 || player.lockedRegisters.includes(register)
                    || !player.hand.some((card) => card.id === cardId)) return;
                const previous = player.selected.indexOf(cardId);
                const displaced = player.selected[register];
                player.selected[register] = cardId;
                if (previous >= 0 && previous !== register && !player.lockedRegisters.includes(previous))
                    player.selected[previous] = displaced || null;
                return this.update();
            }
            if (event === "swap-registers" && value && typeof value === "object") {
                const from = Number(value.from);
                const to = Number(value.to);
                if (![from, to].every((register) => Number.isInteger(register) && register >= 0 && register < 5)
                    || player.lockedRegisters.includes(from) || player.lockedRegisters.includes(to)) return;
                [player.selected[from], player.selected[to]] = [player.selected[to], player.selected[from]];
                return this.update();
            }
            if (event === "clear-register" && Number.isInteger(value) && value >= 0 && value < 5 && !player.lockedRegisters.includes(value)) {
                player.selected[value] = null;
                return this.update();
            }
            if (event === "toggle-card" && typeof value === "string") {
                const index = player.selected.indexOf(value);
                if (index >= 0 && !player.lockedRegisters.includes(index)) player.selected[index] = null;
                else if (player.hand.some((card) => card.id === value)) {
                    const target = player.selected.findIndex((cardId, register) => !cardId && !player.lockedRegisters.includes(register));
                    if (target >= 0) player.selected[target] = value;
                }
                return this.update();
            }
            if (event === "auto-program") {
                const available = shuffle(player.hand).map((card) => card.id);
                player.selected = player.selected.map((cardId, register) =>
                    player.lockedRegisters.includes(register) ? cardId : available.shift() || null);
                return this.update();
            }
            if (event === "lock-program" && player.selected.every(Boolean)) {
                player.locked = true;
                player.autoFilledRegisters = [];
                this.addLog(`${this.room.playerNames[userId]} готов.`);
                if (this.areAllProgramsLocked()) {
                    this.cancelProgrammingTimer();
                    this.update();
                    this.resolveRound().catch((error) => {
                        this.addLog(`Ошибка разрешения хода: ${error.message}`);
                        this.room.phase = "programming";
                        this.update();
                    });
                } else {
                    this.maybeStartProgrammingTimer();
                    this.update();
                }
            }
        }
    }

    registry.createRoomManager(gamePath, GameState);
}

module.exports = init;
module.exports.BOARD_FEATURES = BOARD_FEATURES;
module.exports.BOARD_SIZE = BOARD_SIZE;
module.exports.COURSE_CARDS = COURSE_CARDS;
module.exports.BOARD_CARDS = BOARD_CARDS;
module.exports.BOARD_IMAGES = BOARD_IMAGES;
module.exports.orientFeatures = orientFeatures;
module.exports.START_CARDS = START_CARDS;
module.exports.START_IMAGES = START_IMAGES;
module.exports.START_LAYOUTS = START_LAYOUTS;
module.exports.conveyorArrivalTurn = conveyorArrivalTurn;
