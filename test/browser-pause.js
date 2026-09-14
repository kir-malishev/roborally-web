"use strict";

const assert = require("assert");
const path = require("path");
const {spawn} = require("child_process");
const {chromium} = require(path.resolve(__dirname, "../../demo-server/node_modules/playwright-core"));

const serverDir = path.resolve(__dirname, "../../demo-server");
const port = process.env.PAUSE_BROWSER_PORT || "3045";
const server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir, env: {...process.env, PORT: port}, stdio: ["ignore", "pipe", "pipe"]
});
let browser;
let serverError = "";
server.stderr.on("data", (chunk) => serverError += String(chunk));

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
    const host = await browser.newPage({viewport: {width: 1200, height: 900}});
    const guest = await browser.newPage({viewport: {width: 1200, height: 900}});
    await host.goto(`http://127.0.0.1:${port}/roborally?room=pause-browser&player=pause-host&name=Host`);
    await guest.goto(`http://127.0.0.1:${port}/roborally?room=pause-browser&player=pause-guest&name=Guest`);
    await host.locator(".lobby-shell").waitFor();
    await guest.locator(".lobby-shell").waitFor();
    await host.getByRole("button", {name: "Присоединиться к игре"}).click();
    await guest.getByRole("button", {name: "Присоединиться к игре"}).click();
    await host.locator(".lobby-member", {hasText: "Guest"}).waitFor();
    await host.getByRole("button", {name: "Начать игру"}).click();
    await host.locator(".program").waitFor();
    await guest.locator(".program").waitFor();

    assert.equal(await host.locator(".host-controls").count(), 1, "host pause panel is missing");
    assert.equal(await guest.locator(".host-controls").count(), 0, "guest can see host controls");
    await host.locator(".host-controls button").click();
    await host.locator(".pause-banner").waitFor();
    await guest.locator(".pause-banner").waitFor();
    assert(await host.locator(".host-controls button", {hasText: "Продолжить"}).count());
    assert(await guest.locator(".card").first().isDisabled(), "program cards remain interactive during pause");

    await host.locator(".host-controls button").click();
    await host.locator(".pause-banner").waitFor({state: "detached"});
    await guest.locator(".pause-banner").waitFor({state: "detached"});
    assert(!await guest.locator(".card").first().isDisabled(), "program cards did not unlock after resume");
    console.log("Host pause browser controls passed.");
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}).finally(async () => {
    if (browser) await browser.close();
    server.kill();
});
