"use strict";

const assert = require("assert");
const init = require("../module");

let GameState;
class RoomState { constructor() { this.room = {}; } }
const registry = {RoomState, games: {roborally: {id: "test"}}, handleAppPage() {},
    createRoomManager(_path, Type) { GameState = Type; }};
init({app: {use() {}}, users: registry, static() { return () => {}; }}, "/special-rules-test");

const card = (id) => ({id, priority: 100, type: "move1", label: id});
const player = (id, cards = 9) => ({hand: Array.from({length: cards}, (_, index) => card(`${id}-${index}`)),
    selected: Array(5).fill(null), registers: [], lockedRegisters: [], autoFilledRegisters: [], locked: false,
    damage: 0, lives: 3, checkpoints: 0, checkpointAvailable: 1, poweredDown: false,
    powerDownIntent: false, powerDownNextRound: false, powerDownDamage: 0});

function gameWithCourse(id) {
    const game = new GameState("host", {}, {send() {}});
    game.userRegistry = {send() {}};
    game.room.course = {...game.room.courses.find((course) => course.id === id)};
    game.room.playerNames = {};
    game.room.playerSlots = [];
    game.room.robots = [];
    game.room.log = [];
    return game;
}

// Factory Rejects starts damaged and rejects even an otherwise legal Power Down intent.
{
    const game = gameWithCourse("factory-rejects");
    const ids = Array.from({length: 5}, (_, index) => `p${index}`);
    game.room.playerSlots = ids;
    game.room.playerNames = Object.fromEntries(ids.map((id) => [id, id]));
    game.room.playerColors = {};
    game.room.startAssignments = Object.fromEntries(ids.map((id, index) => [id, index]));
    game.startGame();
    ids.forEach((id) => {
        assert.equal(game.players[id].damage, 2, "Factory Rejects robot did not start with two damage");
        assert.equal(game.privateState(id).canPowerDown, false);
        assert.equal(game.privateState(id).powerDownUnavailableReason, "Курс запрещает Power Down");
        game.userEvent(id, "set-power-down-intent", [{enabled: true}]);
        assert.equal(game.players[id].powerDownIntent, false, "Factory Rejects allowed Power Down");
    });
    game.cancelProgrammingTimer();
}

// Set to Kill doubles only robot fire; one visible beam event carries two damage.
{
    const game = gameWithCourse("set-to-kill");
    game.room.phase = "resolving";
    game.room.playerSlots = ["shooter", "target"];
    game.room.playerNames = {shooter: "Shooter", target: "Target"};
    game.players = {shooter: player("shooter"), target: player("target")};
    game.room.robots = [
        {userId: "shooter", x: 1, y: 1, direction: "east", color: "#48f", eliminated: false, destroyed: false},
        {userId: "target", x: 3, y: 1, direction: "north", color: "#f55", eliminated: false, destroyed: false}
    ];
    const features = {conveyors: {}, express: new Set(), walls: new Set(), pits: new Set(), repairs: new Set(),
        gears: {}, pushers: [], lasers: [], conveyorTurns: {}};
    Object.defineProperty(game, "features", {value: features});
    const hits = game.fireAllLasers();
    const shot = game.room.laserShots.find((item) => item.sourceUserId === "shooter");
    assert.equal(shot.count, 2, "Set to Kill robot laser is not doubled");
    assert.equal(hits.find((hit) => hit.userId === "target").amount, 2);
    game.applyLaserHits(hits);
    assert.equal(game.players.target.damage, 2);
}

