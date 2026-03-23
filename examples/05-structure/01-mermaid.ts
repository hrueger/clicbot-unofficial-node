/**
 * Save a Mermaid diagram of the robot's physical module structure to a file.
 *
 * Usage:
 *   IP=192.168.x.x pnpm example:05-structure:01-mermaid
 *   IP=192.168.x.x OUT=my-robot.md pnpm example:05-structure:01-mermaid
 */
import * as fs from "node:fs";
import { BrainState, ClicBot } from "../../src/ClicBot";
import { ClicBotDiscovery } from "../../src/discovery";
import { toMermaid } from "../../src/structure";

const OUT = process.env.OUT ?? "structure.md";

async function getDevice(): Promise<{ ip: string; port: number }> {
    const ip = process.env.IP;
    if (ip) return { ip, port: Number(process.env.PORT ?? 9632) };
    console.log("No IP set — scanning network...");
    const device = await ClicBotDiscovery.discoverFirst(5000);
    console.log(`Found ${device.name} at ${device.ip}:${device.port}`);
    return device;
}

async function main(): Promise<void> {
    const { ip, port } = await getDevice();

    const bot = new ClicBot();
    await bot.connect({ host: ip, port });
    bot.sendClientInfo();

    const structure = await new Promise<typeof bot.rawStructure>((resolve) => {
        bot.once("clientInfo", () => {
            bot.setBrainState(BrainState.CUSTOM);
            bot.requestStructure();
        });
        bot.once("structure", (raw) => resolve(raw));
    });

    bot.disconnect();

    const diagram = toMermaid(structure);
    fs.writeFileSync(OUT, "```mermaid\n" + diagram + "\n```\n");

    console.log(`Saved to ${OUT}`);
    console.log(`View it at https://mermaid.live — paste the diagram content (without the fences).`);
    console.log(`\n${structure.length} modules.`);
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
