"use strict";

const assert = require("assert");
const {launchBrowser, openUser: openSandboxUser, startSandbox, stopSandbox} = require("./browser-support");

const port = process.env.LASER_PORT || "3041";
const {server, ready} = startSandbox(port);
let browser;

async function openUser(id, name) {
    return openSandboxUser(browser, {port, room: "laser-regression", name, viewport: {width: 1280, height: 900}});
}

(async () => {
    await ready;
    browser = await launchBrowser();
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
    stopSandbox(server);
});
