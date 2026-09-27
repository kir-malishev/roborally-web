"use strict";

const assert = require("assert");
const {launchBrowser, openUser: openSandboxUser, startSandbox, stopSandbox} = require("./browser-support");

const port = process.env.LOBBY_PORT || "3012";
const {server, ready} = startSandbox(port);
let browser;

async function openUser(id, name) {
    return openSandboxUser(browser, {port, room: "lobby-smoke", name, viewport: {width: 1440, height: 1000}, timeout: 15000});
}

(async () => {
    await ready;
    browser = await launchBrowser();
    const host = await openUser("lobby-host", "Хост");
    const guest = await openUser("lobby-guest", "Гость");
    const viewer = await openUser("lobby-viewer", "Зритель");
    const removable = await openUser("lobby-removable", "Удаляемый");

    await viewer.page.locator(".login-menu").click();
    await viewer.page.getByText("Войти через Discord", {exact: true}).click();
    await viewer.page.locator(".lobby-member.spectator .profile-button").waitFor();
    const profileClose = viewer.page.locator(".profile-container-close");
    if (await profileClose.isVisible().catch(() => false)) await profileClose.click();

    await host.page.getByRole("button", {name: "⚙ Настройки"}).click();
    const settings = host.page.getByRole("dialog", {name: "Настройки игры"});
    await settings.waitFor();
    assert.equal(await settings.getByRole("spinbutton", {name: "Число жизней"}).inputValue(), "3");
    assert.equal(await settings.getByRole("spinbutton", {name: "Таймер последнего игрока, секунд"}).inputValue(), "30");
    await settings.getByRole("button", {name: "simple"}).click();
    await host.page.waitForFunction(() => [...document.querySelectorAll('.rr-settings-modal button[aria-pressed="true"]')]
        .some((button) => button.textContent?.includes("simple")));
    assert.equal(await settings.getByRole("button", {name: "simple"}).getAttribute("aria-pressed"), "true");
    await settings.getByRole("button", {name: "classic"}).click();
    await host.page.setViewportSize({width: 390, height: 760});
    assert(await settings.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
    }), "game settings modal overflows a narrow viewport");
    await host.page.setViewportSize({width: 1440, height: 1000});
    await settings.getByRole("button", {name: "Закрыть настройки"}).click();
    assert.equal(await host.page.getByRole("dialog", {name: "Настройки игры"}).count(), 0);
    await viewer.page.getByRole("button", {name: "⚙ Настройки"}).click();
    assert(await viewer.page.getByRole("dialog", {name: "Настройки игры"}).getByRole("button", {name: "simple"}).isDisabled(),
        "spectator can edit game settings");
    await viewer.page.keyboard.press("Escape");
    await viewer.page.getByRole("dialog", {name: "Настройки игры"}).waitFor({state: "detached"});

    const removableRow = host.page.locator(".lobby-member.spectator", {hasText: "Удаляемый"});
    await removableRow.locator('[aria-label="Удалить зрителя"]').click();
    await host.page.locator(".popup_modals .btn_pmry").click();
    await removableRow.waitFor({state: "detached"});
    await removable.context.close();

    assert.equal(await host.page.locator(".seat").count(), 0, "Old robot seat selector is still visible");
    assert.equal(await viewer.page.locator(".course-card").count(), 22, "Spectator cannot see every single-board course from the rulebook");
    assert.equal(await viewer.page.locator(".course-thumbnail img").count(), 44, "Full course thumbnails are missing");
    const lobbyActionLayout = async (page) => page.locator(".lobby-intro").evaluate((intro) => {
        const boxes = [...intro.querySelectorAll(".role-actions button, .lobby-start > :first-child")].map((element) => {
            const box = element.getBoundingClientRect();
            return {left: box.left, right: box.right, top: box.top, bottom: box.bottom,
                textFits: element.scrollWidth <= element.clientWidth + 1 && element.scrollHeight <= element.clientHeight + 1};
        });
        return {boxes, columns: getComputedStyle(intro.querySelector(".lobby-primary-actions")).gridTemplateColumns};
    });
    const assertLobbyActionsFit = (layout, label) => {
        assert.equal(layout.boxes.length, 3, `${label}: lobby action row is incomplete`);
        assert(layout.boxes.every(({textFits}) => textFits), `${label}: action button text escapes its button`);
        for (let index = 0; index < layout.boxes.length; index++)
            for (let next = index + 1; next < layout.boxes.length; next++) {
                const left = layout.boxes[index], right = layout.boxes[next];
                assert(left.right <= right.left + 1 || right.right <= left.left + 1
                    || left.bottom <= right.top + 1 || right.bottom <= left.top + 1,
                `${label}: lobby action buttons overlap`);
            }
    };
    for (const page of [host.page, viewer.page]) {
        const layout = await lobbyActionLayout(page);
        assertLobbyActionsFit(layout, "Wide lobby");
    }
    const catalogueMetrics = await viewer.page.locator(".course-list").evaluate((element) => ({
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        columns: getComputedStyle(element).gridTemplateColumns.split(" ").length
    }));
    assert(catalogueMetrics.scrollHeight > catalogueMetrics.clientHeight, "Course catalogue still expands the whole lobby page");
    assert.equal(catalogueMetrics.columns, 2, "Wide lobby does not use a compact two-column course catalogue");
    const startBox = await host.page.getByRole("button", {name: "Начать игру"}).boundingBox();
    assert(startBox && startBox.y < 400, "Start button is hidden below the course catalogue");
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
    assert(!await viewer.page.locator(".course-card").first().isDisabled(), "Spectator cannot inspect a course");
    assert.equal(await viewer.page.locator(".course-inspector-actions .primary").count(), 0, "Spectator received a course selection control");
    const initialSelectedCourse = await viewer.page.locator(".selected-course-strip strong").innerText();
    await viewer.page.locator(".course-card", {hasText: "Moving Targets"}).click();
    await viewer.page.locator(".selected-course-preview", {hasText: "Moving Targets"}).waitFor();
    assert.equal(await viewer.page.locator(".selected-course-strip strong").innerText(), initialSelectedCourse,
        "Inspecting a course as spectator changed the room selection");
    await viewer.page.setViewportSize({width: 800, height: 900});
    assertLobbyActionsFit(await lobbyActionLayout(viewer.page), "800px lobby");
    assert(await viewer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        "800px lobby has horizontal overflow");
    await viewer.page.setViewportSize({width: 460, height: 900});
    const narrowLayout = await viewer.page.locator(".course-browser-layout").evaluate((element) => ({
        columns: getComputedStyle(element).gridTemplateColumns.split(" ").length,
        appWidth: document.querySelector(".roborally-app").scrollWidth,
        viewportWidth: document.querySelector(".roborally-app").clientWidth
    }));
    assert.equal(narrowLayout.columns, 1, "Narrow lobby does not stack the catalogue and preview");
    assert(narrowLayout.appWidth <= narrowLayout.viewportWidth + 1, "Narrow lobby has horizontal overflow");
    assertLobbyActionsFit(await lobbyActionLayout(viewer.page), "460px lobby");
    await viewer.page.setViewportSize({width: 320, height: 760});
    assertLobbyActionsFit(await lobbyActionLayout(viewer.page), "320px lobby");
    assert(await viewer.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        "320px lobby has horizontal overflow");
    await viewer.page.setViewportSize({width: 1440, height: 1000});

    const movingTargets = host.page.locator(".course-card", {hasText: "Moving Targets"});
    await movingTargets.locator(".special-rule-marker").hover();
    const specialRuleTooltip = host.page.locator(".rr-special-rule-popover");
    assert(await specialRuleTooltip.isVisible(), "Special Rules tooltip does not open on hover");
    assert((await specialRuleTooltip.innerText()).includes("флаги движутся конвейерами"),
        "Special Rules tooltip has the wrong text");
    assert(await specialRuleTooltip.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
            && element.scrollHeight <= element.clientHeight + 1;
    }), "Special Rules tooltip is clipped by the course catalogue or viewport");
    await host.page.setViewportSize({width: 320, height: 760});
    await movingTargets.locator(".special-rule-marker").hover();
    const narrowTooltip = await specialRuleTooltip.evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {left: box.left, right: box.right, top: box.top, bottom: box.bottom,
            viewportWidth: innerWidth, viewportHeight: innerHeight,
            contentHeight: element.scrollHeight, visibleHeight: element.clientHeight};
    });
    assert(narrowTooltip.left >= 0 && narrowTooltip.right <= narrowTooltip.viewportWidth
        && narrowTooltip.top >= 0 && narrowTooltip.bottom <= narrowTooltip.viewportHeight
        && narrowTooltip.contentHeight <= narrowTooltip.visibleHeight + 1,
    `Special Rules tooltip escapes a narrow screen: ${JSON.stringify(narrowTooltip)}`);
    await host.page.setViewportSize({width: 1440, height: 1000});
    await movingTargets.click();
    await viewer.page.locator(".selected-course-special-rules", {hasText: "флаги движутся конвейерами"}).waitFor();
    assert.equal(await viewer.page.locator(".selected-course-special-rules").count(), 1,
        "selected course preview does not show its special rules");

    await host.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.page.locator(".host-controls").hover();
    await guest.page.locator(".host-controls .settings-button", {hasText: "edit"}).click();
    await guest.page.locator(".popup_modals .modal_input").fill("Механик");
    await guest.page.locator(".popup_modals .btn_pmry").click();
    await guest.page.getByRole("button", {name: "Присоединиться к игре"}).click();
    await host.page.locator(".lobby-member", {hasText: "Механик"}).waitFor();
    await host.page.locator(".lobby-robot-color").nth(1).waitFor();
    const colors = await host.page.locator(".lobby-robot-color").evaluateAll((items) => items.map((item) => item.style.background));
    assert.equal(new Set(colors).size, 2, "Players received the same color");
    const guestRow = host.page.locator(".lobby-member", {hasText: "Механик"});
    assert.equal(await guestRow.locator('[aria-label="Передать хоста"] .material-icons').innerText(), "vpn_key",
        "Host transfer is not marked with a key");
    await guestRow.locator('[aria-label="Передать хоста"]').click();
    await host.page.locator(".popup_modals .btn_pmry").click();
    await guest.page.locator(".lobby-start", {hasText: "Курс и состав готовы"}).waitFor();
    const formerHostRow = guest.page.locator(".lobby-member", {hasText: "Хост"});
    await formerHostRow.locator('[aria-label="Передать хоста"]').click();
    await guest.page.locator(".popup_modals .btn_pmry").click();
    await host.page.locator(".lobby-start", {hasText: "Курс и состав готовы"}).waitFor();
    await guest.page.getByRole("button", {name: "Стать зрителем"}).click();
    await host.page.locator(".member-column", {hasText: "Зрители"}).locator(".lobby-member", {hasText: "Механик"}).waitFor();
    await guest.page.getByRole("button", {name: "Присоединиться к игре"}).click();

    const previewStarts = async (page) => page.locator(".large-course-preview .course-preview-robot")
        .evaluateAll((markers) => markers.map((marker) => ({title: marker.title, start: Number(marker.dataset.start)}))
            .sort((left, right) => left.title.localeCompare(right.title)));
    await host.page.locator(".large-course-preview .course-preview-robot").nth(1).waitFor();
    const initialStarts = await previewStarts(host.page);
    assert.deepEqual(initialStarts.map(({start}) => start).sort(), [1, 2], "Players received starts outside positions 1–2");
    assert.deepEqual(await previewStarts(viewer.page), initialStarts, "Spectator sees different starting positions");
    assert.equal(await host.page.locator(".course-start-controls .course-start-chip").count(), 2,
        "start assignments are not shown next to the course preview");
    assert.equal(await host.page.locator(".course-start-controls button", {hasText: "Перемешать старты"}).count(), 1,
        "reshuffle button is not next to the start assignments");
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
    const flagShape = async (locator) => locator.evaluate((element) => {
        const {width,height} = element.getBoundingClientRect();
        return {width,height};
    });
    const largeFlag = await flagShape(viewer.page.locator(".large-course-preview .large-preview-flag").first());
    assert(Math.abs(largeFlag.width - largeFlag.height) <= 1,
        `Lobby flag must be circular: ${JSON.stringify(largeFlag)}`);
    const thumbnailFlag = await flagShape(viewer.page.locator(".course-thumbnail i").first());
    assert(Math.abs(thumbnailFlag.width - thumbnailFlag.height) <= 1,
        `Course thumbnail flag must be circular: ${JSON.stringify(thumbnailFlag)}`);
    assert.equal(await viewer.page.locator(".large-course-preview img").count(), 2, "Selected course preview does not include its start board");
    assert.equal(await viewer.page.getByText("Стартовое поле показано снизу.", {exact: false}).count(), 0, "Redundant selected-course explanation is visible");
    await viewer.page.locator(".course-browser > summary").click();
    assert(!await viewer.page.locator(".course-browser").evaluate((details) => details.open), "Course catalogue cannot be collapsed");
    await viewer.page.locator(".course-browser > summary").click();
    assert(await viewer.page.locator(".course-browser").evaluate((details) => details.open), "Course catalogue cannot be reopened");

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
    const constructorFlag = await flagShape(preview.locator(".preview-flag").first());
    assert(Math.abs(constructorFlag.width - constructorFlag.height) <= 1,
        `Constructor flag must be circular: ${JSON.stringify(constructorFlag)}`);
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
    assert.equal(await viewer.page.locator(".selected-course-preview button").count(), 0, "Spectator received course editing controls");
    if (process.env.LOBBY_SCREENSHOT)
        await host.page.screenshot({path: process.env.LOBBY_SCREENSHOT, fullPage: true});

    const expectedRobotPositions = await host.page.locator(".large-course-preview .course-preview-robot").evaluateAll((markers) =>
        Object.fromEntries(markers.map((marker) => [marker.dataset.userId, {left: marker.style.left, top: marker.style.top}])));

    await host.page.getByRole("button", {name: "Начать игру"}).click();
    await viewer.page.locator(".board-viewport").waitFor();
    assert.equal(await host.page.locator(".game-pause-controls").getByRole("button", {name: "⚙ Настройки"}).count(), 0,
        "settings button is visible outside pause");
    await host.page.locator(".game-pause-controls .pause").click();
    await host.page.locator(".game-pause-controls .resume").waitFor();
    await host.page.locator(".game-pause-controls").getByRole("button", {name: "⚙ Настройки"}).click();
    await host.page.getByRole("dialog", {name: "Настройки игры"}).waitFor();
    await host.page.getByRole("button", {name: "Закрыть настройки"}).click();
    await host.page.getByRole("dialog", {name: "Настройки игры"}).waitFor({state: "detached"});
    const ownLives = host.page.locator(".players-panel .player-row", {has: host.page.locator(".own-player-name")}).locator(".rr-host-lives");
    assert((await ownLives.innerText()).includes("✎"), "host's life count has no visible edit affordance");
    await ownLives.getByRole("button", {name: /Оставшиеся жизни/}).click();
    await ownLives.getByRole("textbox", {name: /Новое число жизней/}).fill("0");
    assert(await ownLives.getByRole("button", {name: "Сохранить жизни"}).isDisabled(),
        "the host could submit zero manual lives");
    await ownLives.getByRole("textbox", {name: /Новое число жизней/}).fill("4");
    await ownLives.getByRole("button", {name: "Сохранить жизни"}).click();
    const hostName = await host.page.locator(".players-panel .own-player-name").innerText();
    await guest.page.locator(".players-panel .player-row", {hasText: hostName}).locator(".player-stat.lives b").getByText("4").waitFor();
    await host.page.locator(".game-pause-controls").getByRole("button", {name: "⚙ Настройки"}).click();
    const livesOption = host.page.locator(".rr-option-row", {has: host.page.getByText("Жизни", {exact: true})});
    await livesOption.getByRole("button", {name: "∞"}).click();
    await host.page.locator(".players-panel .own-player-name").locator("..").locator("..").locator(".player-stat.lives b").getByText("∞").waitFor();
    assert.equal(await host.page.locator(".players-panel .rr-host-lives").count(), 0,
        "manual life editing remained available with unlimited lives");
    await livesOption.getByRole("button", {name: "Число"}).click();
    await host.page.getByRole("button", {name: "Закрыть настройки"}).click();
    await host.page.locator(".game-pause-controls .resume").click();
    const actualRobotPositions = await viewer.page.locator(".board-overlay .robot").evaluateAll((robots) =>
        Object.fromEntries(robots.map((robot) => [robot.dataset.userId, {left: robot.style.left, top: robot.style.top}])));
    assert.deepEqual(actualRobotPositions, expectedRobotPositions, "Game did not use the shuffled positions shown in the lobby preview");
    if (process.env.GAME_SCREENSHOT)
        await host.page.screenshot({path: process.env.GAME_SCREENSHOT, fullPage: false});
    assert.equal(await viewer.page.locator(".program").count(), 0, "Spectator received a programming panel");
    assert.equal(await viewer.page.locator(".players-panel").count(), 1, "Spectator cannot follow players");
    assert.equal(await host.page.locator(".bottom-dock .rr-dock-status-text").innerText(), "ПРОГРАММИРОВАНИЕ · РАУНД 1",
        "new programming round is not announced in the player's dock");
    assert(await host.page.locator(".bottom-dock").evaluate((element) => element.classList.contains("rr-dock-programming")),
        "programming dock does not have its persistent highlighted state");
    assert.equal(await host.page.locator(".programming-timer").count(), 0, "player sees the fixed spectator timer");
    assert.equal(await guest.page.locator(".programming-timer").count(), 0, "player sees the fixed spectator timer");
    assert.equal(await host.page.title(), "Программирование · RoboRally");
    assert.equal(await viewer.page.title(), "RoboRally", "spectator tab title was changed by the player-only cue");
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
    const dockToggleBox = await host.page.locator(".bottom-dock-toggle").boundingBox();
    assert(dockToggleBox.y >= dockBox.y && dockToggleBox.y + dockToggleBox.height <= dockBox.y + dockBox.height,
        "programming indicator protrudes outside its panel");
    assert((await host.page.evaluate(({y, height}) => innerHeight - y - height, dockBox)) <= 12,
        "Programming panel is too far from the bottom edge");
    const reservedSpace = parseFloat(await host.page.locator(".game-screen").evaluate((element) => getComputedStyle(element).paddingBottom));
    assert(reservedSpace >= dockBox.height && reservedSpace <= dockBox.height + 20,
        "Programming panel reserves too much empty page space");
    assert((await host.page.locator(".bottom-dock").evaluate((element) => getComputedStyle(element).backgroundColor)).includes("0.78"), "Programming panel is not translucent");
    await host.page.setViewportSize({width: 390, height: 760});
    const narrowDockLayout = await host.page.locator(".bottom-dock").evaluate((dock) => {
        const rect = (element) => {
            const box = element.getBoundingClientRect();
            return {left: box.left, right: box.right, top: box.top, bottom: box.bottom};
        };
        return {dock: rect(dock), toggle: rect(dock.querySelector(".bottom-dock-toggle")),
            actions: rect(dock.querySelector(".program-actions"))};
    });
    assert(narrowDockLayout.toggle.left >= narrowDockLayout.dock.left && narrowDockLayout.toggle.right <= narrowDockLayout.dock.right
        && narrowDockLayout.toggle.top >= narrowDockLayout.dock.top && narrowDockLayout.toggle.bottom <= narrowDockLayout.dock.bottom,
    "programming indicator escapes the panel on a narrow screen");
    assert(narrowDockLayout.toggle.right <= narrowDockLayout.actions.left || narrowDockLayout.toggle.bottom <= narrowDockLayout.actions.top
        || narrowDockLayout.toggle.top >= narrowDockLayout.actions.bottom, "programming indicator overlaps the action buttons on a narrow screen");
    await host.page.setViewportSize({width: 320, height: 760});
    const compactDockLayout = await host.page.locator(".bottom-dock").evaluate((dock) => {
        const inside = (element) => {
            const box = element.getBoundingClientRect();
            const dockBox = dock.getBoundingClientRect();
            return box.left >= dockBox.left - 1 && box.right <= dockBox.right + 1;
        };
        const toggle = dock.querySelector(".bottom-dock-toggle");
        const heading = dock.querySelector(".program-heading");
        return {toggleInside: inside(toggle), headingInside: inside(heading),
            noOverlap: toggle.getBoundingClientRect().bottom <= heading.getBoundingClientRect().top + 1,
            actionTextFits: [...dock.querySelectorAll(".program-actions button")]
                .every((button) => button.scrollWidth <= button.clientWidth + 1 && button.scrollHeight <= button.clientHeight + 1),
            registersFit: dock.querySelector(".registers").scrollWidth <= dock.querySelector(".registers").clientWidth + 1};
    });
    assert(Object.values(compactDockLayout).every(Boolean),
        `320px programming panel overflows or overlaps: ${JSON.stringify(compactDockLayout)}`);
    assert(await host.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
        "320px game screen has horizontal overflow");
    await host.page.setViewportSize({width: 390, height: 760});
    await host.page.locator(".bottom-dock-toggle").click();
    assert.equal(await host.page.locator(".rr-dock-status-text").innerText(), "ПРОГРАММИРОВАНИЕ · РАУНД 1",
        "collapsed narrow panel loses its phase indicator");
    await host.page.locator(".bottom-dock-toggle").click();
    await host.page.setViewportSize({width: 1440, height: 1000});
    assert.equal(await host.page.locator(".game-side-hud .board-toolbar").count(), 1, "Map controls are not below the information panels");
    assert(await host.page.locator(".board-toolbar > button").last().getAttribute("class").then((value) => value.includes("board-hints-toggle")), "Hint control is not the last map button");
    await host.page.getByRole("button", {name: "Авто", exact: true}).click();
    await guest.page.getByRole("button", {name: "Авто", exact: true}).click();
    await host.page.getByRole("button", {name: "Готов", exact: true}).click();
    await guest.page.locator(".bottom-dock.rr-timer-cue-active").waitFor();
    await viewer.page.locator(".programming-timer").waitFor();
    await host.page.locator(".bottom-dock.rr-dock-timer").waitFor();
    assert.equal(await viewer.page.locator(".timer-clock strong").innerText(), "30", "spectator cannot see the shared countdown");
    assert.equal(await guest.page.locator(".programming-timer").count(), 0, "last player still sees a timer over the board");
    assert(/^ВАШИ \d+ СЕКУНД$/.test(await guest.page.locator(".bottom-dock .rr-dock-status-text").innerText()),
        "last player does not see that the countdown targets them");
    const observerTimerText = await host.page.locator(".bottom-dock .rr-dock-status-text").innerText();
    assert(/^\d+ СЕКУНД · Механик$/.test(observerTimerText),
        `other player does not see who is using the last-player countdown: ${observerTimerText}`);
    assert(/^\d+ сек · RoboRally$/.test(await guest.page.title()), "countdown is not visible in the target player's tab title");
    await guest.page.locator(".bottom-dock-toggle").click();
    assert(await guest.page.locator(".bottom-dock").evaluate((element) => element.classList.contains("collapsed")),
        "programming dock did not collapse");
    assert(/^ВАШИ \d+ СЕКУНД$/.test(await guest.page.locator(".bottom-dock .rr-dock-status-text").innerText()),
        "collapsed dock hides the timer state");
    await guest.page.locator(".bottom-dock-toggle").click();
    await guest.page.waitForTimeout(1700);
    assert(!await guest.page.locator(".bottom-dock").evaluate((element) => element.classList.contains("rr-timer-cue-active")),
        "timer introduction keeps pulsing after its one-shot animation");
    await guest.page.waitForTimeout(1100);
    assert(!await guest.page.locator(".bottom-dock").evaluate((element) => element.classList.contains("rr-timer-cue-active")),
        "timer introduction restarted on a countdown tick");
    await guest.page.getByRole("button", {name: "Готов", exact: true}).click();
    await viewer.page.locator(".programming-timer").waitFor({state: "detached"});
    await viewer.page.locator(".laser-shot-robot").first().waitFor({timeout: 20000});
    assert((await viewer.page.locator(".laser-shot-board").count()) >= 4, "Stationary laser shots are not visualized");
    assert((await viewer.page.locator(".laser-beam-core").count()) >= 5, "Multiple stationary laser beams are not visualized separately");
    assert((await viewer.page.locator(".laser-shot-robot").count()) >= 1, "Robot laser shots are not visualized");
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
    if (process.env.LASER_SCREENSHOT)
        await viewer.page.screenshot({path: process.env.LASER_SCREENSHOT, fullPage: false});
    console.log("RoboRally lobby roles, colors, courses, constructor and spectator flow passed");
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    stopSandbox(server);
});
