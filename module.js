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
const BOARD_CARDS = {
    Cross: "Cross.png", "Spin Zone": "Spin.png", "Chess": "Chess.png", "Chop Shop": "ChopShop.png",
    "Risky Exchange": "exchange.png", "Island": "Island.png", "Maelstrom": "Maelstrom.png", "Vault": "Vault.png"
};
const START_CARDS = ["Старт 1.jpg", "Старт 2.jpg"];
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
const COURSE_CARDS = [
    {id: "dizzy-dash", name: "Dizzy Dash", board: "Spin Zone", rotation: 0, players: "2–8", min: 2, max: 8, length: "короткая", level: "лёгкая", flags: [[5, 4], [10, 11], [1, 6]]},
    {id: "risky-exchange", name: "Risky Exchange", board: "Risky Exchange", rotation: 0, players: "2–8", min: 2, max: 8, length: "средняя", level: "лёгкая", flags: [[7, 1], [9, 7], [1, 4]]},
    {id: "island-hop", name: "Island Hop", board: "Island", rotation: 0, players: "2–8", min: 2, max: 8, length: "средняя", level: "средняя", flags: [[6, 1], [1, 6], [11, 4]]},
    {id: "checkmate", name: "Checkmate", board: "Chess", rotation: 0, players: "5–8", min: 5, max: 8, length: "короткая", level: "лёгкая", flags: [[7, 2], [3, 8]]},
    {id: "chop-shop", name: "Chop Shop Challenge", board: "Chop Shop", rotation: 0, players: "2–4", min: 2, max: 4, length: "средняя", level: "средняя", flags: [[4, 9], [9, 11], [1, 10], [11, 7]]},
    {id: "twister", name: "Twister", board: "Spin Zone", rotation: 0, players: "5–8", min: 5, max: 8, length: "средняя", level: "средняя", flags: [[2, 9], [3, 2], [9, 2], [8, 9]]},
    {id: "vault-assault", name: "Vault Assault", board: "Vault", rotation: 0, players: "2–4", min: 2, max: 4, length: "короткая", level: "эксперт", flags: [[6, 3], [4, 10], [8, 5]]},
    {id: "whirlwind-tour", name: "Whirlwind Tour", board: "Maelstrom", rotation: 0, players: "5–8", min: 5, max: 8, length: "средняя", level: "эксперт", flags: [[8, 0], [3, 11], [11, 6]]},
    {id: "lost-bearings", name: "Lost Bearings", board: "Cross", rotation: 0, players: "2–4", min: 2, max: 4, length: "средняя", level: "эксперт", flags: [[1, 2], [10, 9], [2, 8]]}
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
        "1,1": "east", "2,1": "east", "3,1": "east", "4,1": "east", "5,1": "south", "6,1": "north", "10,1": "west", "11,1": "west",
        "5,2": "south", "6,2": "north", "5,3": "south", "6,3": "north",
        "0,5": "west", "1,5": "west", "2,5": "west", "3,5": "west", "8,5": "west", "9,5": "west", "10,5": "west", "11,5": "west",
        "0,6": "east", "1,6": "east", "2,6": "east", "3,6": "east", "8,6": "east", "9,6": "east", "10,6": "east", "11,6": "east",
        "5,7": "south", "6,7": "north", "5,8": "south", "6,8": "north",
        "5,9": "south", "6,9": "north",
        "0,10": "east", "1,10": "south", "5,10": "south", "6,10": "north", "7,10": "west", "8,10": "west", "9,10": "west", "10,10": "west",
        "1,11": "south", "5,11": "south", "6,11": "north", "10,11": "north"
    },
    express: new Set(),
    conveyorTurns: {},
    pushers: [],
    walls: new Set([...COMMON_WALLS,
        "7,2,west", "1,3,east", "7,3,south", "7,3,west", "3,4,west",
        "7,7,west", "4,8,west", "7,8,west", "8,9,west", "7,11,east"
    ]),
    lasers: [
        {x: 4, y: 2, direction: "north", count: 1},
        {x: 8, y: 3, direction: "north", count: 2},
        {x: 2, y: 8, direction: "east", count: 1},
        {x: 7, y: 8, direction: "east", count: 1}
    ]
};
const EMPTY_FEATURES = {pits: new Set(), repairs: new Set(), gears: {}, conveyors: {}, express: new Set(), conveyorTurns: {}, pushers: [], walls: new Set(), lasers: []};

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

