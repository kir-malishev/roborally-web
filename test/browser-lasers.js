"use strict";

const assert = require("assert");
const path = require("path");
const {spawn} = require("child_process");
const {chromium} = require(path.resolve(__dirname, "../../demo-server/node_modules/playwright-core"));

const serverDir = path.resolve(__dirname, "../../demo-server");
const port = process.env.LASER_PORT || "3041";
const server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir, env: {...process.env, PORT: port}, stdio: ["ignore", "pipe", "pipe"]
});
let browser;

async function openUser(id, name) {
    const context = await browser.newContext({viewport: {width: 1280, height: 900}});
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/roborally?room=laser-regression&player=${id}&name=${encodeURIComponent(name)}`);
    await page.locator(".lobby-shell").waitFor();
    return {context, page};
}

(async () => {
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("server timeout")), 8000);
        server.stdout.on("data", (chunk) => {
            if (String(chunk).includes(port)) { clearTimeout(timeout); resolve(); }
        });
        server.once("exit", (code) => reject(new Error(`server exited: ${code}`)));
    });
    browser = await chromium.launch({headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
    const host = await openUser("laser-host", "Хост");
    const guest = await openUser("laser-guest", "Гость");
    await host.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await host.page.locator(".lobby-member", {hasText: "Гость"}).waitFor();
    await host.page.locator(".course-card", {hasText: "Moving Targets"}).click();
    await host.page.locator(".course-card.selected", {hasText: "Moving Targets"}).waitFor();
    await host.page.getByRole("button", {name: "Начать игру"}).click();
    await host.page.getByRole("button", {name: "Авто", exact: true}).click();
    await guest.page.getByRole("button", {name: "Авто", exact: true}).click();
    await host.page.getByRole("button", {name: "Готов", exact: true}).click();
    await guest.page.getByRole("button", {name: "Готов", exact: true}).click();
    await host.page.locator(".laser-effects").waitFor({timeout: 25000});

    const geometry = await host.page.evaluate(() => ({
        robots: [...document.querySelectorAll(".board-overlay > .robot")].map((robot) => ({
            userId: robot.dataset.userId, left: parseFloat(robot.style.left) / 100 * 12,
            top: parseFloat(robot.style.top) / 100 * 16, angle: robot.style.getPropertyValue("--robot-angle")
        })),
        shots: [...document.querySelectorAll(".laser-shot")].map((shot) => {
            const muzzle = shot.querySelector(".laser-muzzle");
            const beam = shot.querySelector(".laser-beam-core");
            return {source: shot.classList.contains("laser-shot-robot") ? "robot" : "board",
                userId: shot.dataset.sourceUserId || null,
                transform: getComputedStyle(shot).transform,
                start: [Number(muzzle.getAttribute("cx")), Number(muzzle.getAttribute("cy"))],
                end: [Number(beam.getAttribute("x2")), Number(beam.getAttribute("y2"))]};
        })
    }));
    console.log(JSON.stringify(geometry, null, 2));

    const boardShots = geometry.shots.filter((shot) => shot.source === "board");
    const robotShots = geometry.shots.filter((shot) => shot.source === "robot");
    assert.equal(boardShots.length, 4, "Maelstrom must have exactly four stationary laser objects");
    assert.deepStrictEqual(boardShots.map((shot) => shot.start).sort(), [[3,6.5],[4,5.5],[5.5,8],[6.5,9]].sort(),
        "Stationary laser sources do not match Maelstrom");
    assert.equal(robotShots.length, 2, "Each of the two powered robots must fire once");
    robotShots.forEach((shot) => {
        assert.equal(shot.transform, "none", `Robot token CSS shifted shot ${shot.userId}`);
        const robot = geometry.robots.find((item) => item.userId === shot.userId);
        assert(robot, `No visible robot for shot ${shot.userId}`);
        assert(Math.abs(shot.start[0] - robot.left) < .001 && Math.abs(shot.start[1] - robot.top) < .001,
            `Shot ${shot.userId} does not start at its robot`);
    });
    assert.equal(await host.page.locator(".laser-robot-source").count(), 0, "phantom source marker exists");
    if (process.env.LASER_SCREENSHOT) await host.page.screenshot({path: process.env.LASER_SCREENSHOT});
    console.log("Focused Maelstrom browser laser geometry passed");
})().catch((error) => {
    console.error(error.stack || error); process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    server.kill();
});
