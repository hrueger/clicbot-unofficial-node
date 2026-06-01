import * as dgram from "node:dgram";
import * as os from "node:os";
import { EventEmitter } from "node:events";
import { PacketType } from "./PacketTypes";
import { UDPDataPacket } from "./UDPDataPacket";

export interface DiscoveredDevice {
    ip: string;
    port: number;
    name: string;
    mode: number;
    /** Whether the robot is in invite/matchmaking mode. */
    invite: number;
}

/** UDP port the robot listens on for discovery broadcasts. */
const DISCOVERY_PORT = 9633;

/**
 * Scans the local network for ClicBot robots via UDP broadcast.
 *
 * Three usage patterns:
 *
 * 1. Continuous scan with callback — call start(), listen to the `device` event,
 *    call stop() whenever done:
 *
 *      const d = new ClicBotDiscovery();
 *      d.on("device", (device) => console.log(device));
 *      d.start();
 *      // later…
 *      d.stop();
 *
 * 2. Collect all devices within a timeout:
 *
 *      const devices = await ClicBotDiscovery.discoverAll(3000);
 *
 * 3. Resolve on the first device found (or reject on timeout):
 *
 *      const device = await ClicBotDiscovery.discoverFirst(5000);
 */
export class ClicBotDiscovery extends EventEmitter<{
    device: [DiscoveredDevice];
    error: [Error];
}> {
    private socket: dgram.Socket | null = null;
    private broadcastInterval: NodeJS.Timeout | null = null;
    private readonly searchIntervalMs: number;

    constructor(searchIntervalMs = 1000) {
        super();
        this.searchIntervalMs = searchIntervalMs;
    }

    start(): void {
        if (this.socket) return;
        this.socket = dgram.createSocket("udp4");
        const searchPacket = new UDPDataPacket(PacketType.UDP_DISCOVER_REQUEST, 1, 1, 0, "").toBuffer();

        this.socket.on("error", (err) => {
            this.emit("error", err);
            this.stop();
        });

        this.socket.on("message", (msg) => {
            if (msg.length < 10) return;
            const packet = UDPDataPacket.fromBuffer(msg);
            if (!packet || packet.type !== PacketType.UDP_DISCOVER_RESPONSE) return;
            try {
                const data = JSON.parse(packet.body) as {
                    IP: string;
                    Port: number;
                    brain_state: number;
                    invite: number;
                    name: string;
                };
                this.emit("device", {
                    ip: data.IP,
                    port: data.Port,
                    name: data.name,
                    mode: data.brain_state,
                    invite: data.invite,
                });
            } catch {
                // ignore malformed response
            }
        });

        this.socket.bind(() => {
            this.socket!.setBroadcast(true);
            this.sendSearch(searchPacket);
            this.broadcastInterval = setInterval(() => this.sendSearch(searchPacket), this.searchIntervalMs);
        });
    }

    stop(): void {
        if (this.broadcastInterval) {
            clearInterval(this.broadcastInterval);
            this.broadcastInterval = null;
        }
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
    }

    private sendSearch(packet: Buffer): void {
        this.socket?.send(packet, 0, packet.length, DISCOVERY_PORT, "255.255.255.255");
    }

    /**
     * Resolve with the first device that responds, or reject if none responds
     * within `timeoutMs`.
     */
    static discoverFirst(timeoutMs = 5000): Promise<DiscoveredDevice> {
        return new Promise((resolve, reject) => {
            const discovery = new ClicBotDiscovery();

            const timeout = setTimeout(() => {
                discovery.stop();
                reject(new Error(`No robot found within ${timeoutMs} ms`));
            }, timeoutMs);

            discovery.once("device", (device) => {
                clearTimeout(timeout);
                discovery.stop();
                resolve(device);
            });

            discovery.on("error", (err) => {
                clearTimeout(timeout);
                reject(err);
            });

            discovery.start();
        });
    }
}

// ── QR-code connection ────────────────────────────────────────────────────────

