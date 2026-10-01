"use strict";
const assert = require("assert");
const {launchBrowser, openUser, startSandbox, stopSandbox} = require("./browser-support");
const port = process.env.SIDE_REGISTERS_PORT || "3072";
(async () => {
    const {server, ready} = startSandbox(port); let browser;
    try {
        await ready; browser = await launchBrowser();
        const host = (await openUser(browser, {port, room: "side-registers", name: "Host", viewport: {width:1440,height:900}})).page;
        const guest = (await openUser(browser, {port, room: "side-registers", name: "Guest", viewport: {width:1440,height:900}})).page;
        const viewer = (await openUser(browser, {port, room: "side-registers", name: "Viewer", viewport: {width:1440,height:900}})).page;
        await host.evaluate(() => {
            localStorage.setItem("roborally-info-dock", "left");
            localStorage.setItem("roborally-program-dock", "right");
        });
        await host.reload(); await host.locator(".lobby-shell").waitFor();
        await host.getByRole("button", {name:"Присоединиться к игре"}).click();
        await guest.getByRole("button", {name:"Присоединиться к игре"}).click();
        await host.getByRole("button", {name:"Начать игру"}).click();
        await host.locator(".program .card").first().waitFor();
        await host.getByRole("button", {name:"Авто", exact:true}).click();
        await host.waitForFunction(() => [...document.querySelectorAll(".register span")].every(span => span.title));
        const own = await host.locator(".registers").evaluate(el => ({
            columns: getComputedStyle(el).gridTemplateColumns.split(" ").length,
            clipped: [...el.querySelectorAll(".register span")].filter(span => span.scrollWidth > span.clientWidth + 1).length
        }));
        assert.deepStrictEqual(own, {columns:1, clipped:0}, "Own registers are unreadable in the side dock");
        await guest.getByRole("button", {name:"Авто", exact:true}).click();
        await host.getByRole("button", {name:"Готов", exact:true}).click();
        for (const page of [host,guest,viewer]) await page.locator(".programming-timer .timer-clock").waitFor();
        const topTimer = await host.locator(".programming-timer").boundingBox();
        assert(topTimer && topTimer.y < 200 && topTimer.width > 250, "ready player's timer is hidden or too small");
        await guest.getByRole("button", {name:"Готов", exact:true}).click();
        await host.locator(".public-programs .public-register.revealed").first().waitFor({timeout:20000});
        const publicRows = await host.locator(".public-program-row").evaluateAll(rows => rows.map(row => {
            const cards = [...row.querySelectorAll(".public-register")];
            const boxes = cards.map(card => card.getBoundingClientRect());
            return {columns:getComputedStyle(row.querySelector("div")).gridTemplateColumns.split(" ").length,
                stacked:boxes.every((box,index) => !index || boxes[index-1].bottom <= box.top + 1),
                labelsFit:cards.every(card => !card.querySelector("b") || card.querySelector("b").scrollWidth <= card.querySelector("b").clientWidth + 1),
                inside:boxes.every(box => box.right <= row.getBoundingClientRect().right + 1)};
        }));
        assert(publicRows.length >= 2 && publicRows.every(row => Object.values(row).every(Boolean)),
            "Public registers overlap in the side dock: " + JSON.stringify(publicRows));
        if (process.env.SIDE_REGISTERS_SCREENSHOT) await host.screenshot({path:process.env.SIDE_REGISTERS_SCREENSHOT});
        console.log("Side-dock registers and shared timer passed");
    } finally { if (browser) await browser.close(); stopSandbox(server); }
})().catch(error => {console.error(error); process.exitCode = 1;});

