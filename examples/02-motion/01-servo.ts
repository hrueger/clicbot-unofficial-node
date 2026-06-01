/**
 * Servo positioning via the module object API.
 * Access joints directly on bot.servoJoints and call moveToAngle on them.
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
    bot.on("servoMoved", () => console.log("Servo move acknowledged"));

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

    console.log(
        `Found ${joints.length} servo joint(s):`,
        joints.map((j) => `id=${j.id} depth=${j.depth}`),
    );
    console.log("Watch the robot joints move through 0° → 45° → -45° → 0°.");

    // Call moveToAngle directly on each joint object
    console.log("→ 0°");
    for (const j of joints) j.moveToAngle(0, 60);
    await sleep(2000);

    console.log("→ 45°");
    for (const j of joints) j.moveToAngle(45, 40);
    await sleep(2000);

    console.log("→ -45°");
    for (const j of joints) j.moveToAngle(-45, 40);
    await sleep(2000);

    console.log("→ 0°");
    for (const j of joints) j.moveToAngle(0, 60);
    await sleep(2000);

    // Tree traversal: print the physical module tree from the root
    console.log("\nModule tree:");
    function printTree(module: typeof bot.root, indent = ""): void {
        if (!module) return;
        console.log(`${indent}[${module.constructor.name}] id=${module.id}`);
        for (const child of module.children) printTree(child, `${indent}  `);
    }
    printTree(bot.root);

    bot.disconnect();
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
