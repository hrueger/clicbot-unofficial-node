/**
 * Stored program execution: executeProgram.
 *
 * Programs are created via the Blockly editor in the official app and stored on
 * the robot. Execute them here by slot ID.
 * Use the official app to create and upload programs first.
 */
import { BrainState, ClicBot } from "../../src/ClicBot";

const HOST =
    process.env.IP ??
    (() => {
        throw new Error("IP env var required");
    })();
const PORT = Number(process.env.PORT ?? 9632);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
    const bot = new ClicBot();
    bot.on("error", (err) => console.error("Error:", err));
    bot.on("programExecuted", () => console.log("Program execute acknowledged"));

    await bot.connect({ host: HOST, port: PORT });
    bot.sendClientInfo();

    await new Promise<void>((resolve) => {
        bot.once("clientInfo", () => {
            bot.setBrainState(BrainState.CUSTOM);
            bot.requestStructure();
        });
        bot.once("structure", () => resolve());
    });

    console.log("Note: programs must be created and uploaded via the official ClicBot app first.");
    console.log("If the robot does nothing, slot 0 may be empty.");

    console.log("executeProgram(0)");
    bot.executeProgram(0);
    await sleep(3000);

    bot.disconnect();
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
