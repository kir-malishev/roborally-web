"use strict";

const assert = require("assert");
const {launchBrowser, openUser, startSandbox, stopSandbox} = require("./browser-support");

const port = process.env.HINTS_PORT || "3011";
const {server, ready} = startSandbox(port);
let browser;

async function openPlayer(browser, player, name) {
    return openUser(browser, {port, room: "hints-smoke", name, viewport: {width: 1440, height: 1000}, timeout: 30000});
}

(async () => {
    await ready;
    browser = await launchBrowser();
    const host = await openPlayer(browser, "hints-host", "Хозяин");
    const guest = await openPlayer(browser, "hints-guest", "Гость");
    await host.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    const courseName = process.env.HINTS_COURSE || "Vault Assault";
    if (["Checkmate", "Twister", "Whirlwind Tour"].includes(courseName)) {
        for (let slot=2;slot<5;slot++) {
            const extra=await openPlayer(browser,`hints-extra-${slot}`,`Игрок ${slot+1}`);
            await extra.page.getByRole("button", {name: "Присоединиться к игре"}).click();
        }
    }
    await host.page.locator(".course-card", {hasText: courseName}).click();
    await host.page.getByRole("button", {name: "Начать игру"}).click();
    await host.page.locator(".board-hints.enabled").waitFor();
    await host.page.locator(".bottom-dock-toggle").click();

    assert((await host.page.locator("[data-hint-id^=conveyor-]").count()) > 0, "Conveyor hit areas are absent");
    if (!["Dizzy Dash", "Twister"].includes(courseName))
        assert((await host.page.locator("[data-hint-id^=pit-]").count()) > 0, "Pit hit areas are absent");
    assert((await host.page.locator("[data-hint-id^=wall-]").count()) > 0, "Wall hit areas are absent");
    if (!["Lost Bearings", "Checkmate", "Whirlwind Tour"].includes(courseName))
        assert((await host.page.locator("[data-hint-id^=gear-]").count()) > 0, "Gear hit areas are absent");
    assert((await host.page.locator("[data-hint-id^=repair-]").count()) > 0, "Repair hit areas are absent");
    if (!["Checkmate", "Island Hop"].includes(courseName))
        assert((await host.page.locator("[data-hint-id^=laser-]").count()) > 0, "Laser hit areas are absent");
    if (["Vault Assault", "Whirlwind Tour"].includes(courseName))
        assert((await host.page.locator("[data-hint-id^=pusher-]").count()) > 0, "Pusher hit areas are absent");
    assert((await host.page.locator("[data-hint-id^=flag-]").count()) > 0, "Flag hit areas are absent");
    assert((await host.page.locator("[data-hint-id^=archive-]").count()) > 0, "Checkpoint hit areas are absent");
    assert((await host.page.locator("[data-hint-id^=start-]").count()) > 0, "Start position hit areas are absent");

    for (const prefix of ["conveyor", "pit", "gear", "repair", "wall", "laser"]) {
        const matches = host.page.locator(`[data-hint-id^=${prefix}-]`);
        const target = prefix === "wall" && courseName === "Whirlwind Tour" ? matches.nth(16) : matches.first();
        if (!await target.count()) continue;
        let hoverOptions = ["gear", "repair", "pit"].includes(prefix) ? {position: {x: 5, y: 5}} : undefined;
        if (prefix === "laser") {
            const box=await target.boundingBox();
            hoverOptions={position:box.width>box.height ? {x:Math.min(30,box.width-2),y:box.height/2}
                : {x:box.width/2,y:Math.min(30,box.height-2)}};
        }
        await target.hover(hoverOptions);
        assert((await host.page.locator(".field-hint-outline").count()) >= 1, `${prefix} has no visible outline`);
    }
    if (process.env.HINTS_ALL_WALLS) {
        const wallHits = host.page.locator('[data-hint-id^="wall-"]');
        for (let index = 0; index < await wallHits.count(); index++) {
            await wallHits.nth(index).hover();
            assert.equal(await host.page.locator(".field-tooltip strong").innerText(), "Стена", `Wall ${index} cannot be hovered`);
            assert.equal(await host.page.locator(".field-hint-outline").count(), 1, `Wall ${index} has no outline`);
        }
    }

    if (courseName === "Vault Assault") {
        assert.equal(await host.page.locator("[data-hint-id^=pusher-]").first().evaluate((element) => element.tagName), "rect",
            "Pusher hover area is not the pusher panel");
        await host.page.locator("[data-hint-id^=pusher-]").first().hover();
        const pusherTooltip = await host.page.locator(".field-tooltip").innerText();
        assert(pusherTooltip.includes("Регистры") && pusherTooltip.includes("Фаза 5"), "Pusher phases are absent");
        assert(await host.page.locator(".field-tooltip").evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return element.parentElement === document.body && getComputedStyle(element).position === "fixed"
                && rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
        }), "field tooltip rotates with the board or escapes the viewport");
        assert.equal(await host.page.locator(".field-hint-outline").count(), 1, "Hovered field element has no outline");
    }
    if (courseName === "Chop Shop Challenge") {
        assert.equal(await host.page.locator('[data-hint-id="laser-0"]').count(), 3, "Triple laser does not expose three rays");
        assert.equal(await host.page.locator('[data-hint-id="laser-2"]').count(), 2, "Double laser does not expose two rays");
        await host.page.locator('[data-hint-id="laser-0"]').first().hover();
        assert.equal(await host.page.locator(".field-hint-outline").count(), 3, "Triple laser does not highlight all rays");
        const eastLaserPoints = await host.page.locator('[data-hint-id="laser-1"]').getAttribute("points");
        const eastLaserXs = eastLaserPoints.trim().split(/\s+/).map((point) => Number(point.split(",")[0]));
        assert(Math.max(...eastLaserXs) <= 10.01, "Horizontal laser highlight passes through its wall");
        await host.page.locator('[data-hint-id$="-10,3"]').first().hover({position:{x:5,y:30}});
        assert.equal(await host.page.locator(".field-tooltip strong").innerText(), "Экспресс-конвейер", "Chop Shop 10,3 is not express");
        await host.page.locator('[data-hint-id$="-11,3"]').first().hover({position:{x:5,y:30}});
        assert.equal(await host.page.locator(".field-tooltip strong").innerText(), "Экспресс-конвейер", "Chop Shop 11,3 is not express");
    }
    if (courseName === "Risky Exchange") {
        assert.equal(await host.page.locator('[data-hint-id^="gear-"]').count(), 5, "Risky Exchange contains false gears");
        await host.page.locator('[data-hint-id$="-3,3"]').first().hover();
        assert.equal(await host.page.locator(".field-tooltip strong").innerText(), "Конвейер", "Risky Exchange 3,3 must be a normal conveyor");
    }
    if (courseName === "Lost Bearings") {
        for (const key of ["4,3","4,4","3,4","6,4","7,4","7,5","7,6","6,6","4,7","4,6"])
            assert.equal(await host.page.locator(`[data-hint-id$="-${key}"]`).count(),1,`Cross: missing conveyor hint ${key}`);
        for (const key of ["1,0", "4,3"]) {
            await host.page.locator(`[data-hint-id$="-${key}"]`).first().hover();
            assert.equal(await host.page.locator(".field-hint-wash rect").count(), 16, "Cross: upper-left conveyor is split into separate hint groups");
        }
    }
    const conveyorTurnCases = {"Dizzy Dash": ["1,4",12], Twister: ["1,4",12], Checkmate: ["1,10",36],
        "Chop Shop Challenge": ["5,1",5], "Whirlwind Tour": ["4,7",52], "Lost Bearings": ["10,1",3]};
    if (conveyorTurnCases[courseName]) {
        const [key,expectedCells]=conveyorTurnCases[courseName];
        const turn = host.page.locator(`[data-hint-id$="-${key}"]`).first();
        await turn.hover();
        assert.equal(await host.page.locator(".field-hint-wash rect").count(), expectedCells, `${courseName}: a continuous conveyor is split at its turn`);
    }

    const hostId = await host.page.locator(".robot.own-robot").getAttribute("data-user-id");
    const guestId = await host.page.locator('.robot:not(.own-robot)[title^="Гость:"]').getAttribute("data-user-id");
    await host.page.locator(`[data-hint-id="robot-${hostId}"]`).hover();
    await host.page.locator(".field-tooltip").waitFor();
    assert((await host.page.locator(".field-tooltip").innerText()).includes("Хозяин (вы)"), "Own robot tooltip is incorrect");

    await host.page.locator(`[data-hint-id="robot-${guestId}"]`).hover();
    const guestTooltip = await host.page.locator(".field-tooltip").innerText();
    assert(guestTooltip.includes("Гость") && !guestTooltip.includes("Гость (вы)"), "Other robot tooltip is incorrect");
    if (process.env.HINTS_SCREENSHOT) {
        await host.page.locator(process.env.HINTS_TARGET || "[data-hint-id^=archive-]").first().hover();
        await host.page.screenshot({path: process.env.HINTS_SCREENSHOT, fullPage: true});
    }

    await host.page.locator(".board-hints-toggle").click();
    assert(await host.page.locator(".board-hints.disabled").isVisible(), "Hint mode did not switch off");
    assert.equal(await host.page.locator(".field-hint-outline").count(), 0, "Outline remained visible while hints were off");
    const hintBorders = await host.page.locator(".board-hints-toggle").evaluate((element) => {
        const style = getComputedStyle(element);
        return [style.borderLeftColor, style.borderRightColor];
    });
    assert.equal(hintBorders[0], hintBorders[1], "Hint button has a stray colored left edge");
    await host.page.reload({waitUntil: "domcontentloaded"});
    await host.page.locator(".board-hints.disabled").waitFor();
    await host.page.evaluate(() => localStorage.removeItem("roborally-board-hints"));
    await host.page.reload({waitUntil: "domcontentloaded"});
    await host.page.locator(".board-hints.enabled").waitFor();
    console.log("RoboRally field hints rendered and toggled successfully");
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    stopSandbox(server);
});
