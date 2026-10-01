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
        await host.waitForFunction((compact) => document.querySelector(".roborally-app")
            ?.classList.contains("rr-docks-compact") === compact, viewport.width <= 760);
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
            const zoom = toolbar.querySelector(".rr-board-zoom-controls").getBoundingClientRect();
            const view = toolbar.querySelector(".rr-view-controls").getBoundingClientRect();
            const hints = toolbar.querySelector(".board-hints-toggle").getBoundingClientRect();
            return {fits: toolbar.scrollWidth <= toolbar.clientWidth + 1,
                hasZoom: toolbar.querySelectorAll(".rr-board-zoom-controls > button").length === 3,
                hasView: !!toolbar.querySelector(".rr-view-controls"),
                hasHints: !!toolbar.querySelector(".board-hints-toggle"),
                sameRow: Math.abs(zoom.top - view.top) <= 4 && Math.abs(view.top - hints.top) <= 4,
                hintsHaveNeighbor: Math.abs(zoom.top - hints.top) <= 4 || Math.abs(view.top - hints.top) <= 4};
        });
        assert(controls.fits && controls.hasZoom && controls.hasView && controls.hasHints,
            `${viewport.width}×${viewport.height}: field controls overflow or are missing`);
        assert(controls.hintsHaveNeighbor,
            `${viewport.width}×${viewport.height}: hint button is stranded on its own row`);
        if (viewport.width === 1440 && viewport.height === 900)
            assert(controls.sameRow, `field controls do not fit one row: ${JSON.stringify(controls)}`);
        const layout = await host.locator(".bottom-dock").evaluate((dock) => {
            const scroll = dock.querySelector(".bottom-dock-scroll");
            const program = dock.querySelector(".program");
            const token = dock.querySelector(".power-down-token");
            const tokenLabel = token?.querySelector("span");
            const box = dock.getBoundingClientRect();
            return {overflow: scroll.scrollHeight - scroll.clientHeight,
                dockHeight: box.height, programHeight: program.getBoundingClientRect().height,
                dockWidth: box.width, scrollWidth: scroll.clientWidth,
                registerColumns: getComputedStyle(program.querySelector(".registers")).gridTemplateColumns,
                cardsHeight: program.querySelector(".cards").getBoundingClientRect().height,
                tokenFits: !tokenLabel || tokenLabel.scrollWidth <= tokenLabel.clientWidth + 1,
                inside: box.left >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1};
        });
        assert(layout.inside, `${viewport.width}×${viewport.height}: dock escapes viewport`);
        assert(layout.overflow <= 2, `${viewport.width}×${viewport.height}: needless vertical dock scrollbar (${JSON.stringify(layout)})`);
        if (viewport.width === 1440 && viewport.height === 900) {
            const compactProgram = await host.locator(".program").evaluate((program) => {
                const intro = program.querySelector(".program-heading > div:first-child").getBoundingClientRect();
                const actions = program.querySelector(".program-actions").getBoundingClientRect();
                const registers = program.querySelector(".registers").getBoundingClientRect();
                const cards = program.querySelector(".cards").getBoundingClientRect();
                return {introBottom: intro.bottom, actionsBottom: actions.bottom,
                    registersTop: registers.top, registersBottom: registers.bottom, cardsTop: cards.top};
            });
            assert(layout.dockHeight < 270 && compactProgram.registersTop < compactProgram.actionsBottom - 8
                && compactProgram.cardsTop >= compactProgram.registersBottom,
            `wide programming dock still wastes vertical space: ${JSON.stringify({layout, compactProgram})}`);
        }
        assert(layout.tokenFits, `${viewport.width}×${viewport.height}: Power Down label overflows its token`);
        await host.waitForFunction(() => {
            const dock = document.querySelector(".bottom-dock");
            const screen = document.querySelector(".game-screen");
            return Math.abs(parseFloat(getComputedStyle(screen).paddingBottom) - dock.getBoundingClientRect().height - 16) <= 2;
        });
        if (viewport.width === 1440 && viewport.height === 900)
            await host.waitForFunction(() => document.documentElement.scrollHeight <= innerHeight + 2);
        const boardGap = await host.evaluate(() => {
            window.scrollTo(0, document.documentElement.scrollHeight);
            const board = document.querySelector(".board-viewport").getBoundingClientRect();
            const dock = document.querySelector(".bottom-dock").getBoundingClientRect();
            const gameScreen = document.querySelector(".game-screen");
            return {gap: dock.top - board.bottom, scrollable: document.documentElement.scrollHeight > innerHeight + 2,
                boardBottom: board.bottom, dockTop: dock.top, dockHeight: dock.height,
                gameBottom: gameScreen.getBoundingClientRect().bottom,
                paddingBottom: getComputedStyle(gameScreen).paddingBottom,
                scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight,
                scrollWidth: document.documentElement.scrollWidth, innerWidth,
                boardLeft: board.left, boardRight: board.right,
                column: document.querySelector(".board-column").getBoundingClientRect().toJSON()};
        });
        assert(!boardGap.scrollable || boardGap.gap >= 0 && boardGap.gap <= 36,
            `${viewport.width}×${viewport.height}: board-to-dock gap is wrong (${JSON.stringify(boardGap)})`);
        if (viewport.width === 1440 && viewport.height === 900)
            assert(boardGap.maxScroll <= 2,
                `automatic board size still causes page scrolling (${JSON.stringify(boardGap)})`);
    }

    const dragDock = async (panel, edge) => {
        const handle = host.locator(panel === "info" ? ".game-side-hud .rr-dock-placement"
            : ".bottom-dock .rr-program-dock-actions > .rr-dock-placement");
        await host.evaluate(() => window.scrollTo(0, 0));
        const source = await handle.boundingBox();
        await host.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
        await host.mouse.down();
        await host.mouse.move(source.x + source.width / 2 + 18, source.y + source.height / 2 + 18, {steps: 6});
        await host.locator(".rr-dock-drop-overlay").waitFor({state: "visible"});
        const viewport = host.viewportSize();
        const destination = edge === "left" ? {x: 24, y: viewport.height / 2}
            : edge === "right" ? {x: viewport.width - 24, y: viewport.height / 2}
            : edge === "top" ? {x: viewport.width / 2, y: 24}
            : {x: viewport.width / 2, y: viewport.height - 24};
        await host.mouse.move(destination.x, destination.y, {steps: 8});
        await host.waitForFunction((requested) => document.querySelector(".rr-dock-snap-preview")
            ?.classList.contains(`rr-dock-snap-${requested}`), edge);
        await host.mouse.up();
        await host.locator(".rr-dock-drop-overlay").waitFor({state: "detached"});
    };
    const dockState = () => host.locator(".roborally-app").evaluate((root) => ({
        info: root.dataset.infoDock, program: root.dataset.programDock,
        compact: root.classList.contains("rr-docks-compact")
    }));
    const dockBoxes = () => host.evaluate(() => {
        const box = (selector) => {
            const rect = document.querySelector(selector).getBoundingClientRect();
            return {left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom};
        };
        return {info: box(".game-side-hud"), program: box(".bottom-dock"), board: box(".board-viewport")};
    });
    await host.setViewportSize({width: 1440, height: 900});
    await host.waitForFunction(() => !document.querySelector(".roborally-app")?.classList.contains("rr-docks-compact"));
    const nearRegisterDrop = await host.evaluate(() => {
        const register = document.querySelector(".program .register").getBoundingClientRect();
        const card = document.querySelector(".program .card");
        const transfer = new DataTransfer();
        card.dispatchEvent(new DragEvent("dragstart", {bubbles: true, dataTransfer: transfer}));
        const x = register.left + register.width / 2;
        const y = register.top - 14;
        const target = document.elementFromPoint(x, y);
        const over = new DragEvent("dragover", {bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer});
        target.dispatchEvent(over);
        const drop = new DragEvent("drop", {bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: transfer});
        target.dispatchEvent(drop);
        return {accepted: over.defaultPrevented, dropped: drop.defaultPrevented};
    });
    assert(nearRegisterDrop.accepted && nearRegisterDrop.dropped,
        `a card dropped just above the first register was ignored: ${JSON.stringify(nearRegisterDrop)}`);
    await host.waitForFunction(() => !document.querySelector(".program .register span")?.textContent.includes("—"));
    await dragDock("info", "left");
    await dragDock("program", "right");
    assert.deepStrictEqual(await dockState(), {info: "left", program: "right", compact: false});
    let docks = await dockBoxes();
    assert(docks.info.right <= docks.board.left + 1 && docks.board.right <= docks.program.left + 1,
        `side docks cover the board: ${JSON.stringify(docks)}`);
    assert.deepStrictEqual(await guest.locator(".roborally-app").evaluate((root) =>
        [root.dataset.infoDock, root.dataset.programDock]), ["right", "bottom"],
    "one player's dock settings changed another player's layout");
    await host.setViewportSize({width: 1100, height: 800});
    await host.waitForFunction(() => document.querySelector(".roborally-app")?.classList.contains("rr-docks-compact"));
    assert.deepStrictEqual(await dockState(), {info: "top", program: "bottom", compact: true},
        "two side docks were not adapted on a medium screen");
    await host.setViewportSize({width: 1440, height: 900});
    await host.waitForFunction(() => !document.querySelector(".roborally-app")?.classList.contains("rr-docks-compact"));
    await dragDock("info", "bottom");
    assert.deepStrictEqual(await dockState(), {info: "bottom", program: "right", compact: false});
    await host.waitForFunction(() => document.querySelector(".game-side-hud")?.getBoundingClientRect().width > 900);
    const wideInfo = await host.locator(".game-side-hud").evaluate((hud) => {
        const players = hud.querySelector(".players-panel").getBoundingClientRect();
        const footer = hud.querySelector(".rr-hud-footer").getBoundingClientRect();
        const scroll = hud.querySelector(".dock-scroll");
        const zoom = hud.querySelector(".rr-board-zoom-controls").getBoundingClientRect();
        const hints = hud.querySelector(".board-hints-toggle").getBoundingClientRect();
        return {width: hud.getBoundingClientRect().width, playersRight: players.right, footerLeft: footer.left,
            overflow: scroll.scrollHeight - scroll.clientHeight,
            hintsBesideZoom: Math.abs(zoom.top - hints.top) <= 4};
    });
    assert(wideInfo.width > 900 && wideInfo.playersRight <= wideInfo.footerLeft + 1
        && wideInfo.overflow <= 2 && wideInfo.hintsBesideZoom,
        `horizontal information dock did not use the available width: ${JSON.stringify(wideInfo)}`);
    await dragDock("program", "bottom");
    assert.deepStrictEqual(await dockState(), {info: "right", program: "bottom", compact: false},
        "choosing an occupied docking place did not exchange the panels");
    await dragDock("program", "top");
    assert(!await host.locator(".bottom-dock").evaluate((element) => element.classList.contains("collapsed")),
        "dragging the programming dock also collapsed it");
    docks = await dockBoxes();
    assert(docks.program.bottom <= docks.board.top + 1,
        `top programming dock covers the board: ${JSON.stringify(docks)}`);
    assert(await host.locator(".game-screen").evaluate((element) => parseFloat(getComputedStyle(element).paddingBottom) < 50),
        "top programming dock still reserves a large empty area at the bottom");
    await host.setViewportSize({width: 2048, height: 991});
    const topDockPage = await host.evaluate(() => ({
        overflow: document.documentElement.scrollHeight - innerHeight,
        boardBottom: document.querySelector(".board-viewport").getBoundingClientRect().bottom,
        paddingBottom: parseFloat(getComputedStyle(document.querySelector(".game-screen")).paddingBottom)
    }));
    assert(topDockPage.paddingBottom < 50 && topDockPage.overflow <= 2,
        `top dock leaves unnecessary page scrolling: ${JSON.stringify(topDockPage)}`);
    await host.setViewportSize({width: 1440, height: 900});
    await dragDock("info", "top");
    assert.deepStrictEqual(await dockState(), {info: "top", program: "right", compact: false});
    await dragDock("program", "left");
    await dragDock("info", "bottom");
    assert.deepStrictEqual(await dockState(), {info: "bottom", program: "left", compact: false});
    const beforeLeftDockZoom = await dockBoxes();
    await host.locator(".board-toolbar").getByRole("button", {name: "Увеличить поле"}).click();
    await host.locator(".board-toolbar").getByRole("button", {name: "Увеличить поле"}).click();
    const afterLeftDockZoom = await dockBoxes();
    assert(afterLeftDockZoom.board.left < beforeLeftDockZoom.board.left - 20
        && afterLeftDockZoom.board.right > beforeLeftDockZoom.board.right + 20,
    `field with a left dock did not expand in both directions: ${JSON.stringify({beforeLeftDockZoom, afterLeftDockZoom})}`);
    await host.locator(".board-toolbar").getByRole("button", {name: "Автоматический размер поля"}).click();
    await host.reload();
    await host.locator(".bottom-dock").waitFor();
    assert.deepStrictEqual(await dockState(), {info: "bottom", program: "left", compact: false},
        "panel positions did not survive page reload");
    await host.setViewportSize({width: 390, height: 760});
    await host.waitForFunction(() => document.querySelector(".roborally-app")?.classList.contains("rr-docks-compact"));
    assert.deepStrictEqual(await dockState(), {info: "bottom", program: "top", compact: true});
    docks = await dockBoxes();
    assert(docks.program.bottom <= docks.board.top + 1 && docks.board.bottom <= docks.info.top + 1,
        `compact docks overlap the board: ${JSON.stringify(docks)}`);
    await host.setViewportSize({width: 1440, height: 900});
    await host.waitForFunction(() => !document.querySelector(".roborally-app")?.classList.contains("rr-docks-compact"));
    await dragDock("info", "right");
    await dragDock("program", "bottom");
    await host.evaluate(() => window.scrollTo(0, 0));

    await host.locator(".board-toolbar").getByRole("button", {name: "Повернуть вид по часовой стрелке"}).click();
    assert.equal(await host.evaluate(() => localStorage.getItem("roborally-board-view-angle")), "180",
        "manual view rotation was not persisted");
    await host.locator(".board-toolbar").getByRole("button", {name: "Автоматический ракурс поля"}).click();
    assert.equal(await host.evaluate(() => localStorage.getItem("roborally-board-view-angle")), null,
        "reset field view did not restore automatic orientation");
    await host.waitForFunction(() => {
        const board = document.querySelector(".board-viewport");
        const column = document.querySelector(".board-column");
        return board?.classList.contains("rr-view-landscape")
            && board.getBoundingClientRect().width > column.getBoundingClientRect().width * .6;
    });
    const autoWidth = await host.locator(".board-viewport").evaluate((element) => element.getBoundingClientRect().width);
    assert.equal(await host.locator(".rr-dock-placement-menu").count(), 0,
        "the drag handle still opens the old placement menu");
    const handles = await host.locator(".rr-dock-placement").evaluateAll((elements) => elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return {width: rect.width, height: rect.height};
    }));
    assert(handles.every((handle) => handle.width <= 30 && handle.height <= 30),
        `panel drag handles are too large: ${JSON.stringify(handles)}`);
    const panelControls = await host.evaluate(() => {
        const info = [...document.querySelectorAll(".game-side-hud .dock-title > button")];
        const program = [...document.querySelectorAll(".rr-program-dock-actions > button")];
        const appearance = (button) => {
            const rect = button.getBoundingClientRect();
            const style = getComputedStyle(button);
            return {width: rect.width, height: rect.height, color: style.color,
                background: style.backgroundColor, border: style.borderColor, fontSize: style.fontSize};
        };
        return {infoOrder: info.map((button) => button.classList.contains("rr-dock-collapse-button") ? "collapse" : "drag"),
            programOrder: program.map((button) => button.classList.contains("rr-dock-collapse-button") ? "collapse" : "drag"),
            info: appearance(info[0]), program: appearance(program[0]),
            infoIcon: info[0].innerText.trim(), programIcon: program[0].querySelector(".rr-dock-chevron").innerText};
    });
    assert.deepStrictEqual(panelControls.infoOrder, ["collapse", "drag"]);
    assert.deepStrictEqual(panelControls.programOrder, ["collapse", "drag"]);
    assert.deepStrictEqual(panelControls.info, panelControls.program,
        `the two collapse buttons have different styles: ${JSON.stringify(panelControls)}`);
    assert.equal(panelControls.infoIcon, panelControls.programIcon,
        "the two collapse buttons use different icons");
    const programButtons = await host.locator(".rr-program-dock-actions").evaluate((actions) => {
        const toggle = actions.querySelector(".bottom-dock-toggle").getBoundingClientRect();
        const handle = actions.querySelector(".rr-dock-placement").getBoundingClientRect();
        return {aligned: Math.abs(toggle.top - handle.top) <= 1,
            neighboring: handle.left - toggle.right >= 0 && handle.left - toggle.right <= 6,
            sameSize: Math.abs(toggle.width - handle.width) <= 1 && Math.abs(toggle.height - handle.height) <= 1};
    });
    assert(Object.values(programButtons).every(Boolean),
        `collapse and drag buttons are not a compact pair: ${JSON.stringify(programButtons)}`);
    await host.locator(".board-toolbar").getByRole("button", {name: "Увеличить поле"}).click();
    const enlargedWidth = await host.locator(".board-viewport").evaluate((element) => element.getBoundingClientRect().width);
    assert(enlargedWidth > autoWidth * 1.1, "manual enlargement did not change the field size");
    for (let index = 0; index < 7; index++)
        await host.locator(".board-toolbar").getByRole("button", {name: "Увеличить поле"}).click();
    const enlargedPosition = await host.evaluate(() => {
        const board = document.querySelector(".board-viewport").getBoundingClientRect();
        const column = document.querySelector(".board-column").getBoundingClientRect();
        return {boardCenter: (board.left + board.right) / 2,
            columnCenter: (column.left + column.right) / 2,
            boardWidth: board.width, columnWidth: column.width};
    });
    assert(enlargedPosition.boardWidth > enlargedPosition.columnWidth
        && Math.abs(enlargedPosition.boardCenter - enlargedPosition.columnCenter) <= 2,
    `oversized field no longer grows equally to the left and right: ${JSON.stringify(enlargedPosition)}`);
    await host.locator(".board-toolbar").getByRole("button", {name: "Автоматический размер поля"}).click();
    await host.waitForTimeout(150);
    const resetSize = await host.evaluate(() => ({width: document.querySelector(".board-viewport").getBoundingClientRect().width,
        columnWidth: document.querySelector(".board-column").getBoundingClientRect().width,
        scrollY, innerWidth, screenPadding: getComputedStyle(document.querySelector(".game-screen")).paddingBottom}));
    assert(Math.abs(resetSize.width - autoWidth) <= 2,
        `automatic field size did not return after manual enlargement: ${JSON.stringify({autoWidth, resetSize})}`);

    await host.locator(".game-pause-controls .pause").click();
    await host.locator(".pause-banner").waitFor();
    for (const viewport of [{width: 1440, height: 900}, {width: 1024, height: 650}, {width: 390, height: 760}]) {
        await host.setViewportSize(viewport);
        await host.waitForFunction((compact) => document.querySelector(".roborally-app")
            ?.classList.contains("rr-docks-compact") === compact, viewport.width <= 760);
        const banner = await host.locator(".pause-banner").evaluate((element) => {
            const box = element.getBoundingClientRect();
            return {inside: box.left >= -1 && box.right <= innerWidth + 1 && box.top >= 0,
                noOverflow: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1,
                height: box.height, width: box.width, computedWidth: getComputedStyle(element).width,
                rootClasses: document.querySelector(".roborally-app")?.className,
                mode: element.querySelector("span")?.innerText};
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
