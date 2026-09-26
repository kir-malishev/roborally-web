"use strict";

const assert = require("assert");
const {launchBrowser, openUser, startSandbox, stopSandbox} = require("./browser-support");

const port = process.env.LAYOUT_BROWSER_PORT || "3051";
const {server, ready} = startSandbox(port);
let browser;

(async () => {
    await ready;
    browser = await launchBrowser();
    const host = (await openUser(browser, {port, room: "layout-browser", name: "Host"})).page;
    const guest = (await openUser(browser, {port, room: "layout-browser", name: "Guest"})).page;
    await host.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.getByRole("button", {name: "Присоединиться к игре"}).click();
    await host.getByRole("button", {name: "Начать игру"}).click();
    await host.locator(".program .cards .card").first().waitFor();

    for (const viewport of [{width: 1440, height: 900}, {width: 1366, height: 650},
        {width: 1230, height: 530}, {width: 1024, height: 650}, {width: 800, height: 600},
        {width: 390, height: 760}]) {
        await host.setViewportSize(viewport);
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
