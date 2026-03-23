/**
 * Basic connection: handshake, structure, watchdog, angles, battery.
 */
import { BrainState, ClicBot } from "../../src/ClicBot";
import { toMermaid } from "../../src/structure";
import * as fs from "fs/promises";

const HOST =
    process.env.IP ??
    (() => {
        throw new Error("IP env var required");
    })();
const PORT = Number(process.env.PORT ?? 9632);

const bot = new ClicBot();

bot.on("connect", () => {
    console.log("Connected");
    bot.sendClientInfo();
});

bot.on("clientInfo", (reply) => {
    console.log("Handshake reply:", reply);
    bot.setBrainState(BrainState.CUSTOM);
    bot.setStructureWatchdog(true);
    bot.requestStructure();
});

bot.on("battery", (level) => {
    console.log(`Battery: ${Math.round(level * 100)}%`);
});

bot.on("structure", (structure, modules) => {
    console.log(`Structure: ${modules.size} modules`);
    fs.writeFile("structure.mmd", toMermaid(structure));
    console.log("Mermaid diagram saved to structure.mmd — render it at https://mermaid.live/");
    console.log("Polling joint angles once. Physically move a joint to see it change");
    bot.requestAngles();
});

bot.on("angles", (angles) => {
    console.log("Current joint angles:");
    for (const [id, angle] of angles) {
        console.log(`  module ${id}: ${angle.toFixed(1)}°`);
    }
});

bot.on("error", (err) => console.error("Error:", err));
bot.on("close", () => console.log("Disconnected"));

bot.connect({ host: HOST, port: PORT }).catch((err) => {
    console.error("Failed to connect:", err);
});
