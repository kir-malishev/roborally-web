"use strict";

const assert = require("assert");
const path = require("path");
const {spawn} = require("child_process");
const {chromium} = require(path.resolve(__dirname, "../../demo-server/node_modules/playwright-core"));

const serverDir = path.resolve(__dirname, "../../demo-server");
const port = process.env.GUIDE_BROWSER_PORT || "3046";
const server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir, env: {...process.env, PORT: port}, stdio: ["ignore", "pipe", "pipe"]
});
let browser;
let serverError = "";
server.stderr.on("data", (chunk) => serverError += String(chunk));

const PHASES = ["Карты", "Роботы", "Экспресс", "Конвейеры", "Толкатели", "Шестерни", "Лазеры", "Флаги"];

async function openPlayer(id, name, room) {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    page.setDefaultTimeout(8000);
    await page.goto(`http://127.0.0.1:${port}/roborally?room=${room}&player=${id}&name=${encodeURIComponent(name)}`);
    await page.locator(".lobby-shell").waitFor();
    return page;
}

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

    await host.getByRole("button", {name: "Авто"}).click();
    await host.getByRole("button", {name: "Готов", exact: true}).click();
    await guest.locator(".programming-timer .timer-clock strong").waitFor();
    const before = Number(await guest.locator(".programming-timer .timer-clock strong").innerText());
    await guest.locator(".quick-guide-open").click();
    assert.equal(await guest.locator(".pause-banner").count(), 0, "opening the guide paused the game");
    await guest.waitForTimeout(1300);
    const after = Number(await guest.locator(".programming-timer .timer-clock strong").innerText());
    assert(after < before, `programming timer stopped behind the guide (${before} -> ${after})`);

    console.log("Illustrated guide browser interactions passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    server.kill();
});
