/**
 * Action execution: executeAction, executeActionPro.
 * Run 01-upload first to populate slot 0, then use this to trigger it.
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
    bot.on("actionExecuted", () => console.log("Action execute acknowledged"));

    await bot.connect({ host: HOST, port: PORT });
    bot.sendClientInfo();

    await new Promise<void>((resolve) => {
        bot.once("clientInfo", () => {
            bot.setBrainState(BrainState.CUSTOM);
            bot.requestStructure();
        });
        bot.once("structure", () => resolve());
    });

    console.log("Note: run 01-upload first to populate slot 0.");

    // Execute a stored action in slot 0 (cmd 1014, 1-byte slot ID).
    console.log("executeAction(0) — watch the robot perform the uploaded motion.");
    bot.executeAction(0);
    await sleep(3000);

    // Pro/extended variant (cmd 1032, 1-byte index).
    // Used for actions stored in the extended action table.
    // console.log("executeActionPro(0)");
    // bot.executeActionPro(0);
    // await sleep(3000);

    bot.disconnect();
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