/** How the QR code should be presented. */
export type QrOutput =
    | { mode: "terminal" }           // print ASCII QR code to stdout (requires qrcode package)
    | { mode: "file"; path: string } // save as PNG (requires qrcode package)
    | { mode: "text" };              // print the raw WiFi config string, no qrcode package needed

export interface QrCodeDiscoveryOptions {
    ssid: string;
    password: string;
    /** This machine's IP on the same network as the robot (auto-detected if omitted). */
    localIp?: string;
    /** UDP port to listen on for the robot's announcement (default 12345). */
    udpPort?: number;
    /** Milliseconds to wait for the robot before rejecting (default 60 000). */
    timeoutMs?: number;
}

/** Build the WiFi config URI that encodes credentials and UDP return address. */
export function buildQrContent(options: Pick<QrCodeDiscoveryOptions, "ssid" | "password" | "localIp" | "udpPort">): string {
    const localIp = options.localIp ?? getLocalIp();
    return `WIFI:T:WPA;P:${options.password};S:${options.ssid};IP:${localIp};Port:${options.udpPort ?? 12345}`;
}

/** Display or save a QR code from a pre-built content string. */
export async function showQrCode(content: string, output: QrOutput = { mode: "terminal" }): Promise<void> {
    if (output.mode === "text") {
        console.log(content);
    } else {
        let qrcode: typeof import("qrcode");
        try {
            qrcode = await import("qrcode");
        } catch {
            throw new Error('npm install qrcode');
        }
        if (output.mode === "terminal") {
            const art = await qrcode.toString(content, { type: "terminal" });
            console.log("Hold this QR code in front of the robot's camera:\n");
            console.log(art);
        } else {
            await qrcode.toFile(output.path, content);
            console.log(`QR code saved to ${output.path}`);
        }
    }
}

/** Listen on *udpPort* for the robot's UDP announcement and return its address. */
export function waitForRobot(udpPort = 12345, timeoutMs = 60_000): Promise<DiscoveredDevice> {
    console.log(`\nListening for robot on port ${udpPort}...`);
    return listenForRobotAnnouncement(udpPort, timeoutMs);
}

/**
 * Convenience: build QR content, show it in the terminal, then wait for the robot.
 * For custom output (file/text) call buildQrContent(), showQrCode(), and waitForRobot() separately.
 */
export async function discoverViaQrCode(options: QrCodeDiscoveryOptions): Promise<DiscoveredDevice> {
    const content = buildQrContent(options);
    await showQrCode(content);
    return waitForRobot(options.udpPort, options.timeoutMs);
}

function getLocalIp(): string {
    for (const ifaces of Object.values(os.networkInterfaces())) {
        for (const iface of ifaces ?? []) {
            if (iface.family === "IPv4" && !iface.internal) return iface.address;
        }
    }
    throw new Error('Could not determine local IP — pass localIp explicitly');
}

function listenForRobotAnnouncement(udpPort: number, timeoutMs: number): Promise<DiscoveredDevice> {
    return new Promise((resolve, reject) => {
        const socket = dgram.createSocket("udp4");

        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error(`No robot connected within ${timeoutMs / 1000} s`));
        }, timeoutMs);

        socket.on("message", (msg, rinfo) => {
            clearTimeout(timeout);
            socket.close();
            try {
                const data = JSON.parse(msg.toString()) as {
                    IP?: string;
                    Port?: number;
                    brain_state?: number;
                    invite?: number;
                    name?: string;
                };
                resolve({
                    ip: data.IP ?? rinfo.address,
                    port: data.Port ?? 9632,
                    name: data.name ?? "",
                    mode: data.brain_state ?? 0,
                    invite: data.invite ?? 0,
                });
            } catch {
                resolve({ ip: rinfo.address, port: 9632, name: "", mode: 0, invite: 0 });
            }
        });

        socket.on("error", (err) => {
            clearTimeout(timeout);
            reject(err);
        });

        socket.bind(udpPort);
    });
}
