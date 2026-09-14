"use strict";

const assert = require("assert");
const init = require("../module");

let GameState;
class RoomState { constructor() { this.room = {}; } }
init({app: {use() {}}, users: {
    RoomState, games: {roborally: {id: "test"}}, handleAppPage() {},
    createRoomManager(_path, Type) { GameState = Type; }
}, static() { return () => {}; }}, "/pause-test");

const makePlayer = (id, locked = false) => ({
    hand: [{id: `${id}-card`, type: "move1", label: "Вперёд 1", priority: 500}],
    selected: Array(5).fill(null), registers: [], lockedRegisters: [], autoFilledRegisters: [], locked,
    damage: 0, lives: 3, checkpoints: 0, poweredDown: false, powerDownIntent: false, powerDownNextRound: false
});

(async () => {
    const game = new GameState("host", {}, {send() {}});
    game.userRegistry = {send() {}};
    game.room.phase = "programming";
    game.room.playerSlots = ["host", "guest"];
    game.room.playerNames = {host: "Host", guest: "Guest"};
    game.players = {host: makePlayer("host", true), guest: makePlayer("guest")};
    assert(game.maybeStartProgrammingTimer());

    game.userEvent("guest", "set-paused", [{paused: true}]);
    assert.equal(game.room.paused, false, "a non-host paused the game");

    game.userEvent("host", "set-paused", [{paused: true}]);
    assert.equal(game.room.paused, true);
    assert.equal(game.room.programmingTimer.paused, true);
    const frozen = game.room.programmingTimer.remaining;
    game.userEvent("guest", "toggle-card", ["guest-card"]);
    assert.equal(game.players.guest.selected.filter(Boolean).length, 0, "program changed while paused");

    let resumed = false;
    const pauseGate = game.waitWhilePaused().then(() => { resumed = true; });
    await Promise.resolve();
    assert.equal(resumed, false, "resolution pause gate opened early");
    game.userEvent("host", "set-paused", [{paused: false}]);
    await pauseGate;
    assert.equal(game.room.paused, false);
    assert.equal(game.room.programmingTimer.paused, false);
    assert.equal(game.room.programmingTimer.remaining, frozen);
    assert.equal(resumed, true);
    game.cancelProgrammingTimer();
    console.log("Host pause and timer freeze checks passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
