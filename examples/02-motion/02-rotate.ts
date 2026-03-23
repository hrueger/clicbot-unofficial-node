/**
 * Continuous rotation via the module object API.
 * Call rotateStart/rotateStop directly on joint objects.
 * pushRotate is bot-level (no per-module variant).
 */
import { BrainState, ClicBot } from "../../src/ClicBot";

const HOST = process.env.IP ?? (() => { throw new Error("IP env var required"); })();
const PORT = Number(process.env.PORT ?? 9632);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
    const bot = new ClicBot();
    bot.on("error", (err) => console.error("Error:", err));
    bot.on("rotateStarted", () => console.log("Rotation started"));
    bot.on("rotateStopped", () => console.log("Rotation stopped"));
    bot.on("pushRotateChanged", () => console.log("Push-rotate changed"));

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

    console.log("Watch the joints spin. The sequence is: forward 3 s → reverse 3 s → stop → push-rotate 5 s.");

    console.log("Starting forward rotation");
    joints.forEach(j => j.rotateStart(true, 30));
    await sleep(3000);

    console.log("Reversing");
    joints.forEach(j => j.rotateStart(false, 30));
    await sleep(3000);

    // rotateStop is global (no per-module stop in the protocol)
    console.log("Stopping rotation");
    bot.rotateStop();
    await sleep(500);

    console.log("Enabling push-rotate for 5 s — try physically turning a joint by hand.");
    bot.pushRotate(true);
    await sleep(5000);
    bot.pushRotate(false);
    console.log("Push-rotate disabled");

    bot.disconnect();
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
