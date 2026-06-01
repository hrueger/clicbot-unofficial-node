/**
 * Executor control: controlExecutor.
 *
 * Controls a specific executor module (cmd 200).
 * moduleType corresponds to ModuleType (0=brain, 1=servo_joint, 3=servo_wheel).
 * The meaning of the value byte is module-type-specific.
 */
import { BrainState, ClicBot } from "../../src/ClicBot";
import { ModuleType } from "../../src/structure";

const HOST =
    process.env.IP ??
    (() => {
        throw new Error("IP env var required");
    })();
const PORT = Number(process.env.PORT ?? 9632);

async function main(): Promise<void> {
    const bot = new ClicBot();
    bot.on("error", (err) => console.error("Error:", err));

    bot.on("command", (packet) => {
        if (packet.command === 201) {
            console.log("Executor control reply:", packet.body);
        }
    });

    await bot.connect({ host: HOST, port: PORT });
    bot.sendClientInfo();

    const servoIds = await new Promise<number[]>((resolve) => {
        bot.once("clientInfo", () => {
            bot.setBrainState(BrainState.CUSTOM);
            bot.requestStructure();
        });
        bot.once("structure", () => resolve(bot.getServoModuleIds()));
    });

    if (servoIds.length === 0) {
        console.log("No servo joints found");
        bot.disconnect();
        return;
    }

    const [id0] = servoIds;

    console.log(
        "The exact effect depends on firmware. Watch the executor reply bytes printed above to understand the response.",
    );

    // Body: [moduleIndex: u8, moduleType: u8, value: u8]
    console.log(`controlExecutor(${id0}, SERVO_JOINT, 1)`);
    bot.controlExecutor(id0, ModuleType.SERVO_JOINT, 1);

    await new Promise((resolve) => setTimeout(resolve, 2000));
    bot.disconnect();
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
