/**
 * Stop and lock via the module object API.
 * Use joint.lock() for per-module locking.
 * fullStop, lockByStructure, and lockByPosture are bot-level (no per-module equivalent).
 */
import { BrainState, ClicBot, FullStopType } from "../../src/ClicBot";

const HOST = process.env.IP ?? (() => { throw new Error("IP env var required"); })();
const PORT = Number(process.env.PORT ?? 9632);

function waitForEnter(): Promise<void> {
    return new Promise((resolve) => {
        process.stdin.once("data", () => resolve());
    });
}

async function main(): Promise<void> {
    const bot = new ClicBot();
    bot.on("error", (err) => console.error("Error:", err));
    bot.on("stopped", () => console.log("Full stop acknowledged"));
    bot.on("locked", () => console.log("Lock acknowledged"));

    await bot.connect({ host: HOST, port: PORT });
    bot.sendClientInfo();

    await new Promise<void>((resolve) => {
        bot.once("clientInfo", () => { bot.setBrainState(BrainState.CUSTOM); bot.requestStructure(); });
        bot.once("structure", () => resolve());
    });

    const joints = bot.servoJoints;
    if (joints.length === 0) {
        console.log("No servo joints found");
        bot.disconnect();
        return;
    }

    console.log("Try physically moving a joint when locked — it should resist. Unlocked joints move freely.");

    // fullStop is bot-level (affects all modules at once)
    console.log("Full stop (all, no lock) — press Enter to continue");
    bot.fullStop(false, FullStopType.ALL);
    await waitForEnter();

    console.log("Full stop + lock all — press Enter to continue");
    bot.fullStop(true, FullStopType.ALL);
    await waitForEnter();

    // lockByStructure is bot-level (uses current raw structure list)
    console.log("Unlock by structure — press Enter to continue");
    bot.lockByStructure(false);
    await waitForEnter();

    // Lock / unlock a single joint via the module API
    const [j0] = joints;
    console.log(`Lock joint ${j0.id} — press Enter to continue`);
    j0.lock(true);
    await waitForEnter();

    console.log(`Unlock joint ${j0.id} — press Enter to continue`);
    j0.lock(false);
    await waitForEnter();

    // Lock / unlock all joints via the module API
    if (joints.length >= 2) {
        console.log(`Lock all joints — press Enter to continue`);
        joints.forEach(j => j.lock(true));
        await waitForEnter();

        console.log("Unlock all joints — press Enter to continue");
        joints.forEach(j => j.lock(false));
        await waitForEnter();
    }

    // lockByPosture is bot-level (semantically distinct from per-module lock)
    console.log("Lock by posture — press Enter to continue");
    bot.lockByPosture(joints.map(j => j.id), true);
    await waitForEnter();
    bot.lockByPosture(joints.map(j => j.id), false);

    bot.disconnect();
    process.exit(0);
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
