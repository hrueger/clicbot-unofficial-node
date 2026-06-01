/**
 * QR-code connection: display a QR code, wait for the robot to announce itself, connect.
 *
 * Required env vars:
 *   SSID       — WiFi network name
 *   PASSWORD   — WiFi password
 *
 * Optional env vars:
 *   IP         — this machine's IP address visible to the robot (auto-detected if omitted)
 *   PORT       — UDP port to listen on (default 12345)
 *   QR_OUTPUT  — "terminal" (default), "file", or "text"
 *   QR_FILE    — output path when QR_OUTPUT=file (default "qrcode.png")
 */
import { BrainState, ClicBot } from "../../src/ClicBot";
import { buildQrContent, type QrOutput, showQrCode, waitForRobot } from "../../src/discovery";

const SSID =
    process.env.SSID ??
    (() => {
        throw new Error("SSID env var required");
    })();
const PASSWORD =
    process.env.PASSWORD ??
    (() => {
        throw new Error("PASSWORD env var required");
    })();

function buildOutput(): QrOutput {
    const mode = process.env.QR_OUTPUT ?? "terminal";
    if (mode === "file") return { mode: "file", path: process.env.QR_FILE ?? "qrcode.png" };
    if (mode === "text") return { mode: "text" };
    return { mode: "terminal" };
}

async function main(): Promise<void> {
    const udpPort = process.env.PORT ? Number(process.env.PORT) : 12345;

    const content = buildQrContent({ ssid: SSID, password: PASSWORD, localIp: process.env.IP, udpPort });
    await showQrCode(content, buildOutput());
    const device = await waitForRobot(udpPort);

    console.log(`\nRobot at ${device.ip}:${device.port} — connecting...`);

    const bot = new ClicBot();
    bot.on("error", (err) => console.error("Error:", err));
    bot.on("close", () => console.log("Disconnected"));

    await bot.connect({ host: device.ip, port: device.port });
    console.log("Connected");
    bot.sendClientInfo();

    bot.on("clientInfo", (reply) => {
        console.log("Handshake reply:", reply);
        bot.setBrainState(BrainState.CUSTOM);
        bot.requestStructure();
    });

    bot.on("battery", (level) => console.log(`Battery: ${Math.round(level * 100)}%`));

    bot.on("structure", (_, modules) => {
        console.log(`Structure: ${modules.size} modules`);
        bot.requestAngles();
    });

    bot.on("angles", (angles) => {
        for (const [id, angle] of angles) {
            console.log(`  module ${id}: ${angle.toFixed(1)}°`);
        }
    });
}

main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
});