// Moving Targets carries flags with both conveyor phases and restores a fallen
// flag without changing archives or already earned checkpoint credit.
{
    const game = gameWithCourse("moving-targets");
    game.room.phase = "resolving";
    game.room.playerSlots = ["one"];
    game.room.playerNames = {one: "One"};
    game.players = {one: player("one")};
    game.players.one.checkpoints = 1;
    game.room.robots = [{userId: "one", x: 8, y: 8, direction: "north", archive: {x: 1, y: 1},
        color: "#48f", eliminated: false, destroyed: false}];
    game.room.flags = [{x: 1, y: 1, homeX: 1, homeY: 1, number: 1}];
    const features = {conveyors: {"1,1": "east", "2,1": "south"}, express: new Set(["1,1"]),
        walls: new Set(), pits: new Set(["2,2"]), repairs: new Set(), gears: {}, pushers: [], lasers: [], conveyorTurns: {}};
    Object.defineProperty(game, "features", {value: features});
    game.moveConveyors(true);
    assert.deepStrictEqual([game.room.flags[0].x, game.room.flags[0].y], [2, 1]);
    game.moveConveyors(false);
    assert.equal(game.room.flags[0].offBoard, true);
    assert.equal(game.room.flags[0].x, null);
    assert(game.restoreMovingFlags());
    assert.deepStrictEqual([game.room.flags[0].x, game.room.flags[0].y], [1, 1]);
    assert.deepStrictEqual(game.room.robots[0].archive, {x: 1, y: 1});
    assert.equal(game.players.one.checkpoints, 1);
}

// Ball Lightning starts its course timer immediately for every unfinished robot.
{
    const game = gameWithCourse("ball-lightning");
    game.room.phase = "programming";
    game.room.playerSlots = ["one", "two"];
    game.room.playerNames = {one: "One", two: "Two"};
    game.players = {one: player("one", 5), two: player("two", 5)};
    assert(game.maybeStartProgrammingTimer());
    assert.equal(game.room.programmingTimer.global, true);
    assert.equal(game.room.programmingTimer.remaining, 30);
    assert.deepStrictEqual(game.room.programmingTimer.userIds, ["one", "two"]);
    assert(game.expireProgrammingTimer("one", game.programmingTimerGeneration));
    assert(game.players.one.locked && game.players.two.locked, "Ball Lightning did not lock every timed-out player");
    assert(game.players.one.selected.every(Boolean) && game.players.two.selected.every(Boolean));
    assert.equal(game.room.programmingAutoFill.fills.length, 2);
    game.cancelAutoFillResolution();
}

// The timer engine also supports Tight Collar's one-minute limit (two timer
// flips), while its two-board layout remains unsupported.
{
    const game = gameWithCourse("ball-lightning");
    game.room.course = {name: "Tight Collar", specialRules: {programmingSeconds: 60}};
    game.room.phase = "programming";
    game.room.playerSlots = ["one", "two"];
    game.room.playerNames = {one: "One", two: "Two"};
    game.players = {one: player("one", 5), two: player("two", 5)};
    assert(game.maybeStartProgrammingTimer());
    assert.equal(game.room.programmingTimer.remaining, 60);
    game.cancelProgrammingTimer();
}

// A Moving Targets flag lost during register 5 must return before the next
// programming phase, since there is no sixth register opening to restore it.
(async () => {
    const game = gameWithCourse("moving-targets");
    game.room.phase = "programming";
    game.room.round = 1;
    game.room.playerSlots = ["one"];
    game.room.playerNames = {one: "One"};
    game.players = {one: {...player("one"), poweredDown: true, locked: true}};
    game.room.robots = [{userId: "one", x: 8, y: 8, direction: "north", archive: {x: 1, y: 1},
        color: "#48f", eliminated: false, destroyed: false}];
    game.room.flags = [{x: 1, y: 1, homeX: 1, homeY: 1, number: 1}];
    game.room.log = [];
    game.room.boardEvents = [];
    game.room.laserShots = [];
    game.showStage = async () => {};
    game.moveConveyors = (expressOnly) => {
        if (!expressOnly && game.room.register === 5) {
            game.room.flags[0].x = null;
            game.room.flags[0].y = null;
            game.room.flags[0].offBoard = true;
        }
    };
    game.activatePushers = () => {};
    game.activateGears = () => {};
    game.fireAllLasers = () => [];
    game.applyLaserHits = () => {};
    game.touchCheckpoints = () => {};
    game.cleanupRound = () => false;
    game.advanceToNextRound = () => { game.room.phase = "advanced"; };

    await game.resolveRound();
    assert.deepStrictEqual([game.room.flags[0].x, game.room.flags[0].y], [1, 1],
        "register-5 flag was not restored before the next round");
    assert.equal(game.room.flags[0].offBoard, false);
    assert(game.room.log.some((entry) => entry.includes("возвращается")),
        "register-5 flag restoration was not logged");
    console.log("Implemented course special rules passed regression checks.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
