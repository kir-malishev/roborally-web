"use strict";

const assert = require("assert");
const path = require("path");
const {spawn} = require("child_process");
const {chromium} = require(path.resolve(__dirname, "../../demo-server/node_modules/playwright-core"));

const serverDir = path.resolve(__dirname, "../../demo-server");
const port = process.env.POWER_DOWN_PORT || "3042";
const server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir, env: {...process.env, PORT: port}, stdio: ["ignore", "pipe", "pipe"]
});
let browser;
let serverError = "";
server.stderr.on("data", (chunk) => serverError += String(chunk));

async function renderProgram(page, overrides = {}) {
    await page.evaluate((input) => {
        const cards = Array.from({length: 5}, (_, index) => ({id: `card-${index}`, priority: 100 + index,
            type: "right", label: "Поворот вправо"}));
        const state = {phase: "programming", playerSlots: ["one"], userId: "one", round: 3, ...input.state};
        const privateState = {hand: cards, selected: cards.map(({id}) => id), registerCards: cards,
            lockedRegisters: [], locked: false, damage: 4, poweredDown: false, powerDownIntent: false,
            canPowerDown: true, ...input.privateState};
        window.__powerDownEvents = [];
        const app = {socket: {emit(event, value) { window.__powerDownEvents.push({event, value}); }}};
        ReactDOM.render(React.createElement(Program, {state, privateState, app}), document.getElementById("root"));
    }, overrides);
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
    browser = await chromium.launch({headless: true, executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"});
    const page = await browser.newPage({viewport: {width: 1000, height: 700}});
    await page.goto(`http://127.0.0.1:${port}/roborally?room=power-down-browser&player=one&name=One`);
    await page.locator(".lobby-shell").waitFor();

    await renderProgram(page);
    const token = page.locator(".power-down-token");
    assert(await token.isEnabled(), "damaged robot cannot select Power Down");
    assert(await token.evaluate((element) => element.classList.contains("urgent")), "four-damage warning is missing");
    await token.click();
    assert.deepStrictEqual(await page.evaluate(() => window.__powerDownEvents),
        [{event: "set-power-down-intent", value: {enabled: true}}], "intent event is not explicit");

    await renderProgram(page, {privateState: {powerDownIntent: true}});
    assert(await token.evaluate((element) => element.classList.contains("selected")), "selected token is not marked");
    assert(!await token.evaluate((element) => element.classList.contains("confirmed")), "unconfirmed token looks confirmed");
    assert(await page.locator(".card").first().isEnabled(), "intent unexpectedly blocks program editing");

    await renderProgram(page, {privateState: {powerDownIntent: true, locked: true}});
    assert(await token.isDisabled(), "confirmed token remains editable");
    assert(await token.evaluate((element) => element.classList.contains("confirmed")), "confirmed token has no distinct state");
    assert.equal(await page.locator(".power-down-action > small").innerText(), "Объявлено");

    await renderProgram(page, {privateState: {damage: 0, canPowerDown: false}});
    assert(await token.isDisabled(), "undamaged robot can select Power Down");
    assert(await token.evaluate((element) => element.classList.contains("unavailable")), "unavailable token has no distinct state");
    assert.equal(await page.locator(".power-down-action > small").innerText(), "Нужен урон");

    await page.evaluate(() => {
        window.__powerDownEvents = [];
        const state = {phase: "power-down-choice", powerDownChoice: {answered: 1, total: 2}};
        const privateState = {powerDownChoice: {eligible: true, answered: false, choice: null}};
        const app = {socket: {emit(event, value) { window.__powerDownEvents.push({event, value}); }}};
        ReactDOM.render(React.createElement(PowerDownChoicePanel, {state, privateState, app}), document.getElementById("root"));
    });
    assert.equal(await page.getByText("Ответили: 1 из 2.", {exact: false}).count(), 1, "anonymous choice progress is missing");
    await page.locator(".power-down-choice-actions .power-down-token").click();
    assert.deepStrictEqual(await page.evaluate(() => window.__powerDownEvents),
        [{event: "choose-power-down-continuation", value: {enabled: true}}], "continuation event is not explicit");

    await page.evaluate(() => {
        const state = {phase: "power-down-choice", powerDownChoice: {answered: 1, total: 2}};
        const privateState = {powerDownChoice: {eligible: true, answered: true, choice: true}};
        ReactDOM.render(React.createElement(PowerDownChoicePanel, {state, privateState, app: {socket: {emit() {}}}}),
            document.getElementById("root"));
    });
    const fixedChoice = page.locator(".power-down-choice-actions .power-down-token");
    assert(await fixedChoice.isDisabled(), "fixed continuation choice remains editable");
    assert(await fixedChoice.evaluate((element) => element.classList.contains("confirmed")), "fixed continuation has no confirmation state");
    assert.equal(await page.getByText("Ваш выбор принят", {exact: true}).count(), 1);

    await page.evaluate(() => {
        const lockedCard = {id: "locked", priority: 420, type: "right", label: "Поворот вправо"};
        const state = {phase: "programming", userId: "viewer", playerSlots: ["one"], playerNames: {one: "One"},
            playerStats: {one: {poweredDown: true}}, programs: {one: {poweredDown: true, lockedRegisters: [4],
                cards: [null, null, null, null, lockedCard]}}};
        ReactDOM.render(React.createElement(PublicPrograms, {state}), document.getElementById("root"));
    });
    assert.equal(await page.getByText("Открытые заблокированные регистры", {exact: true}).count(), 1,
        "public locked cards disappear outside register resolution");
    assert.equal(await page.locator(".public-register.random-locked", {hasText: "420"}).count(), 1,
        "public locked card is not visibly identified");

    console.log("Power Down browser states and explicit events passed");
})().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    server.kill();
});
