"use strict";

const assert = require("assert");
const init = require("../module");

let GameState;
class RoomState { constructor() { this.room = {}; } }
const registry = {RoomState, games: {roborally: {id: "test"}}, handleAppPage() {},
    createRoomManager(_path, Type) { GameState = Type; }};
init({app: {use() {}}, users: registry, static() { return () => {}; }}, "/laser-test");

function gameOn(board, rotation = 0) {
    const game = new GameState("host", {}, {send() {}});
    game.room.course = {board, rotation};
    game.room.board = {name: board, size: 12, start: game.room.board.start};
    game.room.playerNames = {shooter: "Shooter", target: "Target"};
    game.players = {shooter: {damage: 0, lives: 3, poweredDown: false},
        target: {damage: 0, lives: 3, poweredDown: false}};
    return game;
}

// A visible robot fires to the first robot, and neither token is removed
// until the animation has been delivered to clients.
{
    const game = gameOn("Chess");
    game.room.robots = [
        {userId: "shooter", x: 0, y: 0, direction: "east", color: "#f00", eliminated: false},
        {userId: "target", x: 3, y: 0, direction: "north", color: "#0f0", eliminated: false}
    ];
    const hits = game.fireAllLasers();
    const shot = game.room.laserShots.find((item) => item.sourceUserId === "shooter");
    assert.deepStrictEqual(shot.start, {x: .5, y: .5});
    assert.deepStrictEqual(shot.end, {x: 3.5, y: .5});
    assert.equal(shot.targetUserId, "target");
    assert.equal(game.players.target.damage, 0, "damage preceded the beam animation");
    assert.deepStrictEqual([game.getRobot("shooter").x, game.getRobot("shooter").y], [0, 0]);
    game.applyLaserHits(hits);
    assert.equal(game.players.target.damage, 1);
}

// The rotated wall and overlay coordinates use the same final screen space.
for (const rotation of [0, 90, 180, 270]) {
    const turns = rotation / 90;
    let point = {x: 7, y: 3};
    for (let index = 0; index < turns; index++) point = {x: 11 - point.y, y: point.x};
    const directions = ["north", "east", "south", "west"];
    const direction = directions[(directions.indexOf("west") + turns) % 4];
    const vectors = {north: [0,-1], east: [1,0], south: [0,1], west: [-1,0]};
    const [dx,dy] = vectors[direction];
    const game = gameOn("Cross", rotation);
    game.room.robots = [
        {userId: "shooter", ...point, direction, color: "#f00", eliminated: false},
        {userId: "target", x: point.x + dx, y: point.y + dy, direction: "north", color: "#0f0", eliminated: false}
    ];
    const hits = game.fireAllLasers();
    const shot = game.room.laserShots.find((item) => item.sourceUserId === "shooter");
    assert.deepStrictEqual(shot.start, {x: point.x + .5, y: point.y + .5});
    assert.deepStrictEqual(shot.end, {x: point.x + .5 + dx * .5, y: point.y + .5 + dy * .5});
    assert.equal(shot.targetUserId, null);
    game.applyLaserHits(hits);
    assert.equal(game.players.target.damage, 0);
}

console.log("Focused robot laser regression passed");
