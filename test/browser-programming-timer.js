"use strict";

const assert = require("assert");
const {launchBrowser, openUser, startSandbox, stopSandbox} = require("./browser-support");

const port = process.env.PROGRAMMING_TIMER_PORT || "3044";
const {server, ready} = startSandbox(port);
let browser;

(async () => {
    await ready;
    browser = await launchBrowser();
    const {page} = await openUser(browser, {port, room: "timer-browser", name: "One", viewport: {width: 1100, height: 800}});

    await page.evaluate(() => ReactDOM.render(React.createElement(ProgrammingTimer, {state: {
        phase: "programming", playerNames: {two: "Игрок 2"}, programmingTimer: {userId: "two", remaining: 30}
    }}), document.getElementById("root")));
    assert.equal(await page.locator(".timer-clock strong").innerText(), "30");
    assert.equal(await page.getByText("Игрок 2: после сигнала пустые регистры заполнятся случайно.", {exact: true}).count(), 1);
    assert(!await page.locator(".programming-timer").evaluate((element) => element.classList.contains("warning")));

    await page.evaluate(() => ReactDOM.render(React.createElement(ProgrammingTimer, {state: {
        phase: "programming", playerNames: {two: "Игрок 2"}, programmingTimer: {userId: "two", remaining: 10}
    }}), document.getElementById("root")));
    assert(await page.locator(".programming-timer").evaluate((element) => element.classList.contains("warning")),
        "last ten seconds have no warning state");
    assert.equal(await page.locator(".programming-timer").evaluate((element) => getComputedStyle(element).animationName),
        "timer-warning");

    const dockStates = await page.evaluate(() => {
        const base = {phase: "programming", round: 4, userId: "one", playerSlots: ["one", "two"],
            playerNames: {one: "Первый", two: "Второй"}};
        return {
            normal: bottomDockProgrammingState(base, true),
            target: bottomDockProgrammingState({...base,
                programmingTimer: {userId: "one", userIds: ["one"], remaining: 30}}, true),
            observer: bottomDockProgrammingState({...base,
                programmingTimer: {userId: "two", userIds: ["two"], remaining: 29}}, true),
            warning: bottomDockProgrammingState({...base,
                programmingTimer: {userId: "one", userIds: ["one"], remaining: 10}}, true),
            global: bottomDockProgrammingState({...base,
                programmingTimer: {userId: "one", userIds: ["one", "two"], global: true, remaining: 60}}, true),
            paused: bottomDockProgrammingState({...base, paused: true,
                programmingTimer: {userId: "one", userIds: ["one"], paused: true, remaining: 17}}, true),
            expired: bottomDockProgrammingState({...base,
                programmingAutoFill: {userId: "one", registers: [1, 2]}}, true),
            spectator: bottomDockProgrammingState(base, false)
        };
    });
    assert.equal(dockStates.normal.label, "ПРОГРАММИРОВАНИЕ · РАУНД 4");
    assert.equal(dockStates.target.label, "ВАШИ 30 СЕКУНД");
    assert.equal(dockStates.observer.label, "29 СЕКУНД · Второй");
    assert(dockStates.warning.className.includes("rr-dock-warning"), "last ten seconds do not turn the dock red");
    assert.equal(dockStates.global.label, "ОСОБЫЙ ТАЙМЕР · 60 СЕКУНД");
    assert.equal(dockStates.paused.label, "ТАЙМЕР НА ПАУЗЕ");
    assert(dockStates.paused.className.includes("rr-dock-paused"), "paused dock has no blue state");
    assert.equal(dockStates.expired.label, "ВРЕМЯ ВЫШЛО · РЕГИСТРЫ ЗАПОЛНЕНЫ");
    assert.equal(dockStates.spectator.label, null, "spectator received a player dock state");

    await page.evaluate(() => {
        const cards = Array.from({length: 5}, (_, index) => ({id: `card-${index}`, priority: 100 + index,
            type: "move1", label: `Card ${index + 1}`}));
        const state = {phase: "programming", round: 2, userId: "two", playerSlots: ["one", "two"]};
        const privateState = {hand: cards, selected: cards.map(({id}) => id), registerCards: cards,
            lockedRegisters: [], autoFilledRegisters: [2, 3, 4], locked: true, damage: 0,
            poweredDown: false, powerDownIntent: false, canPowerDown: false};
        const automatic = {phase: "programming", playerNames: {two: "Игрок 2"},
            programmingAutoFill: {userId: "two", registers: [2, 3, 4], count: 3}};
        ReactDOM.render(React.createElement("div", null,
            React.createElement(ProgrammingTimer, {state: automatic}),
            React.createElement(Program, {state, privateState, app: {socket: {emit() { throw new Error("locked program emitted an event"); }}}})),
        document.getElementById("root"));
    });
    assert.equal(await page.locator(".register.auto-filled").count(), 3);
    assert.equal(await page.locator(".card.auto-filled-source").count(), 3);
    assert.equal(await page.locator(".card:enabled").count(), 0, "auto-filled cards remain editable");
    assert.equal(await page.locator(".register.auto-filled").first().evaluate((element) => getComputedStyle(element).animationName),
        "auto-register-fill");
    assert.equal(await page.getByText("Случайное заполнение · Игрок 2: 3, 4, 5", {exact: true}).count(), 1);

    await page.evaluate(() => ReactDOM.render(React.createElement(PlayerPanel, {state: {
        phase: "programming", userId: "one", playerSlots: ["one", "two", "three"],
        playerNames: {one: "Готов", two: "Спит", three: "Выбирает"}, flags: [],
        robots: [{userId: "one", color: "#4d8cff"}, {userId: "two", color: "#47c879"}, {userId: "three", color: "#e05252"}],
        playerStats: {one: {ready: true}, two: {ready: true, poweredDown: true}, three: {ready: false}}
    }}), document.getElementById("root")));
    assert.equal(await page.locator(".player-name-status.ready", {hasText: "Готов"}).count(), 1,
        "ready player is not marked in the player panel");
    assert.equal(await page.locator(".player-name-status.powered-down", {hasText: "Спит"}).count(), 1,
        "powered-down player is not marked with a separate color");
    assert.equal(await page.locator(".player-name-status:not(.ready):not(.powered-down):not(.power-down-next)", {hasText: "Выбирает"}).count(), 1,
        "programming player received a completed status");

    await page.emulateMedia({reducedMotion: "reduce"});
    await page.evaluate(() => ReactDOM.render(React.createElement("section", {
        className: "bottom-dock rr-dock-programming rr-dock-warning rr-phase-cue-active rr-timer-cue-active"
    }, React.createElement("button", {className: "bottom-dock-toggle"}, "ВАШИ 10 СЕКУНД")), document.getElementById("root")));
    assert.equal(await page.locator(".bottom-dock").evaluate((element) => getComputedStyle(element).animationName), "none",
        "reduced-motion mode still animates the programming cue");
    assert.equal(await page.locator(".bottom-dock-toggle").evaluate((element) => getComputedStyle(element).animationName), "none",
        "reduced-motion mode still pulses the last ten seconds");

    console.log("Programming timer browser states passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    stopSandbox(server);
});
