/**
 * UDP discovery — three patterns:
 *   1. discoverFirst: resolve on the first robot that responds
 *   2. discoverAll:   collect all robots within a timeout
 *   3. continuous:    stream devices via event callback, stop manually
 */
import { ClicBotDiscovery } from "../../src/discovery";
import { BrainState, ClicBot } from "../../src/ClicBot";

async function main(): Promise<void> {
    console.log("Waiting for first robot (max 5 s)...");
    let target;
    try {
        target = await ClicBotDiscovery.discoverFirst(5000);
        console.log("First found:", target);
    } catch {
        console.log("No robot found within 5 s.");
        process.exit(0);
    }

    if (!target) {
        console.log("\nNo robot to connect to.");
        return;
    }

    console.log(`\nConnecting to ${target.ip}:${target.port}...`);
    const bot = new ClicBot();
    bot.on("error", (err) => console.error("Error:", err));
    bot.on("close", () => console.log("Disconnected"));

    await bot.connect({ host: target.ip, port: target.port });
    console.log("Connected");
    bot.sendClientInfo();

    bot.on("clientInfo", () => {
        bot.setBrainState(BrainState.CUSTOM);
        bot.requestStructure();
    });
    bot.on("structure", (_, modules) => {
        console.log(`Structure: ${modules.size} modules`);
        bot.disconnect();
    });
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
