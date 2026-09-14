"use strict";

const assert = require("assert");
const path = require("path");
const {spawn} = require("child_process");
const {chromium} = require(path.resolve(__dirname, "../../demo-server/node_modules/playwright-core"));

const root = path.resolve(__dirname, "../..");
const serverDir = path.join(root, "demo-server");
const port = process.env.LOBBY_PORT || "3012";
const server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    env: {...process.env, PORT: port},
    stdio: ["ignore", "pipe", "pipe"]
});
let browser;
let serverError = "";
server.stderr.on("data", (chunk) => serverError += String(chunk));

async function openUser(id, name) {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
    const page = await context.newPage();
    page.setDefaultTimeout(7000);
    await page.goto(`http://127.0.0.1:${port}/roborally?room=lobby-smoke&player=${id}&name=${encodeURIComponent(name)}`,
        {waitUntil: "domcontentloaded", timeout: 15000});
    await page.locator(".lobby-shell").waitFor();
    return {context, page};
}

(async () => {
    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("Demo server did not start")), 8000);
        server.stdout.on("data", (chunk) => {
            if (String(chunk).includes(port)) {
                clearTimeout(timeout);
                resolve();
            }
        });
        server.once("error", reject);
        server.once("exit", (code) => reject(new Error(`Demo server exited with ${code}${serverError ? `:\n${serverError}` : ""}`)));
    });
    browser = await chromium.launch({headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
    const host = await openUser("lobby-host", "Хост");
    const guest = await openUser("lobby-guest", "Гость");
    const viewer = await openUser("lobby-viewer", "Зритель");

    assert.equal(await host.page.locator(".seat").count(), 0, "Old robot seat selector is still visible");
    assert.equal(await viewer.page.locator(".course-card").count(), 22, "Spectator cannot see every single-board course from the rulebook");
    assert.equal(await viewer.page.locator(".course-thumbnail img").count(), 44, "Full course thumbnails are missing");
    assert.equal(await viewer.page.locator(".special-rule-marker").count(), 4,
        "Lobby does not mark exactly the implemented single-board special rules");
    for (const name of ["Moving Targets", "Set to Kill", "Factory Rejects", "Ball Lightning"])
        assert.equal(await viewer.page.locator(".course-card", {hasText: name}).locator(".special-rule-marker").count(), 1,
            `${name} is missing its Special Rules marker`);
    for (const name of ["Tricksy", "Option World", "Day of the SuperBot", "Interference", "Flag Fry"])
        assert.equal(await viewer.page.locator(".course-card", {hasText: name}).locator(".special-rule-marker").count(), 0,
            `${name} advertises a rule that is not implemented`);
    assert((await viewer.page.locator(".course-card", {hasText: "Checkmate"}).locator(".course-thumbnail-start").getAttribute("src")).endsWith("/start-1.webp"),
        "Checkmate uses the wrong docking board");
    assert((await viewer.page.locator(".course-card", {hasText: "Dizzy Dash"}).locator(".course-thumbnail-start").getAttribute("src")).endsWith("/start-2.webp"),
        "Dizzy Dash uses the wrong docking board");
    const rulebookRotations = {
        Checkmate: 270, "Risky Exchange": 90, "Dizzy Dash": 0, "Island Hop": 180,
        "Chop Shop Challenge": 0, Twister: 180, "Bloodbath Chess": 270, "Death Trap": 180,
        "Vault Assault": 0, "Whirlwind Tour": 0, "Robot Stew": 180, "Lost Bearings": 180,
        "Island King": 0, Tricksy: 0, "Moving Targets": 0, "Set to Kill": 270,
        "Factory Rejects": 0, "Option World": 90, "Ball Lightning": 270,
        "Day of the SuperBot": 180, Interference: 90, "Flag Fry": 180
    };
    for (const [name, rotation] of Object.entries(rulebookRotations)) {
        const transform = await viewer.page.locator(".course-card", {has: viewer.page.getByText(name, {exact: true})})
            .locator(".course-thumbnail-factory").evaluate((image) => image.style.transform);
        assert.equal(transform, `rotate(${rotation}deg)`, `${name}: lobby preview has the wrong Factory Floor rotation`);
    }
    assert(await viewer.page.locator(".course-card").first().isDisabled(), "Spectator can select a course");
    assert(!await host.page.locator(".course-card").first().isDisabled(), "Host cannot select a course");

    const movingTargets = host.page.locator(".course-card", {hasText: "Moving Targets"});
    await movingTargets.locator(".special-rule-marker").hover();
    assert(await movingTargets.locator(".special-rule-tooltip").isVisible(), "Special Rules tooltip does not open on hover");
    assert((await movingTargets.locator(".special-rule-tooltip").innerText()).includes("флаги движутся конвейерами"),
        "Special Rules tooltip has the wrong text");
    await movingTargets.click();
    await viewer.page.locator(".selected-course-special-rules", {hasText: "флаги движутся конвейерами"}).waitFor();
    assert.equal(await viewer.page.locator(".selected-course-special-rules").count(), 1,
        "selected course preview does not show its special rules");

    await host.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.page.locator(".nickname-field input").fill("Механик");
    await guest.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await host.page.locator(".lobby-member", {hasText: "Механик"}).waitFor();
    await host.page.locator(".lobby-member i").nth(1).waitFor();
    const colors = await host.page.locator(".lobby-member i").evaluateAll((items) => items.map((item) => item.style.background));
    assert.equal(new Set(colors).size, 2, "Players received the same color");
    await guest.page.getByRole("button", {name: "Остаться зрителем"}).click();
    await host.page.locator(".member-column", {hasText: "Зрители"}).locator(".lobby-member", {hasText: "Механик"}).waitFor();
    await guest.page.getByRole("button", {name: "Присоединиться к игре"}).click();

    const previewStarts = async (page) => page.locator(".large-course-preview .course-preview-robot")
        .evaluateAll((markers) => markers.map((marker) => ({title: marker.title, start: Number(marker.dataset.start)}))
            .sort((left, right) => left.title.localeCompare(right.title)));
    await host.page.locator(".large-course-preview .course-preview-robot").nth(1).waitFor();
    const initialStarts = await previewStarts(host.page);
    assert.deepEqual(initialStarts.map(({start}) => start).sort(), [1, 2], "Players received starts outside positions 1–2");
    assert.deepEqual(await previewStarts(viewer.page), initialStarts, "Spectator sees different starting positions");
    assert.equal(await guest.page.getByRole("button", {name: "Перемешать старты"}).count(), 0, "Non-host can reshuffle starts");
    await host.page.getByRole("button", {name: "Перемешать старты"}).click();
    await host.page.waitForFunction((before) => {
        const now = [...document.querySelectorAll(".large-course-preview .course-preview-robot")]
            .map((marker) => ({title: marker.title, start: Number(marker.dataset.start)}))
            .sort((left, right) => left.title.localeCompare(right.title));
        return JSON.stringify(now) !== JSON.stringify(before);
    }, initialStarts);
    const shuffledStarts = await previewStarts(host.page);
    assert.deepEqual(shuffledStarts.map(({start}) => start).sort(), [1, 2], "Reshuffle unlocked a position above player count");
    assert.deepEqual(await previewStarts(viewer.page), shuffledStarts, "Reshuffled starts did not reach spectators");

    const guestAvailableColor = guest.page.locator(".color-picker button:not(:disabled):not(.selected)").first();
    const colorLabel = await guestAvailableColor.getAttribute("aria-label");
    await guestAvailableColor.click();
    const hostColor = host.page.locator(`.color-picker button[aria-label="${colorLabel}"]`);
    await host.page.waitForFunction((label) => document.querySelector(`.color-picker button[aria-label="${label}"]`).disabled, colorLabel);
    assert(await hostColor.isDisabled(), "Selected color remains available to another player");

    await host.page.locator(".course-card", {hasText: "Dizzy Dash"}).click();
    await viewer.page.locator(".course-card.selected", {hasText: "Dizzy Dash"}).waitFor();
    await viewer.page.locator(".selected-course-preview", {hasText: "Dizzy Dash"}).waitFor();
    assert.equal(await viewer.page.locator(".large-course-preview img").count(), 2, "Selected course preview does not include its start board");
    assert.equal(await viewer.page.getByText("Стартовое поле показано снизу.", {exact: false}).count(), 0, "Redundant selected-course explanation is visible");
    await viewer.page.getByRole("button", {name: "Свернуть"}).click();
    assert.equal(await viewer.page.locator(".large-course-preview").count(), 0, "Selected course preview cannot be collapsed");
    await viewer.page.getByRole("button", {name: "Показать поле"}).click();

    assert(!await host.page.locator(".constructor").evaluate((details) => details.open), "Course constructor is expanded by default");
    await host.page.locator(".constructor").evaluate((details) => details.open = true);
    const preview = host.page.locator(".constructor-preview");
    const startSelect = host.page.locator(".constructor-fields label", {hasText: "Старт"}).locator("select");
    await startSelect.selectOption({label: "Старт 2"});
    await host.page.waitForFunction(() => {
        const image = document.querySelector(".constructor-preview-start");
        return image && image.src.endsWith("/start-2.webp") && image.complete && image.naturalWidth > 0;
    });
    assert((await host.page.locator(".constructor-preview-start").evaluate((image) => image.naturalWidth)) > 0, "Start 2 preview did not load");
    assert((await host.page.locator(".constructor-preview-start").getAttribute("src")).endsWith("/start-2.webp"), "Constructor still uses an external start image");
    assert.equal(await preview.locator(".preview-flag").count(), 3, "Constructor did not initialize its flags");
    const box = await preview.boundingBox();
    const helpBox = await host.page.locator(".constructor-help").boundingBox();
    assert(helpBox.y >= box.y + box.height, "Constructor help overlaps the course preview");
    await preview.click({position: {x: box.width * 2.5 / 12, y: box.height * 2.5 / 16}});
    assert.equal(await preview.locator(".preview-flag").count(), 2, "Clicking an existing flag did not remove it");
    await preview.click({position: {x: box.width * 6.5 / 12, y: box.height * 6.5 / 12}});
    assert.equal(await preview.locator(".preview-flag").count(), 3, "Clicking an empty cell did not add a flag");
    await host.page.getByRole("button", {name: "Убрать все"}).click();
    assert.equal(await preview.locator(".preview-flag").count(), 0, "Clear flags did not work");
    await host.page.getByRole("button", {name: "Отменить"}).click();
    assert.equal(await preview.locator(".preview-flag").count(), 3, "Undo flags did not work");
    assert.equal(await preview.locator(".constructor-preview-start").count(), 1, "Constructor preview does not show the start board");
    await host.page.getByRole("button", {name: "Выбрать свой курс"}).click();
    await viewer.page.locator(".selected-course-preview", {hasText: "Мой курс"}).waitFor();
    assert.equal(await viewer.page.locator(".selected-course-preview button").count(), 1, "Spectator received course editing controls");
    if (process.env.LOBBY_SCREENSHOT)
        await host.page.screenshot({path: process.env.LOBBY_SCREENSHOT, fullPage: true});

    const expectedRobotPositions = await host.page.locator(".large-course-preview .course-preview-robot").evaluateAll((markers) =>
        Object.fromEntries(markers.map((marker) => [marker.dataset.userId, {left: marker.style.left, top: marker.style.top}])));

    await host.page.getByRole("button", {name: "Начать игру"}).click();
    await viewer.page.locator(".board-viewport").waitFor();
    const actualRobotPositions = await viewer.page.locator(".board-overlay .robot").evaluateAll((robots) =>
        Object.fromEntries(robots.map((robot) => [robot.dataset.userId, {left: robot.style.left, top: robot.style.top}])));
    assert.deepEqual(actualRobotPositions, expectedRobotPositions, "Game did not use the shuffled positions shown in the lobby preview");
    if (process.env.GAME_SCREENSHOT)
        await host.page.screenshot({path: process.env.GAME_SCREENSHOT, fullPage: false});
    assert.equal(await viewer.page.locator(".program").count(), 0, "Spectator received a programming panel");
    assert.equal(await viewer.page.locator(".players-panel").count(), 1, "Spectator cannot follow players");
    assert.equal(await host.page.locator(".robot.own-robot").count(), 1, "Current player's robot is not subtly highlighted");
    assert.equal(await guest.page.locator(".robot.own-robot").count(), 1, "Guest's own robot is not highlighted");
    assert.equal(await viewer.page.locator(".robot.own-robot").count(), 0, "Spectator sees a robot as their own");
    assert.equal(await viewer.page.locator('img[src*="/roborally/materials/"]').count(), 0, "Game still loads external Roborally materials");
    assert.equal(await viewer.page.locator(".game-side-hud").evaluate((element) => getComputedStyle(element).position), "fixed", "Side information is not floating");
    assert.equal(await host.page.locator(".bottom-dock").evaluate((element) => getComputedStyle(element).position), "fixed", "Programming panel is not floating");
    const powerDownToken = host.page.locator(".program .power-down-token");
    assert.equal(await powerDownToken.count(), 1, "Power Down token button is missing");
    assert(await powerDownToken.isDisabled(), "Undamaged robot can announce Power Down");
    const powerDownAppearance = await powerDownToken.evaluate((element) => ({
        clipPath: getComputedStyle(element).clipPath,
        center: getComputedStyle(element, "::before").backgroundImage,
        text: element.innerText.replace(/\s+/g, " ").trim()
    }));
    assert(powerDownAppearance.clipPath.includes("polygon"), "Power Down button is not octagonal");
    assert(powerDownAppearance.center.includes("radial-gradient"), "Power Down button is missing its red token center");
    assert.equal(powerDownAppearance.text, "POWER DOWN", "Power Down token has the wrong label");
    assert.equal(await powerDownToken.evaluate((element) => {
        element.disabled = false;
        element.classList.add("urgent");
        return getComputedStyle(element).animationName;
    }), "power-down-warning", "Four-damage warning style is missing");
    const dockBox = await host.page.locator(".bottom-dock").boundingBox();
    assert(dockBox.width > 900 && dockBox.height < 350, "Programming panel is not wide and compact");
    assert((await host.page.locator(".bottom-dock").evaluate((element) => getComputedStyle(element).backgroundColor)).includes("0.78"), "Programming panel is not translucent");
    assert.equal(await host.page.locator(".game-side-hud .board-toolbar").count(), 1, "Map controls are not below the information panels");
    assert(await host.page.locator(".board-toolbar > button").last().getAttribute("class").then((value) => value.includes("board-hints-toggle")), "Hint control is not the last map button");
    await host.page.getByRole("button", {name: "Авто", exact: true}).click();
    await guest.page.getByRole("button", {name: "Авто", exact: true}).click();
    await host.page.getByRole("button", {name: "Готов", exact: true}).click();
    await viewer.page.locator(".programming-timer").waitFor();
    assert.equal(await viewer.page.locator(".timer-clock strong").innerText(), "30", "spectator cannot see the shared countdown");
    assert.equal(await guest.page.locator(".programming-timer", {hasText: "Механик"}).count(), 1,
        "last player does not see that the countdown targets them");
    await guest.page.getByRole("button", {name: "Готов", exact: true}).click();
    await viewer.page.locator(".programming-timer").waitFor({state: "detached"});
    await viewer.page.locator(".laser-shot-robot").first().waitFor({timeout: 20000});
    assert((await viewer.page.locator(".laser-shot-board").count()) >= 4, "Stationary laser shots are not visualized");
    assert((await viewer.page.locator(".laser-beam-core").count()) >= 5, "Multiple stationary laser beams are not visualized separately");
    assert((await viewer.page.locator(".laser-shot-robot").count()) >= 2, "Robot laser shots are not visualized");
    assert.equal(await viewer.page.locator(".laser-robot-source").count(), 0, "Duplicate phantom robot markers are visible during laser fire");
    const phantomShots = await viewer.page.locator(".laser-shot-robot").evaluateAll((shots) => shots.filter((shot) => {
        const robot = document.querySelector(`.robot[data-user-id="${CSS.escape(shot.dataset.sourceUserId)}"]`);
        const muzzle = shot.querySelector(".laser-muzzle");
        if (!robot || !muzzle) return true;
        const expectedX = parseFloat(robot.style.left) / 100 * 12;
        const expectedY = parseFloat(robot.style.top) / 100 * 16;
        return Math.abs(Number(muzzle.getAttribute("cx")) - expectedX) > .001
            || Math.abs(Number(muzzle.getAttribute("cy")) - expectedY) > .001;
    }).length);
    assert.equal(phantomShots, 0, "A robot laser is drawn without its robot at the source");
    assert.equal(await host.page.locator(".robot.own-robot[data-user-id]").count(), 1, "Own robot is not marked on the board");
    if (process.env.LASER_SCREENSHOT)
        await viewer.page.screenshot({path: process.env.LASER_SCREENSHOT, fullPage: false});
    console.log("RoboRally lobby roles, colors, courses, constructor and spectator flow passed");
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    server.kill();
});
