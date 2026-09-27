"use strict";

const assert = require("assert");
const fs = require("fs");
const {launchBrowser, openUser: openSandboxUser, startSandbox, stopSandbox} = require("./browser-support");
const port = process.env.FIELD_EDITOR_PORT || "3052";
const {server, ready, errors} = startSandbox(port);
let browser;

(async () => {
    await ready;
    browser = await launchBrowser();
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, acceptDownloads: true});
    await context.addInitScript(() => localStorage.updatesVersion = "999999");
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}/bg/roborally?name=Editor#field-editor`, {waitUntil: "domcontentloaded"});
    await page.locator(".lobby-shell").waitFor({timeout: 15000}).catch((error) => {
        throw new Error(`${error.message}\nPage errors: ${pageErrors.join("\n")}\nSandbox: ${errors()}`);
    });
    const roomDialog = page.locator(".room-mode-dialog");
    if (await roomDialog.isVisible().catch(() => false)) await roomDialog.locator(".room-mode-dialog-ok").click();
    await page.getByRole("button", {name: "Открыть редактор поля"}).click();
    const dialog = page.getByRole("dialog", {name: "Редактор поля"});
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("combobox", {name: "Основа поля"}).inputValue(), "");
    const palette = dialog.locator(".rr-editor-palette");
    assert.equal(await palette.locator("button").count(), 9, "editor palette lost a tool");
    assert(await palette.locator("button").evaluateAll((buttons) => buttons.every((button) =>
        button.textContent.trim() === button.getAttribute("aria-label")
            && Boolean(button.querySelector(".rr-editor-tool-icon")))),
    "palette tools must combine pictures with readable labels");
    assert(await palette.locator(".rr-editor-tool-icon").first().evaluate((element) =>
        element.getBoundingClientRect().width >= 55), "palette images are too small");
    await dialog.getByRole("button", {name: "Шестерня", exact: true}).click();
    await dialog.getByRole("button", {name: "Против часовой стрелки", exact: true}).click();
    assert.equal(await dialog.getByRole("button", {name: "Против часовой стрелки", exact: true}).getAttribute("aria-pressed"), "true");
    assert.match(await palette.getByRole("button", {name: "Шестерня"}).locator(".rr-editor-tool-sprite").getAttribute("style"), /gear-left.webp/);
    await dialog.getByRole("button", {name: "По часовой стрелке", exact: true}).click();
    await dialog.getByRole("button", {name: "Конвейер", exact: true}).click();
    await dialog.getByRole("button", {name: "Экспресс", exact: true}).click();
    assert.match(await palette.getByRole("button", {name: "Конвейер"}).locator(".rr-editor-tool-sprite").getAttribute("style"), /express-straight.webp/);
    await dialog.getByRole("button", {name: "Обычный", exact: true}).click();
    await dialog.getByRole("button", {name: "Флаг", exact: true}).click();
    const board = dialog.locator(".rr-editor-board");
    const box = await board.boundingBox();
    const footerBox = await dialog.locator(".rr-editor-footer").boundingBox();
    assert(box.y + box.height <= footerBox.y + 1, "editor board is clipped by its footer");
    await dialog.getByRole("button", {name: "Шестерня", exact: true}).click();
    await dialog.getByRole("button", {name: "Против часовой стрелки", exact: true}).click();
    await board.click({position: {x: box.width * 2.5 / 12, y: box.height * 2.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-factory > img[src$='gear-left.webp']").count(), 1,
        "the counter-clockwise gear variant was not placed on the field");
    await dialog.getByRole("button", {name: "Ластик", exact: true}).click();
    await board.click({position: {x: box.width * 2.5 / 12, y: box.height * 2.5 / 16}});
    await dialog.getByRole("button", {name: "Шестерня", exact: true}).click();
    await dialog.getByRole("button", {name: "По часовой стрелке", exact: true}).click();
    await dialog.getByRole("button", {name: "Флаг", exact: true}).click();
    await board.click({position: {x: box.width * .5, y: box.height * .75 * .5}});
    await dialog.getByRole("button", {name: "Лазер", exact: true}).click();
    const wallsBeforeLaser = await dialog.locator(".rr-custom-wall-base").count();
    await board.click({position: {x: box.width * 1.9 / 12, y: box.height * 1.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-beam").count(), 1, "laser direction was not drawn");
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeLaser + 1, "laser was not mounted on a wall");
    const beam = dialog.locator(".rr-custom-beam").first();
    assert(Number(await beam.getAttribute("x1")) > Number(await beam.getAttribute("x2")),
        "clicking the right edge did not fire the laser leftward");
    await dialog.getByRole("button", {name: "Яма", exact: true}).click();
    await board.click({position: {x: box.width * 1.5 / 12, y: box.height * 1.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-beam").count(), 0, "pit did not erase the laser");
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeLaser + 1,
        "pit erased a wall on its boundary");
    await board.click({position: {x: box.width * 2.5 / 12, y: box.height * 1.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeLaser,
        "joining pits retained a wall inside the pit");
    await dialog.getByRole("button", {name: "Стена", exact: true}).click();
    await board.click({position: {x: box.width * 1.9 / 12, y: box.height * 1.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeLaser,
        "a wall was placed between two pit cells");
    assert.match(await dialog.locator(".rr-editor-footer [role=status]").innerText(), /внутри ямы/);
    await board.click({position: {x: box.width * 1.5 / 12, y: box.height * 1.1 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeLaser + 1,
        "a wall on the outer edge of a pit was rejected");
    await dialog.getByRole("button", {name: "Яма", exact: true}).click();
    await board.click({position: {x: box.width * .5, y: box.height * .75 * .5}});
    assert.equal(await dialog.locator(".rr-editor-flag").count(), 0, "pit did not erase the flag");
    await dialog.getByRole("button", {name: "Флаг", exact: true}).click();
    await board.click({position: {x: box.width * 8.5 / 12, y: box.height * 8.5 / 16}});
    const editorFlag = await dialog.locator(".rr-editor-flag").evaluate((element) => ({
        wrench: Boolean(element.querySelector(".flag-wrench")),
        fontSize: Number.parseFloat(getComputedStyle(element).fontSize),
        boardWidth: element.closest(".rr-editor-factory").getBoundingClientRect().width,
        clothWidth: element.querySelector(".flag-cloth").getBoundingClientRect().width}));
    assert(editorFlag.wrench, "editor flag is missing the game's wrench icon");
    assert(Math.abs(editorFlag.fontSize / editorFlag.boardWidth - .021) < .002
        && editorFlag.fontSize < editorFlag.clothWidth * .75,
    "editor flag number is too large for its cloth");
    assert.equal(await dialog.locator(".rr-custom-start-number").count(), 8,
        "the eight fixed starting cells are not visible");
    await dialog.getByRole("button", {name: "Конвейер", exact: true}).click();
    const draw = async (cells) => {
        for (let index = 0; index < cells.length; index++) {
            const [x,y] = cells[index];
            await page.mouse.move(box.x + box.width * (x + .5) / 12, box.y + box.height * (y + .5) / 16);
            if (!index) await page.mouse.down();
        }
        await page.mouse.up();
    };
    await draw([[4,5],[5,5],[6,5]]);
    await draw([[5,3],[5,4],[5,5]]);
    await draw([[5,7],[5,6],[5,5]]);
    const tilesBeforeCrossing = await dialog.locator(".rr-custom-factory > .rr-custom-tile").count();
    await draw([[4,4],[4,5],[4,6]]);
    assert.match(await dialog.locator(".rr-editor-footer [role=status]").innerText(), /поперёк его движения/);
    assert.equal(await dialog.locator(".rr-custom-factory > .rr-custom-tile").count(), tilesBeforeCrossing,
        "invalid crossing changed the field");
    await draw([[8,3],[8,4],[9,4]]);
    const tilesBeforeExtension = await dialog.locator(".rr-custom-factory > .rr-custom-tile").count();
    await draw([[3,5],[4,5],[5,5],[6,5],[7,5]]);
    assert.equal(await dialog.locator(".rr-custom-factory > .rr-custom-tile").count(), tilesBeforeExtension + 2,
        "following an existing conveyor did not extend the route");
    const tilesBeforeMergeContinuation = await dialog.locator(".rr-custom-factory > .rr-custom-tile").count();
    await draw([[5,2],[5,3],[5,4],[5,5],[6,5],[7,5]]);
    assert.equal(await dialog.locator(".rr-custom-factory > .rr-custom-tile").count(), tilesBeforeMergeContinuation + 1,
        "a merge that follows existing conveyor cells was rejected");
    await dialog.getByRole("button", {name: "Стена", exact: true}).click();
    await board.click({position: {x: box.width * 7.9 / 12, y: box.height * 5.5 / 16}});
    await dialog.getByRole("button", {name: "Конвейер", exact: true}).click();
    const tilesBeforeWall = await dialog.locator(".rr-custom-factory > .rr-custom-tile").count();
    await draw([[7,5],[8,5]]);
    assert.match(await dialog.locator(".rr-editor-footer [role=status]").innerText(), /сквозь стену/);
    assert.equal(await dialog.locator(".rr-custom-factory > .rr-custom-tile").count(), tilesBeforeWall,
        "conveyor was drawn through a wall");
    await board.click({position: {x: box.width * 10.5 / 12, y: box.height * 2.1 / 16}});
    const singleBeltDirection = await dialog.locator(".rr-custom-factory > img[src$='belt-straight.webp']")
        .evaluateAll((elements) => elements.find((element) => Number.parseFloat(element.style.left) > 82
            && Number.parseFloat(element.style.left) < 85 && Number.parseFloat(element.style.top) > 12
            && Number.parseFloat(element.style.top) < 13)?.style.transform);
    assert.equal(singleBeltDirection, "rotate(270deg)",
        "single-cell conveyor did not follow the clicked edge");
    await draw([[10,6],[11,6]]);
    const junctionsBeforeReverse = await dialog.locator(".rr-custom-junction").count();
    await board.click({position: {x: box.width * 11.1 / 12, y: box.height * 6.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-junction").count(), junctionsBeforeReverse,
        "reversing a single conveyor cell left an invalid U-turn branch");
    await dialog.getByRole("button", {name: "Лазер", exact: true}).click();
    await board.click({position: {x: box.width * 3.5 / 12, y: box.height * 11.08 / 16}});
    const startBeam = dialog.locator(".rr-custom-beam").first();
    assert(Number(await startBeam.getAttribute("y2")) >= 16,
        "factory laser does not cross into the starting card");
    assert.equal(await dialog.locator(".rr-custom-lines").evaluate((element) => getComputedStyle(element).zIndex), "10",
        "laser layer is not drawn over starting cells");
    if (process.env.FIELD_EDITOR_SCREENSHOT) await dialog.screenshot({path: process.env.FIELD_EDITOR_SCREENSHOT});
    await dialog.getByRole("button", {name: "Яма", exact: true}).click();
    const pitsBeforeFixedStart = await dialog.locator(".rr-custom-pit").count();
    await board.click({position: {x: box.width * 5.5 / 12, y: box.height * 14.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-pit").count(), pitsBeforeFixedStart,
        "the numbered starting cell was editable");
    await dialog.getByRole("button", {name: "Шестерня", exact: true}).click();
    await board.click({position: {x: box.width * 5.5 / 12, y: box.height * 14.5 / 16}});
    assert.equal(await dialog.locator("img[src$='gear-right.webp']").count(), 0,
        "a gear was placed on a numbered starting cell");
    await dialog.getByRole("button", {name: "Ластик", exact: true}).click();
    const wallsBeforeNearMiss = await dialog.locator(".rr-custom-wall-base").count();
    await board.click({position: {x: box.width * 4.5 / 12, y: box.height * 12.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeNearMiss,
        "eraser removed a wall from the middle of a cell");
    const wallsBeforeStartErase = await dialog.locator(".rr-custom-wall-base").count();
    await board.click({position: {x: box.width * 2.5 / 12, y: box.height * 12.08 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeStartErase - 1,
        "eraser could not remove a wall on the editable part of the starting card");
    const wallsBeforeFixedEdge = await dialog.locator(".rr-custom-wall-base").count();
    await board.click({position: {x: box.width * 5.08 / 12, y: box.height * 14.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeFixedEdge - 1,
        "wall bordering a numbered start could not be erased");
    assert.equal(await dialog.locator(".rr-custom-start-number").count(), 8,
        "erasing a start wall also erased a starting number");
    await dialog.getByRole("button", {name: "Стена", exact: true}).click();
    await board.click({position: {x: box.width * 5.08 / 12, y: box.height * 14.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeFixedEdge,
        "wall bordering a numbered start could not be restored");
    const wallsBeforeSingleErase = await dialog.locator(".rr-custom-wall-base").count();
    await board.click({position: {x: box.width * .9 / 12, y: box.height * 12.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeSingleErase + 1);
    await dialog.getByRole("button", {name: "Ластик", exact: true}).click();
    await board.click({position: {x: box.width * .9 / 12, y: box.height * 12.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforeSingleErase,
        "single eraser click did not remove only the selected wall");
    await dialog.getByRole("button", {name: "Шестерня", exact: true}).click();
    await board.click({position: {x: box.width * 1.5 / 12, y: box.height * 12.5 / 16}});
    await dialog.getByRole("button", {name: "Ремонт", exact: true}).click();
    await board.click({position: {x: box.width * 2.5 / 12, y: box.height * 12.5 / 16}});
    assert.equal(await dialog.locator("img[src$='gear-right.webp']").count(), 1);
    assert.equal(await dialog.locator("img[src$='repair.webp']").count(), 1);
    await dialog.getByRole("button", {name: "Ластик", exact: true}).click();
    await draw([[1,12],[2,12]]);
    assert.equal(await dialog.locator("img[src$='gear-right.webp']").count(), 0,
        "dragging eraser did not clear the first start-card cell");
    assert.equal(await dialog.locator("img[src$='repair.webp']").count(), 0,
        "dragging eraser did not clear the second start-card cell");
    assert.equal(await dialog.locator(".rr-custom-junction").count(), 2, "merge or curved turn was not drawn");
    const merge = dialog.locator(".rr-custom-junction").first();
    const laneCount = await merge.locator(".rr-junction-lane").count();
    assert.equal(laneCount, 4,
        "three incoming belts and one outgoing belt were not shown together");
    assert.equal(await merge.locator(".rr-junction-head").count(), 1,
        "merge must have only one outgoing arrowhead");
    assert.match(await dialog.locator(".rr-custom-junction").last().locator(".rr-junction-lane").getAttribute("d"), / C/,
        "turning conveyor belt must have a rounded corner");
    await dialog.getByRole("button", {name: "Шестерня", exact: true}).click();
    await page.mouse.move(box.x + box.width * 2.5 / 12, box.y + box.height * 2.5 / 16);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 3.5 / 12, box.y + box.height * 2.5 / 16);
    assert.equal(await dialog.locator(".rr-editor-drawing").count(), 0,
        "single-cell tool displayed a drag selection");
    await page.mouse.up();
    assert.equal(await dialog.locator("img[src$='gear-right.webp']").count(), 1,
        "dragging a single-cell tool placed more than one element");
    await dialog.getByRole("button", {name: "Толкатель", exact: true}).click();
    const wallsBeforePusher = await dialog.locator(".rr-custom-wall-base").count();
    await board.click({position: {x: box.width * 2.9 / 12, y: box.height * 8.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-pusher").count(), 1);
    assert.equal(await dialog.locator(".rr-custom-wall-base").count(), wallsBeforePusher + 1,
        "pusher was not mounted on a wall");
    assert(await dialog.locator(".rr-custom-pusher-west").count() === 1,
        "pusher register label does not face away from its wall");
    const pusherLabel = await dialog.locator(".rr-custom-pusher-west").evaluate((element) => ({
        size: Number.parseFloat(getComputedStyle(element).fontSize),
        direction: getComputedStyle(element).flexDirection,
        layer: Number(getComputedStyle(element).zIndex),
        wallLayer: Number(getComputedStyle(element.closest(".rr-custom-factory").querySelector(".rr-custom-lines")).zIndex)}));
    assert(pusherLabel.size >= 7 && pusherLabel.size <= 11,
        "pusher register numbers are not compact and legible");
    assert.equal(pusherLabel.direction, "column-reverse",
        "upright register numbers do not run along the pusher wall");
    assert(pusherLabel.layer > pusherLabel.wallLayer, "wall lines obscure pusher register numbers");
    await board.click({position: {x: box.width * 2.1 / 12, y: box.height * 8.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-pusher").count(), 1,
        "pushers with overlapping registers were placed on one cell");
    assert.match(await dialog.locator(".rr-editor-footer [role=status]").innerText(), /не могут срабатывать в одном регистре/);
    const registerButtons = dialog.locator(".rr-editor-registers");
    for (const register of [2,4,1,3,5]) await registerButtons.getByRole("button", {name: String(register), exact: true}).click();
    await board.click({position: {x: box.width * 2.1 / 12, y: box.height * 8.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-pusher").count(), 2,
        "pushers with disjoint registers should be allowed");
    const sameCellPushers = await dialog.locator(".rr-custom-pusher").evaluateAll((elements) =>
        elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom};
        }));
    assert(sameCellPushers[0].right <= sameCellPushers[1].left
        || sameCellPushers[1].right <= sameCellPushers[0].left
        || sameCellPushers[0].bottom <= sameCellPushers[1].top
        || sameCellPushers[1].bottom <= sameCellPushers[0].top,
    "two pusher labels on one cell overlap");
    for (const register of [1,3,5]) await registerButtons.getByRole("button", {name: String(register), exact: true}).click();
    await board.click({position: {x: box.width * 3.9 / 12, y: box.height * 8.5 / 16}});
    const fullRegisterPusher = dialog.locator(".rr-custom-pusher").last();
    assert.equal(await fullRegisterPusher.textContent(), "1–5");
    const fullLabelBox = await fullRegisterPusher.boundingBox();
    assert(fullLabelBox.width < box.width / 12 && fullLabelBox.height < box.height / 16,
        "full-register pusher label extends outside its cell");
    const pusherBoxes = await dialog.locator(".rr-custom-pusher").evaluateAll((elements) =>
        elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom};
        }));
    for (let first = 0; first < pusherBoxes.length; first++)
        for (let second = first + 1; second < pusherBoxes.length; second++)
            assert(pusherBoxes[first].right <= pusherBoxes[second].left
                || pusherBoxes[second].right <= pusherBoxes[first].left
                || pusherBoxes[first].bottom <= pusherBoxes[second].top
                || pusherBoxes[second].bottom <= pusherBoxes[first].top,
            "neighboring pusher labels overlap");
    await page.setViewportSize({width: 390, height: 760});
    const narrowPusherBoxes = await dialog.locator(".rr-custom-pusher").evaluateAll((elements) =>
        elements.map((element) => {
            const rect = element.getBoundingClientRect();
            return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom};
        }));
    for (let first = 0; first < narrowPusherBoxes.length; first++)
        for (let second = first + 1; second < narrowPusherBoxes.length; second++)
            assert(narrowPusherBoxes[first].right <= narrowPusherBoxes[second].left
                || narrowPusherBoxes[second].right <= narrowPusherBoxes[first].left
                || narrowPusherBoxes[first].bottom <= narrowPusherBoxes[second].top
                || narrowPusherBoxes[second].bottom <= narrowPusherBoxes[first].top,
            "pusher labels overlap on a narrow screen");
    await page.setViewportSize({width: 1440, height: 900});
    await dialog.getByRole("button", {name: /Отменить/}).click();
    assert.equal(await dialog.locator(".rr-custom-pusher").count(), 2);
    const exported = async () => {
        const downloadEvent = page.waitForEvent("download");
        await dialog.getByRole("button", {name: "Экспорт JSON"}).click();
        const download = await downloadEvent;
        assert.match(download.suggestedFilename(), /^RoboRally-.*\.json$/);
        return JSON.parse(fs.readFileSync(await download.path(), "utf8"));
    };
    const beforeRotation = await exported();
    assert.equal(beforeRotation.format, "roborally-web-field");
    assert.equal(beforeRotation.version, 1);
    await dialog.getByRole("button", {name: "Повернуть основу по часовой стрелке"}).click();
    const clockwise = await exported();
    if (process.env.FIELD_EDITOR_ROTATED_SCREENSHOT)
        await dialog.screenshot({path: process.env.FIELD_EDITOR_ROTATED_SCREENSHOT});
    assert.equal(clockwise.rotation, 90);
    const rotateKey = (key) => { const [x,y] = key.split(",").map(Number); return y < 12 ? `${11-y},${x}` : key; };
    const directions = ["north","east","south","west"];
    for (const [key, facing] of Object.entries(beforeRotation.features.conveyors)) {
        assert.equal(clockwise.features.conveyors[rotateKey(key)], Number(key.split(",")[1]) < 12
            ? directions[(directions.indexOf(facing)+1)%4] : facing, `conveyor ${key} rotated incorrectly`);
    }
    for (const wall of beforeRotation.features.walls) {
        const [x,y,facing] = wall.split(",");
        const expected = Number(y) < 12 ? `${11-Number(y)},${x},${directions[(directions.indexOf(facing)+1)%4]}` : wall;
        assert(clockwise.features.walls.includes(expected), `wall ${wall} rotated incorrectly`);
    }
    for (const laser of beforeRotation.features.lasers) {
        const expected = laser.y < 12 ? {x: 11-laser.y,y: laser.x,
            direction: directions[(directions.indexOf(laser.direction)+1)%4]} : laser;
        assert(clockwise.features.lasers.some((item) => item.x === expected.x && item.y === expected.y
            && item.direction === expected.direction && item.count === laser.count), "laser rotated incorrectly");
    }
    for (const pusher of beforeRotation.features.pushers) {
        const expected = pusher.y < 12 ? {x: 11-pusher.y,y: pusher.x,
            direction: directions[(directions.indexOf(pusher.direction)+1)%4]} : pusher;
        assert(clockwise.features.pushers.some((item) => item.x === expected.x && item.y === expected.y
            && item.direction === expected.direction && item.active.join() === pusher.active.join()), "pusher rotated incorrectly");
    }
    assert.deepStrictEqual(clockwise.flags, beforeRotation.flags.map(([x,y]) => y < 12 ? [11-y,x] : [x,y]));
    await dialog.getByRole("button", {name: "Повернуть основу против часовой стрелки"}).click();
    const restored = await exported();
    assert.equal(restored.rotation, 0);
    for (const collection of ["pits","repairs","express","walls","connections","hintConnections"])
        assert.deepStrictEqual([...restored.features[collection]].sort(), [...beforeRotation.features[collection]].sort(),
            `${collection} was not restored after reverse rotation`);
    assert.deepStrictEqual(restored.features.gears, beforeRotation.features.gears);
    assert.deepStrictEqual(restored.features.conveyors, beforeRotation.features.conveyors);
    assert.deepStrictEqual(restored.features.lasers, beforeRotation.features.lasers);
    assert.deepStrictEqual(restored.features.pushers, beforeRotation.features.pushers);
    assert.deepStrictEqual(restored.flags, beforeRotation.flags);
    const pitsBeforeImport = await dialog.locator(".rr-custom-pit").count();
    await dialog.getByRole("button", {name: "Яма", exact: true}).click();
    await board.click({position: {x: box.width * 9.5 / 12, y: box.height * 9.5 / 16}});
    assert.equal(await dialog.locator(".rr-custom-pit").count(), pitsBeforeImport + 1);
    const importInput = dialog.getByLabel("Файл поля для импорта");
    await importInput.setInputFiles({name: "field.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(beforeRotation))});
    await page.waitForFunction((count) => document.querySelectorAll(".rr-editor-modal .rr-custom-pit").length === count,
        pitsBeforeImport);
    assert.equal(await dialog.locator(".rr-custom-pit").count(), pitsBeforeImport, "import did not restore the exported field");
    await importInput.setInputFiles({name: "broken.json", mimeType: "application/json", buffer: Buffer.from("{}")});
    await page.waitForFunction(() => document.querySelector(".rr-editor-footer [role=status]")?.textContent
        .includes("Импорт не выполнен"));
    assert.match(await dialog.locator(".rr-editor-footer [role=status]").innerText(), /Импорт не выполнен/);
    assert.equal(await dialog.locator(".rr-custom-pit").count(), pitsBeforeImport,
        "invalid import changed the draft");
    const legacyPitWalls = {...beforeRotation, features: {...beforeRotation.features,
        walls: [...beforeRotation.features.walls, "1,1,east"]}};
    await importInput.setInputFiles({name: "legacy-pit-wall.json", mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(legacyPitWalls))});
    await page.waitForFunction(() => document.querySelector(".rr-editor-footer [role=status]")?.textContent
        .includes("Поле импортировано"));
    assert(!(await exported()).features.walls.includes("1,1,east"),
        "import retained a wall between two pit cells");
    await dialog.getByRole("button", {name: "Очистить"}).click();
    const cleared = await exported();
    assert.equal(cleared.sourceBoard, "");
    assert.equal(cleared.rotation, 0);
    assert.deepStrictEqual(cleared.flags, []);
    assert.deepStrictEqual(cleared.features.pits, []);
    assert.deepStrictEqual(cleared.features.conveyors, {});
    assert.equal(await dialog.locator(".rr-custom-start-number").count(), 8,
        "clearing removed the protected starting positions");
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown",
        {key: "я", code: "KeyZ", ctrlKey: true, bubbles: true})));
    const afterUndo = await exported();
    assert.deepStrictEqual(afterUndo.features, beforeRotation.features,
        "Ctrl+Z did not restore the edited field");
    assert.deepStrictEqual(afterUndo.flags, beforeRotation.flags,
        "Ctrl+Z did not restore the flags");
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown",
        {key: "Я", code: "KeyZ", ctrlKey: true, shiftKey: true, bubbles: true})));
    const afterRedo = await exported();
    assert.deepStrictEqual(afterRedo.features, cleared.features,
        "Ctrl+Shift+Z did not repeat the clearing action");
    await page.keyboard.press("Control+z");
    assert.deepStrictEqual((await exported()).features, beforeRotation.features,
        "Ctrl+Z did not restore the field after redo");
    await page.setViewportSize({width: 390, height: 760});
    assert(await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    }), "editor modal overflows a narrow viewport");
    assert(await dialog.locator(".rr-editor-footer").evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        "editor actions overflow on a narrow viewport");
    assert(await palette.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        "picture palette overflows on a narrow viewport");
    await page.setViewportSize({width: 1440, height: 900});
    await dialog.getByRole("button", {name: "Повернуть основу по часовой стрелке"}).click();
    await dialog.getByRole("button", {name: "Закрыть редактор"}).click();
    await page.getByRole("button", {name: "Открыть редактор поля"}).click();
    await dialog.waitFor();
    assert.match(await dialog.locator(".rr-editor-rotation").innerText(), /90°/,
        "rotation was lost when the editor reopened");
    assert.equal(await dialog.locator(".rr-custom-junction").count(), 2, "closing lost the conveyor draft");
    assert.equal(await dialog.locator(".rr-editor-flag").count(), 1, "closing lost the flag draft");
    await dialog.getByRole("button", {name: "Выбрать это поле"}).click();
    await page.locator(".selected-course-strip strong").getByText("Моё поле").waitFor();
    assert.equal(await page.locator(".large-course-preview .rr-custom-factory").count(), 1);
    assert.equal(await page.locator(".large-course-preview .rr-custom-junction").count(), 2);
    assert.equal(await page.locator(".large-course-preview .rr-custom-start-number").count(), 8);
    assert.equal(await page.locator(".large-course-preview .large-preview-flag .flag-wrench").count(), 0,
        "lobby flag should keep its original round marker");
    await page.reload({waitUntil: "domcontentloaded"});
    await page.locator(".selected-course-strip strong").getByText("Моё поле").waitFor({timeout: 15000});
    if (await roomDialog.isVisible().catch(() => false)) await roomDialog.locator(".room-mode-dialog-ok").click();
    await page.locator(".constructor").evaluate((element) => element.open = true);
    assert.equal(await page.locator(".constructor-fields label", {hasText: "Карта"}).locator("select").inputValue(), "Cross",
        "quick course retained an authored board that has no standard board image");
    await page.waitForFunction(() => {
        const image = document.querySelector(".constructor-preview-factory");
        return image?.complete && image.naturalWidth > 0 && image.src.endsWith("/cross.webp");
    });
    await page.getByRole("button", {name: "Присоединиться к игре"}).click();
    const guest = await openSandboxUser(browser, {port, room: "field-editor", name: "Second Editor",
        viewport: {width: 1280, height: 800}, timeout: 15000});
    await guest.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await page.getByRole("button", {name: "Начать игру"}).click();
    await page.locator(".board .rr-custom-full-field").waitFor();
    await guest.page.locator(".board .rr-custom-full-field").waitFor();
    assert(Math.abs(await page.locator(".board-overlay .flag").first().evaluate((element) => Number.parseFloat(element.style.left))
        - (3.5/12*100)) < .1, "rotated flag coordinates were not used in the game");
    assert.equal(await page.locator(".board .rr-custom-start-number").count(), 8);
    assert.equal(await page.locator(".board .factory-card.rr-full-field")
        .evaluate((element) => getComputedStyle(element).zIndex), "0",
    "the authored start card must remain below robot tokens");
    assert.equal(await page.locator(".board .rr-custom-start-number").first()
        .evaluate((element) => getComputedStyle(element).zIndex), "0",
    "redrawn starting positions must be the bottom field layer");
    assert.equal(await guest.page.locator(".board .rr-custom-start-number").count(), 8);
    assert.equal(await page.locator(".board .rr-custom-pusher").count(), 2);
    assert.deepStrictEqual(pageErrors, []);
    console.log("Custom field editor, import/export, rotation, start card and game rendering passed.");
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; })
    .finally(async () => { if (browser) await browser.close(); stopSandbox(server); });
