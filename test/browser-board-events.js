"use strict";

const assert = require("assert");
const path = require("path");
const {spawn} = require("child_process");
const {chromium} = require(path.resolve(__dirname, "../../demo-server/node_modules/playwright-core"));

const serverDir = path.resolve(__dirname, "../../demo-server");
const port = process.env.BOARD_EVENTS_PORT || "3043";
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
    const page = await browser.newPage({viewport: {width: 1200, height: 900}});
    await page.goto(`http://127.0.0.1:${port}/roborally?room=board-events-browser&player=one&name=One`);
    await page.locator(".lobby-shell").waitFor();

    await page.evaluate(() => {
        const events = [
            {id: 1, type: "heal", userId: "one", color: "#4389ff", x: 1, y: 1, amount: 1},
            {id: 2, type: "flag", userId: "one", color: "#4389ff", x: 2, y: 2, flagNumber: 2},
            {id: 3, type: "archive", userId: "one", color: "#4389ff", x: 3, y: 3},
            {id: 4, type: "gear", userId: "one", color: "#4389ff", x: 4, y: 4, turn: -1},
            {id: 5, type: "conveyor", userId: "one", color: "#4389ff", x: 5, y: 5,
                direction: "east", turn: 1, express: true},
            {id: 6, type: "pusher", userId: "one", color: "#4389ff", x: 6, y: 6, direction: "south"}
        ];
        const robot = {userId: "one", color: "#4389ff", death: {id: 1, x: 7, y: 7, reason: "яма"}};
        ReactDOM.render(React.createElement("div", {className: "board-column", style: {width: "1000px"}},
            React.createElement("div", {className: "board-viewport", style: {width: "50%"}},
                React.createElement("div", {className: "board", style: {width: "100%"}},
                    React.createElement(BoardEvents, {events}), React.createElement(RobotDeath, {robot}),
                    React.createElement(Robot, {robot: {userId: "heading", color: "#4d8cff", x: 8, y: 8,
                        direction: "east", headingTurns: 5}, names: {heading: "Heading"}, ownUserId: "other"})))),
        document.getElementById("root"));
    });

    assert.equal(await page.locator(".board-event").count(), 6);
    for (const icon of ["heal", "flag", "archive", "gear", "conveyor", "pusher"])
        assert.equal(await page.locator(`[data-icon="${icon}"]`).count(), 1, `missing board event icon: ${icon}`);
    assert.equal(await page.locator(".board-event small, .board-event strong").count(), 0,
        "board event still contains a text label");
    assert(await page.locator(".board-event-gear.turn-left").count(), "left gear turn is not marked");
    assert.equal(await page.locator(".board-event-gear").evaluate((element) => getComputedStyle(element).animationName),
        "board-event-gear-pulse", "gear event still uses the generic floating animation");
    assert(await page.locator(".board-event-conveyor.turn-right").count(), "conveyor turn is not marked");
    assert.equal(await page.locator(".board-event").first().evaluate((element) => getComputedStyle(element).animationName),
        "board-event-float");
    assert.equal(await page.locator(".robot-death-icon").count(), 1, "death icon is missing");
    assert.equal(await page.locator(".robot-death > b, .robot-death > small").count(), 0,
        "death animation still contains a text label");
    const eventSize = await page.locator(".board-event").first().evaluate((element) => parseFloat(getComputedStyle(element).width));
    assert(eventSize >= 28, `board event icon is too small: ${eventSize}px`);
    assert.equal(await page.locator('.robot[data-user-id="heading"] .robot-heading').evaluate((element) => element.style.transform),
        "", "robot heading unexpectedly overrides its CSS angle inline");
    assert.equal(await page.locator('.robot[data-user-id="heading"]').evaluate((element) => element.style.getPropertyValue("--robot-angle")),
        "450deg", "robot heading lost its continuous turn angle");
    assert((await page.locator('.robot[data-user-id="heading"] .robot-heading path').getAttribute("d")).includes("V92"),
        "robot still uses the old triangular heading marker");

    const centered = await page.evaluate(() => {
        const parent = document.querySelector(".board-column").getBoundingClientRect();
        const board = document.querySelector(".board-viewport").getBoundingClientRect();
        return {left: board.left - parent.left, right: parent.right - board.right};
    });
    assert(Math.abs(centered.left - centered.right) < 1,
        `board is not centered: left=${centered.left}, right=${centered.right}`);

    if (process.env.BOARD_EVENTS_SCREENSHOT) {
        await page.addStyleTag({content: ".board-event,.board-event-icon,.robot-death,.robot-death-icon,.robot-death::before,.robot-death::after,.robot-death i{animation:none!important;opacity:1!important}"});
        await page.screenshot({path: process.env.BOARD_EVENTS_SCREENSHOT});
    }

    console.log("Browser board event and centering checks passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    server.kill();
});
