"use strict";

const assert = require("assert");
const path = require("path");
const {spawn} = require("child_process");
const {chromium} = require(path.resolve(__dirname, "../../demo-server/node_modules/playwright-core"));

const serverDir = path.resolve(__dirname, "../../demo-server");
const port = process.env.PROGRAMMING_TIMER_PORT || "3044";
const server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir, env: {...process.env, PORT: port}, stdio: ["ignore", "pipe", "pipe"]
});
let browser;
let serverError = "";
server.stderr.on("data", (chunk) => serverError += String(chunk));

(async () => {
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("server timeout")), 8000);
        server.stdout.on("data", (chunk) => {
            if (String(chunk).includes(port)) { clearTimeout(timeout); resolve(); }
        });
        server.once("error", reject);
        server.once("exit", (code) => reject(new Error(`server exited: ${code}${serverError ? `\n${serverError}` : ""}`)));
    });
    browser = await chromium.launch({headless: true,
        executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
    const page = await browser.newPage({viewport: {width: 1100, height: 800}});
    await page.goto(`http://127.0.0.1:${port}/roborally?room=timer-browser&player=one&name=One`);
    await page.locator(".lobby-shell").waitFor();

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

    console.log("Programming timer browser states passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    server.kill();
});