function boardFeatures({pits = "", repairs = "", gears = "", conveyors = "", express = "", walls = "", lasers = [], pushers = []}) {
    return {size: BOARD_SIZE, pits: cells(pits), repairs: cells(repairs), gears: mapped(gears, Number),
        conveyors: mapped(conveyors), express: cells(express), conveyorTurns: {},
        walls: new Set([...COMMON_WALLS, ...cells(walls)]), lasers, pushers};
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
        1,10,west 2,10,west 3,10,west 4,10,west 5,10,west 6,10,west 7,10,west 8,10,west 9,10,west 10,10,west`,
    express: "1,1 2,1 3,1 4,1 5,1 6,1 7,1 8,1 9,1 10,1 1,2 10,2 1,3 10,3 1,4 10,4 1,5 10,5 1,6 10,6 1,7 10,7 1,8 10,8 1,9 10,9 1,10 2,10 3,10 4,10 5,10 6,10 7,10 8,10 9,10 10,10",
    walls: "3,2,north 5,2,north 6,2,north 8,2,north 2,3,west 10,3,west 2,5,west 10,5,west 2,6,west 10,6,west 2,8,west 10,8,west 3,10,north 5,10,north 6,10,north 8,10,north"
});

const SPIN_FEATURES = boardFeatures({
    repairs: "2,3 8,3 3,8 9,8",
    gears: "2,2,1 3,3,1 8,2,1 9,3,1 2,8,1 3,9,1 8,8,1 9,9,1 5,2,-1 6,4,-1 4,5,-1 9,5,-1 2,6,-1 7,6,-1 5,7,-1 6,9,-1",
    conveyors: `1,1,east 2,1,east 3,1,east 4,1,south 1,2,north 4,2,south 1,3,north 4,3,south 1,4,west 2,4,west 3,4,west 4,4,west
        7,1,east 8,1,east 9,1,east 10,1,south 7,2,north 10,2,south 7,3,north 10,3,south 7,4,west 8,4,west 9,4,west 10,4,west
        1,7,east 2,7,east 3,7,east 4,7,south 1,8,north 4,8,south 1,9,north 4,9,south 1,10,west 2,10,west 3,10,west 4,10,west
        7,7,east 8,7,east 9,7,east 10,7,south 7,8,north 10,8,south 7,9,north 10,9,south 7,10,west 8,10,west 9,10,west 10,10,west`,
    express: "1,1 2,1 3,1 4,1 1,2 4,2 1,3 4,3 1,4 2,4 3,4 4,4 7,1 8,1 9,1 10,1 7,2 10,2 7,3 10,3 7,4 8,4 9,4 10,4 1,7 2,7 3,7 4,7 1,8 4,8 1,9 4,9 1,10 2,10 3,10 4,10 7,7 8,7 9,7 10,7 7,8 10,8 7,9 10,9 7,10 8,10 9,10 10,10",
    walls: "3,2,south 5,3,west 6,3,east 3,6,south 5,8,west 6,8,east 8,5,north 8,8,south",
    lasers: [{x: 3, y: 6, direction: "north", count: 1}, {x: 8, y: 5, direction: "south", count: 1},
        {x: 6, y: 3, direction: "west", count: 1}, {x: 5, y: 8, direction: "east", count: 1}]
});

const EXCHANGE_FEATURES = boardFeatures({
    pits: "1,9 10,11", repairs: "11,0 0,11 2,2 7,4",
    gears: "1,1,1 10,1,1 3,4,1 6,8,1 8,3,-1 3,5,-1 7,6,-1 3,8,-1 8,8,-1",
    conveyors: `1,0,south 3,0,north 5,0,south 6,0,north 8,0,south 0,1,west 3,1,north 5,1,south 6,1,north 8,1,south 11,1,west
        3,2,north 5,2,south 6,2,north 8,2,south 0,3,east 1,3,east 2,3,east 3,3,east 5,3,south 6,3,north 9,3,east 10,3,east 11,3,east
        5,4,south 6,4,north 0,5,west 1,5,west 2,5,west 3,5,west 4,5,west 7,5,west 8,5,west 9,5,west 10,5,west
        0,6,east 1,6,east 2,6,east 3,6,east 4,6,east 7,6,east 8,6,east 9,6,east 10,6,east 11,6,east
        5,7,south 6,7,north 0,8,west 1,8,west 2,8,west 5,8,south 6,8,north 9,8,west 10,8,west 11,8,west
        3,9,north 5,9,south 6,9,north 8,9,south 3,10,north 5,10,south 6,10,north 8,10,south 1,11,south 3,11,north 5,11,south 6,11,north 8,11,south`,
    express: "3,0 6,0 3,1 6,1 3,2 6,2 3,3 6,3 6,4 7,6 8,6 9,6 10,6 11,6",
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
    conveyors: `5,0,south 6,0,north 0,1,west 2,1,west 3,1,west 4,1,west 5,1,south 6,1,north
        0,3,east 1,3,east 2,3,east 4,3,east 5,3,east 6,3,east 7,3,east 8,3,east 9,3,east 10,3,east 11,3,east
        9,4,north 7,5,south 9,5,west 10,5,west 11,5,west 4,6,west 5,6,west 6,6,west 8,6,east 9,6,east 10,6,east 11,6,east
        6,7,north 0,8,west 1,8,west 2,8,west 9,8,west 10,8,west 11,8,west
        3,9,north 6,9,north 9,9,west 10,9,west 3,10,north 6,10,north 10,10,west 3,11,north 6,11,north 10,11,north`,
    express: "4,3 5,3 6,3 7,3 8,3 9,3 9,4 9,5 10,5 11,5",
    walls: "1,1,north 1,2,north 4,2,west 3,3,north 10,3,north 8,5,north 8,5,west 6,6,north 10,6,north 1,7,north 3,7,north 5,8,west 8,8,west 1,10,north 5,10,west",
    lasers: [{x: 1, y: 1, direction: "north", count: 3}, {x: 4, y: 2, direction: "east", count: 1},
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
        1,7,north 2,7,north 3,7,north 4,7,west 5,7,west 6,7,west 7,7,west 8,7,south 9,7,south 10,7,south
        1,8,north 2,8,north 3,8,west 4,8,west 5,8,west 6,8,west 7,8,west 8,8,west 9,8,west 10,8,south
        1,9,north 2,9,west 3,9,west 4,9,west 5,9,west 6,9,west 7,9,west 8,9,west 9,9,west 10,9,south
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
    const materialsDir = path.resolve(__dirname, "..", "Roborally");

    registry.handleAppPage(gamePath, path.join(__dirname, "public", "app.html"));
    app.use("/roborally", wsServer.static(path.join(__dirname, "public")));
    app.use("/roborally/materials", wsServer.static(materialsDir));

    class GameState extends wsServer.users.RoomState {
        constructor(hostId, hostData, userRegistry) {
            super(hostId, hostData, userRegistry, registry.games.roborally.id, gamePath);
            this.players = {};
            this.deck = [];
            this.discard = [];
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
                onlinePlayers: new Set(),
                spectators: new Set(),
                robots: [],
                flags: [],
                log: ["Комната создана. Займите место робота."],
                winnerId: null,
                resolution: null,
                board: {name: "Cross", size: BOARD_SIZE, start: START_CARDS[1]},
                course: {...COURSE_CARDS.find((course) => course.id === "lost-bearings"), start: START_CARDS[1]},
                courses: COURSE_CARDS,
                boardCards: BOARD_CARDS,
                startCards: START_CARDS
            };
        }

        publicState() {
            const showPrograms = this.room.phase === "resolving" || this.room.phase === "finished";
            const revealed = showPrograms ? (this.room.revealedRegisters || 0) : 0;
            return {
                ...this.room,
                programs: showPrograms ? Object.fromEntries(this.room.playerSlots.filter(Boolean).map((userId) => {
                    const player = this.players[userId];
                    const cards = player.poweredDown ? Array(5).fill(null) : player.selected.map((id) => this.cardById(player, id));
                    return [userId, {poweredDown: player.poweredDown,
                        cards: cards.map((card, index) => index < revealed && card ? card : null)}];
                })) : {},
                playerStats: Object.fromEntries(Object.entries(this.players).map(([userId, player]) => [userId, {
                    damage: player.damage,
                    lives: player.lives,
                    checkpoints: player.checkpoints,
                    poweredDown: player.poweredDown,
                }])),
                onlinePlayers: [...this.room.onlinePlayers],
                spectators: [...this.room.spectators],
                robots: this.room.robots.map((robot) => ({...robot})),
                log: this.room.log.slice(-12)
            };
        }

        privateState(userId) {
            const player = this.players[userId];
            return player ? {
                hand: player.hand,
                selected: player.selected,
                registerCards: player.selected.map((id) => this.cardById(player, id)),
                lockedRegisters: player.lockedRegisters || [],
                locked: player.locked,
                damage: player.damage,
                lives: player.lives,
                checkpoints: player.checkpoints,
                poweredDown: player.poweredDown,
                powerDownSelected: player.powerDownSelected,
                resolving: this.room.phase === "resolving",
                reentry: this.room.phase === "reentry" ? {
                    active: this.room.reentryUserId === userId,
                    candidates: this.room.reentryUserId === userId ? this.reentryCandidates(userId) : []
                } : null
            } : {hand: [], selected: [], registerCards: [], lockedRegisters: [], locked: false};
        }

        addLog(text) {
            this.room.log.push(text);
            if (this.room.log.length > 30)
                this.room.log.splice(0, this.room.log.length - 30);
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

        get startFeatures() {
            return START_LAYOUTS[this.room.board.start] || START_LAYOUTS[START_CARDS[1]];
        }

        boardKey(robot) {
            return positionKey(robot.x, robot.y);
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
        }

        startRound(skipReentry = false) {
            if (!skipReentry && this.prepareReentry())
                return;
            this.room.phase = "programming";
            this.room.round += 1;
            this.room.register = null;
            this.room.revealedRegisters = 0;
            this.room.resolution = null;
            this.room.stage = "Подготовка нового раунда";
            this.room.playerSlots.filter(Boolean).forEach((userId) => {
                const player = this.players[userId];
                player.checkpointAvailable = player.checkpoints + 1;
                const robot = this.getRobot(userId);
                if (robot && robot.eliminated) {
                    player.hand = [];
                    player.selected = Array(5).fill(null);
                    player.locked = true;
                    return;
                }
                player.poweredDown = false;
                player.powerDownSelected = false;
                this.deal(userId);
            });
            this.addLog(`Раунд ${this.room.round}: выберите пять карт программы.`);
            this.update();
            if (this.areAllProgramsLocked())
                setTimeout(() => this.resolveRound().catch((error) => {
                    this.addLog(`Ошибка разрешения хода: ${error.message}`);
                    this.room.phase = "programming";
                    this.update();
                }), STEP_DELAY_MS);
        }

        startGame() {
            const users = this.room.playerSlots.filter(Boolean);
            if (users.length < 2)
                return;
            if (users.length < this.room.course.min || users.length > this.room.course.max)
                return this.userRegistry.send(this.room.hostId, "message", `Для курса «${this.room.course.name}» рекомендовано игроков: ${this.room.course.players}.`);
            this.room.phase = "programming";
            this.room.round = 0;
            this.room.winnerId = null;
            this.room.board = {name: this.room.course.board, size: BOARD_SIZE, start: this.room.course.start};
            this.room.flags = this.room.course.flags.map(([x, y], index) => ({x, y, number: index + 1}));
            const startLayout = START_LAYOUTS[this.room.course.start] || START_LAYOUTS[START_CARDS[1]];
            this.room.robots = users.map((userId, slot) => ({
                userId,
                slot,
                x: startLayout.starts[slot].x,
                y: startLayout.starts[slot].y,
                direction: "north",
                color: ROBOT_COLORS[slot],
                eliminated: false,
                archive: {...startLayout.starts[slot]}
            }));
            users.forEach((userId) => {
                this.players[userId] = {
                    hand: [], selected: Array(5).fill(null), registers: [], lockedRegisters: [], locked: false, damage: 0, lives: 3, checkpoints: 0, poweredDown: false, powerDownSelected: false
                };
            });
            this.deck = shuffle(makeDeck());
            this.discard = [];
            this.destructionCounter = 0;
            this.addLog("Игра началась. Роботы получили программы.");
            this.startRound();
        }

        reboot(robot, reason) {
            const player = this.players[robot.userId];
            player.lives -= 1;
            player.damage = 0;
            if (player.lives <= 0) {
                robot.eliminated = true;
                this.addLog(`${this.room.playerNames[robot.userId]} потерял последнюю жизнь.`);
                return;
            }
            robot.destroyed = true;
            robot.destroyedOrder = ++this.destructionCounter;
            robot.x = null;
            robot.y = null;
            this.addLog(`${this.room.playerNames[robot.userId]} уничтожен (${reason}) и вернётся в конце раунда.`);
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
            const candidate = this.reentryCandidates(userId).find((item) => item.x === x && item.y === y
                && item.directions.includes(direction));
            if (!candidate)
                return;
            const robot = this.getRobot(userId);
            const player = this.players[userId];
            robot.x = x;
            robot.y = y;
            robot.direction = direction;
            robot.destroyed = false;
            delete robot.destroyedOrder;
            player.damage = Math.min(9, player.damage + 2);
            this.addLog(`${this.room.playerNames[userId]} возрождается на клетке ${x + 1}, ${y + 1}.`);
            this.room.reentryQueue.shift();
            this.room.reentryUserId = this.room.reentryQueue[0] || null;
            if (this.room.reentryUserId) {
                this.addLog(`${this.room.playerNames[this.room.reentryUserId]} выбирает возрождение.`);
                return this.update();
            }
            this.room.reentryQueue = [];
            this.startRound(true);
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
                this.reboot(robot, "падение с поля");
                return true;
            }
            const blockingRobot = this.robotAt(target.x, target.y, robot.userId);
            if (blockingRobot && !this.move(blockingRobot, direction, "толчок", visited))
                return false;
            robot.x = target.x;
            robot.y = target.y;
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
        }

        async executeCard(robot, card) {
            if (robot.eliminated || robot.destroyed)
                return;
            if (card.type === "left") robot.direction = rotate(robot.direction, -1);
            if (card.type === "right") robot.direction = rotate(robot.direction, 1);
            if (card.type === "uturn") robot.direction = rotate(robot.direction, 2);
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
            this.addLog(`${this.room.playerNames[robot.userId]} получает ${amount} урон (${source}).`);
            if (player.damage >= 10)
                this.reboot(robot, "10 повреждений");
        }

        fireLaser(x, y, direction, source, includeOrigin = false) {
            const robot = this.laserTarget(x, y, direction, includeOrigin);
            if (robot)
                this.damageRobot(robot, 1, source);
        }

        laserTarget(x, y, direction, includeOrigin = false) {
            const vector = VECTORS[direction];
            let targetX = includeOrigin ? x : x + vector.x;
            let targetY = includeOrigin ? y : y + vector.y;
            let firstCell = includeOrigin;
            while (this.isInside(targetX, targetY)) {
                if (!firstCell && this.wallBetween(targetX - vector.x, targetY - vector.y, direction))
                    break;
                firstCell = false;
                const robot = this.robotAt(targetX, targetY);
                if (robot)
                    return robot;
                targetX += vector.x;
                targetY += vector.y;
            }
            return null;
        }

        moveConveyors(expressOnly) {
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
            allowed.forEach(({robot, target}) => {
                if (!this.isInside(target.x, target.y)) return this.reboot(robot, "конвейер вынес за край");
                robot.x = target.x;
                robot.y = target.y;
            });
            allowed.forEach(({robot, direction}) => {
                if (robot.destroyed) return;
                let turn = this.isOnFactory(robot) ? this.features.conveyorTurns[this.boardKey(robot)] : null;
                const destinationDirection = this.conveyorAt(robot);
                if (!turn && destinationDirection && destinationDirection !== direction) {
                    const difference = (DIRECTIONS.indexOf(destinationDirection) - DIRECTIONS.indexOf(direction) + 4) % 4;
                    if (difference === 1) turn = 1;
                    if (difference === 3) turn = -1;
                }
                if (turn) robot.direction = rotate(robot.direction, turn);
                if (this.features.pits.has(this.boardKey(robot))) this.reboot(robot, "конвейер переместил в яму");
            });
        }

        activatePushers() {
            this.features.pushers.filter((pusher) => !pusher.active || pusher.active.includes(this.room.register))
                .forEach((pusher) => {
                    const robot = this.robotAt(pusher.x, pusher.y);
                    if (robot) this.move(robot, pusher.direction, "толкатель");
                });
        }

        activateGears() {
            this.room.robots.forEach((robot) => {
                if (robot.eliminated || robot.destroyed)
                    return;
                const gear = this.isOnFactory(robot) && this.features.gears[this.boardKey(robot)];
                if (gear)
                    robot.direction = rotate(robot.direction, gear);
            });
        }

        fireAllLasers() {
            // Determine every target first: laser fire is simultaneous, so a
            // robot destroyed by one beam still blocks the others this phase.
            const hits = new Map();
            const addHit = (robot, amount = 1) => {
                if (robot)
                    hits.set(robot, (hits.get(robot) || 0) + amount);
            };
            this.features.lasers.forEach((laser) => {
                addHit(this.laserTarget(laser.x, laser.y, laser.direction, true), laser.count || 1);
            });
            this.room.robots.forEach((robot) => {
                const player = this.players[robot.userId];
                if (!robot.eliminated && !robot.destroyed && player && !player.poweredDown)
                    addHit(this.laserTarget(robot.x, robot.y, robot.direction));
            });
            hits.forEach((amount, robot) => this.damageRobot(robot, amount, "лазеры"));
        }

        touchCheckpoints() {
            this.room.robots.forEach((robot) => {
                if (robot.eliminated || robot.destroyed)
                    return;
                const player = this.players[robot.userId];
                const flag = this.room.flags.find((item) => item.x === robot.x && item.y === robot.y);
                if (flag) {
                    robot.archive = {x: robot.x, y: robot.y};
                    if (flag.number === player.checkpointAvailable) {
                        player.checkpoints += 1;
                        player.checkpointAvailable = null;
                        this.addLog(`${this.room.playerNames[robot.userId]} активирует флаг ${flag.number}.`);
                        if (player.checkpoints === this.room.flags.length) {
                            this.room.phase = "finished";
                            this.room.winnerId = robot.userId;
                        }
                    }
                }
                if (this.isOnFactory(robot) && this.features.repairs.has(this.boardKey(robot)))
                    robot.archive = {x: robot.x, y: robot.y};
            });
        }

        cleanupRound() {
            // Wrenches repair only after register 5, not after every register.
            this.room.robots.forEach((robot) => {
                if (robot.eliminated || robot.destroyed || !this.isOnFactory(robot))
                    return;
                const onFlag = this.room.flags.some((flag) => flag.x === robot.x && flag.y === robot.y);
                if (this.features.repairs.has(this.boardKey(robot)) || onFlag) {
                    const player = this.players[robot.userId];
                    player.damage = Math.max(0, player.damage - 1);
                    robot.archive = {x: robot.x, y: robot.y};
                    this.addLog(`${this.room.playerNames[robot.userId]} обслуживает робота на ремонтной клетке.`);
                }
            });
        }

        async resolveRound() {
            if (this.room.phase !== "programming")
                return;
            this.room.phase = "resolving";
            this.room.revealedRegisters = 0;
            const resolutionId = (this.resolutionId || 0) + 1;
            this.resolutionId = resolutionId;
            const activeUsers = this.room.playerSlots.filter(Boolean);
            activeUsers.forEach((userId) => {
                const player = this.players[userId];
                if (!player.powerDownSelected) return;
                player.poweredDown = true;
                player.damage = 0;
                this.discard.push(...player.hand, ...(player.registers || []));
                player.hand = [];
                player.registers = [];
                player.selected = Array(5).fill(null);
                player.lockedRegisters = [];
            });
            this.room.resolution = [];
            for (let register = 0; register < 5 && this.room.phase === "resolving" && this.resolutionId === resolutionId; register++) {
                this.room.register = register + 1;
                this.room.revealedRegisters = register + 1;
                await this.showStage(`Регистр ${register + 1}: карты открыты`, 500);
                const actions = activeUsers.map((userId) => ({
                    userId,
                    robot: this.getRobot(userId),
                    card: this.cardById(this.players[userId], this.players[userId].selected[register])
                })).filter((item) => item.robot && item.card && !item.robot.eliminated)
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
                this.fireAllLasers();
                await this.showStage(`Регистр ${register + 1}: лазеры`);
                this.touchCheckpoints();
                await this.showStage(`Регистр ${register + 1}: флаги и архивы`);
            }
            if (this.resolutionId !== resolutionId || this.room.phase === "lobby")
                return;
            if (this.room.phase !== "finished")
                this.cleanupRound();
            activeUsers.forEach((userId) => {
                const player = this.players[userId];
                let program = player.selected.map((id) => this.cardById(player, id));
                if (player.poweredDown && player.damage >= 5) {
                    const lockedCount = Math.min(5, player.damage - 4);
                    if (this.deck.length < lockedCount) this.deck.push(...shuffle(this.discard.splice(0)));
                    if (this.deck.length < lockedCount) this.deck.push(...shuffle(makeDeck()));
                    program = Array(5).fill(null);
                    for (let register = 5 - lockedCount; register < 5; register++)
                        program[register] = this.deck.shift();
                    this.addLog(`${this.room.playerNames[userId]} получил случайные карты в регистрах, заблокированных во время Power Down.`);
                }
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
                this.startRound();
            }
        }

        areAllProgramsLocked() {
            return this.room.playerSlots.filter(Boolean).every((userId) => this.players[userId] && this.players[userId].locked);
        }

        userJoin(data) {
            const userId = data.userId;
            this.room.onlinePlayers.add(userId);
            this.room.spectators.add(userId);
            this.room.playerNames[userId] = String(data.userName || "Robot").slice(0, 60);
            this.update();
        }

        userLeft(userId) {
            this.room.onlinePlayers.delete(userId);
            this.update();
        }

        selectCourse(course) {
            this.room.course = {...course, start: course.start || START_CARDS[1]};
            this.room.board = {name: course.board, size: BOARD_SIZE, start: this.room.course.start};
            this.room.flags = course.flags.map(([x, y], index) => ({x, y, number: index + 1}));
            this.addLog(`Выбран курс «${course.name}».`);
            this.update();
        }

        userEvent(userId, event, args) {
            const value = args[0];
            if (event === "change-name" && typeof value === "string") {
                this.room.playerNames[userId] = value.slice(0, 60);
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
            if (event === "players-join" && this.room.phase === "lobby" && Number.isInteger(value) && value >= 0 && value < 8 && this.room.playerSlots[value] === null) {
                const oldSlot = this.room.playerSlots.indexOf(userId);
                if (oldSlot >= 0) this.room.playerSlots[oldSlot] = null;
                this.room.playerSlots[value] = userId;
                this.room.spectators.delete(userId);
                return this.update();
            }
            if (event === "spectators-join" && this.room.phase === "lobby") {
                const slot = this.room.playerSlots.indexOf(userId);
                if (slot >= 0) this.room.playerSlots[slot] = null;
                this.room.spectators.add(userId);
                return this.update();
            }
            if (event === "start-game" && userId === this.room.hostId && this.room.phase === "lobby") {
                this.startGame();
                return;
            }
            if (event === "restart-game" && userId === this.room.hostId) {
                this.resolutionId = (this.resolutionId || 0) + 1;
                this.room.phase = "lobby";
                this.room.robots = [];
                this.room.winnerId = null;
                this.addLog("Хост вернул игру в лобби.");
                return this.update();
            }
            if (event === "choose-reentry" && this.room.phase === "reentry") {
                this.chooseReentry(userId, value);
                return;
            }
            const player = this.players[userId];
            if (!player || this.room.phase !== "programming")
                return;
            if (event === "power-down") {
                if (player.locked) return;
                player.powerDownSelected = !player.powerDownSelected;
                return this.update();
            }
            if (player.locked)
                return;
            if (event === "assign-register" && !player.powerDownSelected && value && typeof value === "object") {
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
            if (event === "swap-registers" && !player.powerDownSelected && value && typeof value === "object") {
                const from = Number(value.from);
                const to = Number(value.to);
                if (![from, to].every((register) => Number.isInteger(register) && register >= 0 && register < 5)
                    || player.lockedRegisters.includes(from) || player.lockedRegisters.includes(to)) return;
                [player.selected[from], player.selected[to]] = [player.selected[to], player.selected[from]];
                return this.update();
            }
            if (event === "clear-register" && !player.powerDownSelected && Number.isInteger(value) && value >= 0 && value < 5 && !player.lockedRegisters.includes(value)) {
                player.selected[value] = null;
                return this.update();
            }
            if (event === "toggle-card" && !player.powerDownSelected && typeof value === "string") {
                const index = player.selected.indexOf(value);
                if (index >= 0 && !player.lockedRegisters.includes(index)) player.selected[index] = null;
                else if (player.hand.some((card) => card.id === value)) {
                    const target = player.selected.findIndex((cardId, register) => !cardId && !player.lockedRegisters.includes(register));
                    if (target >= 0) player.selected[target] = value;
                }
                return this.update();
            }
            if (event === "auto-program" && !player.powerDownSelected) {
                const available = shuffle(player.hand).map((card) => card.id);
                player.selected = player.selected.map((cardId, register) =>
                    player.lockedRegisters.includes(register) ? cardId : available.shift() || null);
                return this.update();
            }
            if (event === "lock-program" && (player.powerDownSelected || player.selected.every(Boolean))) {
                player.locked = true;
                this.addLog(`${this.room.playerNames[userId]} готов.`);
                this.update();
                if (this.areAllProgramsLocked())
                    this.resolveRound().catch((error) => {
                        this.addLog(`Ошибка разрешения хода: ${error.message}`);
                        this.room.phase = "programming";
                        this.update();
                    });
            }
        }
    }

    registry.createRoomManager(gamePath, GameState);
}

module.exports = init;
module.exports.BOARD_FEATURES = BOARD_FEATURES;
module.exports.BOARD_SIZE = BOARD_SIZE;
module.exports.COURSE_CARDS = COURSE_CARDS;
