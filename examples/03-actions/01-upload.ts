/**
 * Spline resource upload: build a custom keyframe motion, upload it, then execute it.
 * Module IDs for the action are taken from bot.servoJoints.
 */
import { BrainState, ClicBot, ActionDefinition } from "../../src/ClicBot";

const HOST =
    process.env.IP ??
    (() => {
        throw new Error("IP env var required");
    })();
const PORT = Number(process.env.PORT ?? 9632);

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

    const joints = bot.servoJoints;
    if (joints.length === 0) {
        console.log("No servo joints found");
        bot.disconnect();
        return;
    }

    const [j0, j1 = j0] = joints;

    const action: ActionDefinition = {
        actionId: 0,
        steps: [
            {
                executeTime: 1.0,
                delayTime: 0,
                postures: [
                    { moduleId: j0.id, angle: 0 },
                    { moduleId: j1.id, angle: 0 },
                ],
            },
            {
                executeTime: 1.0,
                delayTime: 0.5,
                postures: [
                    { moduleId: j0.id, angle: 45 },
                    { moduleId: j1.id, angle: 45 },
                ],
            },
            {
                executeTime: 0.8,
                delayTime: 0,
                postures: [
                    { moduleId: j0.id, angle: 0 },
                    { moduleId: j1.id, angle: 0 },
                ],
            },
        ],
    };

    console.log(`Uploading 3-step motion to slot 0 (joints ${j0.id} and ${j1.id})...`);
    await bot.uploadSplineResource(action);
    console.log("Upload complete. You can now execute the action with example 03-execute.ts or via the executeAction method.");
    bot.disconnect();
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
