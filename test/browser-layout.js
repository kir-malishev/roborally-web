"use strict";

const assert = require("assert");
const {launchBrowser, openUser, startSandbox, stopSandbox} = require("./browser-support");

const port = process.env.LAYOUT_BROWSER_PORT || "3051";
const {server, ready} = startSandbox(port);
let browser;

(async () => {
    await ready;
    browser = await launchBrowser();
    const host = (await openUser(browser, {port, room: "layout-browser", name: "Host", timeout: 15000})).page;
    const guest = (await openUser(browser, {port, room: "layout-browser", name: "Guest", timeout: 15000})).page;
    await host.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.getByRole("button", {name: "Присоединиться к игре"}).click();
    await host.getByRole("button", {name: "Начать игру"}).click();
    await host.locator(".program .cards .card").first().waitFor();

    for (const viewport of [{width: 1440, height: 900}, {width: 1366, height: 650},
        {width: 1230, height: 530}, {width: 1024, height: 650}, {width: 800, height: 600},
        {width: 390, height: 760}]) {
        await host.setViewportSize(viewport);
        await host.waitForFunction((landscape) => document.querySelector(".board-viewport")
            ?.classList.contains("rr-view-landscape") === landscape, viewport.width >= 1000);
        const view = await host.locator(".board-viewport").evaluate((element) => {
            const frame = element.getBoundingClientRect();
            const start = element.querySelector(".start-card").getBoundingClientRect();
            const factory = element.querySelector(".factory-card").getBoundingClientRect();
            return {landscape: element.classList.contains("rr-view-landscape"), ratio: frame.width / frame.height,
                startBeforeFactory: start.right <= factory.left + 2, startBelowFactory: start.top >= factory.bottom - 2};
        });
        assert.equal(view.landscape, viewport.width >= 1000,
            `${viewport.width}×${viewport.height}: automatic field orientation is wrong`);
        assert(Math.abs(view.ratio - (view.landscape ? 4/3 : 3/4)) < .03,
            `${viewport.width}×${viewport.height}: field frame has wrong aspect ratio`);
        assert(view.landscape ? view.startBeforeFactory : view.startBelowFactory,
            `${viewport.width}×${viewport.height}: start card is on the wrong side`);
        const controls = await host.locator(".board-toolbar").evaluate((toolbar) => {
            const main = toolbar.querySelector(".rr-board-toolbar-main").getBoundingClientRect();
            const hints = toolbar.querySelector(".board-hints-toggle").getBoundingClientRect();
            const view = toolbar.querySelector(".rr-view-controls").getBoundingClientRect();
            return {fits: toolbar.scrollWidth <= toolbar.clientWidth + 1,
                hintsOnFirstRow: Math.abs(hints.top - main.top) <= 1,
                viewOnSecondRow: view.top >= main.bottom - 1};
        });
        assert(controls.fits && controls.hintsOnFirstRow && controls.viewOnSecondRow,
            `${viewport.width}×${viewport.height}: field controls are broken into extra rows or overflow`);
        const layout = await host.locator(".bottom-dock").evaluate((dock) => {
            const scroll = dock.querySelector(".bottom-dock-scroll");
            const program = dock.querySelector(".program");
            const token = dock.querySelector(".power-down-token");
            const tokenLabel = token?.querySelector("span");
            const box = dock.getBoundingClientRect();
            return {overflow: scroll.scrollHeight - scroll.clientHeight,
                dockHeight: box.height, programHeight: program.getBoundingClientRect().height,
                tokenFits: !tokenLabel || tokenLabel.scrollWidth <= tokenLabel.clientWidth + 1,
                inside: box.left >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1};
        });
        assert(layout.inside, `${viewport.width}×${viewport.height}: dock escapes viewport`);
        assert(layout.overflow <= 2, `${viewport.width}×${viewport.height}: needless vertical dock scrollbar (${JSON.stringify(layout)})`);
        assert(layout.tokenFits, `${viewport.width}×${viewport.height}: Power Down label overflows its token`);
        await host.waitForFunction(() => {
            const dock = document.querySelector(".bottom-dock");
            const screen = document.querySelector(".game-screen");
            return Math.abs(parseFloat(getComputedStyle(screen).paddingBottom) - dock.getBoundingClientRect().height - 16) <= 2;
        });
        const boardGap = await host.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const board = document.querySelector(".board-viewport").getBoundingClientRect();
            const dock = document.querySelector(".bottom-dock").getBoundingClientRect();
            const gameScreen = document.querySelector(".game-screen");
            return {gap: dock.top - board.bottom, scrollable: document.documentElement.scrollHeight > innerHeight + 2,
                boardBottom: board.bottom, dockTop: dock.top, dockHeight: dock.height,
                gameBottom: gameScreen.getBoundingClientRect().bottom,
                paddingBottom: getComputedStyle(gameScreen).paddingBottom,
                scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight};
        });
        assert(!boardGap.scrollable || boardGap.gap >= 0 && boardGap.gap <= 36,
            `${viewport.width}×${viewport.height}: board-to-dock gap is wrong (${JSON.stringify(boardGap)})`);
    }

    await host.locator(".board-toolbar").getByRole("button", {name: "Повернуть вид по часовой стрелке"}).click();
    assert.equal(await host.evaluate(() => localStorage.getItem("roborally-board-view-angle")), "90",
        "manual view rotation was not persisted");
    await host.locator(".board-toolbar").getByRole("button", {name: "Сбросить вид поля"}).click();
    assert.equal(await host.evaluate(() => localStorage.getItem("roborally-board-view-angle")), null,
        "reset field view did not restore automatic orientation");

    await host.locator(".game-pause-controls .pause").click();
    await host.locator(".pause-banner").waitFor();
    for (const viewport of [{width: 1440, height: 900}, {width: 1024, height: 650}, {width: 390, height: 760}]) {
        await host.setViewportSize(viewport);
        const banner = await host.locator(".pause-banner").evaluate((element) => {
            const box = element.getBoundingClientRect();
            return {inside: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= 0,
                noOverflow: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
                height: box.height, mode: element.querySelector("span")?.innerText};
        });
        assert(banner.inside && banner.noOverflow && banner.height <= 105,
            `${viewport.width}×${viewport.height}: pause notice is clipped or too tall (${JSON.stringify(banner)})`);
        assert.equal(banner.mode, "Актуальное состояние");
    }
    console.log("Programming dock and pause notice fit wide, short and narrow viewports.");
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    stopSandbox(server);
});
