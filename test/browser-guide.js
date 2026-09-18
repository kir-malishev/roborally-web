"use strict";

const assert = require("assert");
const {launchBrowser, openUser, startSandbox, stopSandbox} = require("./browser-support");

const port = process.env.GUIDE_BROWSER_PORT || "3046";
const {server, ready} = startSandbox(port);
let browser;

const PHASES = ["Карты", "Роботы", "Экспресс", "Конвейеры", "Толкатели", "Шестерни", "Лазеры", "Флаги"];

async function openPlayer(id, name, room) {
    const result = await openUser(browser, {port, room, name, viewport: {width: 1280, height: 900}});
    return result.page;
}

(async () => {
    await ready;
    browser = await launchBrowser();
    const host = await openPlayer("guide-host", "Хост", "guide-browser");
    const guest = await openPlayer("guide-guest", "Гость", "guide-browser");

    assert.equal(await host.locator(".guide-modal").count(), 0, "guide opens automatically in the lobby");
    const lobbyButton = host.getByRole("button", {name: "Как играть"});
    await lobbyButton.focus();
    await lobbyButton.click();
    await host.locator(".guide-modal").waitFor();
    assert.equal(await host.getByRole("tab").count(), 3, "guide must have three tabs");
    assert.equal(await host.evaluate(() => document.body.style.overflow), "hidden", "modal does not lock page scrolling");
    assert.equal(await host.locator(".guide-modal img").count(), 0, "guide assets load before the element tab opens");
    assert.deepEqual(await host.locator(".guide-phase-timeline strong").allTextContents(), PHASES,
        "the full guide has the wrong register phase order");

    await host.keyboard.press("Shift+Tab");
    assert.equal(await host.evaluate(() => document.activeElement.textContent.trim()), "Урон и Power Down",
        "Shift+Tab escapes past the first modal control");
    await host.keyboard.press("Tab");
    assert.equal(await host.evaluate(() => document.activeElement.getAttribute("aria-label")), "Закрыть справочник",
        "Tab escapes past the last modal control");

    await host.getByRole("tab", {name: "Элементы поля"}).click();
    assert.equal(await host.locator(".guide-element-card").count(), 14, "not every board element is documented");
    assert.equal(await host.locator(".guide-element-visual img").count(), 11, "real board illustrations are missing");
    assert.equal(await host.getByRole("heading", {name: "Лазер", exact: true}).count(), 1,
        "the guide must use one common laser example");
    assert.equal(await host.getByRole("heading", {name: "Поворот конвейера", exact: true}).count(), 1,
        "the guide must use one conveyor-turn example");
    await host.waitForFunction(() => [...document.querySelectorAll(".guide-element-visual img")]
        .every((image) => image.complete && image.naturalWidth > 0));
    await host.getByRole("tab", {name: "Урон и Power Down"}).click();
    assert.equal(await host.locator(".guide-power-down", {hasText: "не исполняет команды и не стреляет"}).count(), 1,
        "damage and Power Down tab does not render its rules");
    await host.getByRole("tab", {name: "Как играть"}).click();
    assert.equal(await host.locator(".guide-phase-timeline").count(), 1, "cannot switch back to the how-to-play tab");

    await host.locator(".guide-backdrop").click({position: {x: 2, y: 2}});
    await host.locator(".guide-modal").waitFor({state: "detached"});
    assert(await lobbyButton.evaluate((element) => element === document.activeElement), "focus did not return to the lobby button");
    assert.equal(await host.evaluate(() => document.body.style.overflow), "", "page scrolling stayed locked after close");

    await lobbyButton.click();
    await host.keyboard.press("Escape");
    await host.locator(".guide-modal").waitFor({state: "detached"});
    await lobbyButton.click();
    await host.locator(".guide-close").click();
    await host.locator(".guide-modal").waitFor({state: "detached"});

    await host.setViewportSize({width: 390, height: 760});
    await lobbyButton.click();
    const bounds = await host.locator(".guide-modal").boundingBox();
    assert(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= 390 && bounds.y + bounds.height <= 760,
        "guide does not fit a narrow viewport");
    assert(await host.locator(".guide-tabs").evaluate((element) => element.scrollWidth >= element.clientWidth),
        "mobile tab strip cannot scroll horizontally");
    await host.keyboard.press("Escape");
    await host.setViewportSize({width: 1280, height: 900});

    await host.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.getByRole("button", {name: "Присоединиться к игре"}).click();
    await host.locator(".lobby-member", {hasText: "Гость"}).waitFor();
    await host.getByRole("button", {name: "Начать игру"}).click();
    await host.locator(".program").waitFor();
    await guest.locator(".program").waitFor();
    assert.deepEqual(await guest.locator(".quick-phases strong").allTextContents(), PHASES,
        "the quick guide has the wrong register phase order");
    assert.deepEqual(await guest.locator(".player-row").first().locator(".player-stat").evaluateAll((items) => items.map((item) => item.title)),
        ["Активированные флаги", "Повреждения", "Оставшиеся жизни"], "player statistics have no explanatory tooltips");

    const conveyorButton = guest.getByRole("button", {name: "КОНВЕЙЕРЫ"});
    await conveyorButton.focus();
    await conveyorButton.click();
    await guest.locator(".conveyor-guide-modal").waitFor();
    assert.equal(await guest.locator(".conveyor-demo-svg").count(), 2, "conveyor guide does not show both movement cases");
    assert.equal(await guest.locator(".conveyor-demo-verdict.yes").innerText(), "ДА, ПОВОРАЧИВАЕТСЯ");
    assert.equal(await guest.locator(".conveyor-demo-verdict.no").innerText(), "НЕТ, НЕ ПОВОРАЧИВАЕТСЯ");
    assert.equal(await guest.locator(".conveyor-demo-good-robot").evaluate((element) => getComputedStyle(element).animationName),
        "conveyor-good-move", "conveyor turn animation is not running");
    assert.deepEqual(await guest.locator(".conveyor-demo-robot").evaluateAll((items) => items.map((element) => element.style.getPropertyValue("--rr-facing"))),
        ["0deg", "90deg"], "the examples do not use the intended initial directions");
    assert.equal(await guest.locator(".conveyor-demo-program-card").count(), 2, "both examples must show the Forward 2 card");
    const animationTiming = await guest.locator(".conveyor-demo-good-robot, .conveyor-demo-card-robot").evaluateAll((items) => items.map((element) => {
        const style = getComputedStyle(element);
        return [style.animationDuration, style.animationDelay, style.animationIterationCount, style.animationTimingFunction];
    }));
    assert.deepEqual(animationTiming[0], animationTiming[1], "the conveyor examples are not synchronized");
    const startingTransforms = await guest.locator(".conveyor-demo-good-robot, .conveyor-demo-card-robot").evaluateAll((items) => items.map((element) => {
        const animation = element.getAnimations()[0];
        return animation.effect.getKeyframes()[0].transform;
    }));
    assert.deepEqual(startingTransforms, ["translate(170px, 230px)", "translate(90px, 70px)"],
        "the examples do not start two cells apart from their destinations");
    assert.equal(await guest.locator(".conveyor-guide-controls").count(), 0, "obsolete direction controls are still visible");
    assert.equal(await guest.locator(".conveyor-demo-program-card .priority").count(), 0, "the demo card still shows a priority");
    assert.equal(await guest.locator(".conveyor-guide-punchline").count(), 0, "the mnemonic is still visible");
    assert.equal(await guest.getByText("Тот самый нюанс", {exact: true}).count(), 0, "the obsolete eyebrow is still visible");
    const turnMarkBounds = await guest.locator(".conveyor-demo-turn-mark").evaluate((element) => {
        const box = element.getBBox();
        return {x: box.x, y: box.y, right: box.x + box.width, bottom: box.y + box.height};
    });
    assert(turnMarkBounds.x >= 50 && turnMarkBounds.y >= 30 && turnMarkBounds.right <= 370 && turnMarkBounds.bottom <= 270,
        `turn arc escapes the board: ${JSON.stringify(turnMarkBounds)}`);
    await guest.keyboard.press("Escape");
    await guest.locator(".conveyor-guide-modal").waitFor({state: "detached"});
    assert(await conveyorButton.evaluate((element) => element === document.activeElement), "focus did not return to the conveyor button");

    await guest.setViewportSize({width: 390, height: 760});
    await conveyorButton.click();
    const conveyorBounds = await guest.locator(".conveyor-guide-modal").boundingBox();
    assert(conveyorBounds && conveyorBounds.x >= 0 && conveyorBounds.y >= 0
        && conveyorBounds.x + conveyorBounds.width <= 390 && conveyorBounds.y + conveyorBounds.height <= 760,
        "conveyor guide does not fit a narrow viewport");
    assert.equal(await guest.locator(".conveyor-demo-grid").evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(" ").length),
        1, "conveyor examples do not stack on a narrow viewport");
    await guest.keyboard.press("Escape");
    await guest.setViewportSize({width: 1280, height: 900});

    await host.getByRole("button", {name: "Авто"}).click();
    await host.getByRole("button", {name: "Готов", exact: true}).click();
    await guest.locator(".bottom-dock.rr-dock-timer").waitFor();
    const readDockSeconds = async () => Number((await guest.locator(".rr-dock-status-text").innerText()).match(/\d+/)[0]);
    const before = await readDockSeconds();
    await guest.locator(".quick-guide-open").click();
    assert.equal(await guest.locator(".pause-banner").count(), 0, "opening the guide paused the game");
    await guest.waitForTimeout(1300);
    const after = await readDockSeconds();
    assert(after < before, `programming timer stopped behind the guide (${before} -> ${after})`);

    console.log("Illustrated guide browser interactions passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    stopSandbox(server);
});
