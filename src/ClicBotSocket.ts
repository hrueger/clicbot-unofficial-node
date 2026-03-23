import { EventEmitter } from "node:events";
import * as net from "node:net";
import { PacketType } from "./PacketTypes";
import { TCPDataPacket } from "./TCPDataPacket";

export interface ClicBotSocketOptions {
    heartbeatIntervalMs?: number;
    heartbeatFeedLoseTimes?: number;
}

export class ClicBotSocket extends EventEmitter<{
    connect: [void];
    close: [void];
    error: [Error];
    heartbeat: [TCPDataPacket];
    packet: [TCPDataPacket];
    "command:*": [TCPDataPacket];
    heartbeatTimeout: [];
}> {
    private readonly socket: net.Socket;
    private receiveBuffer: Buffer;
    private heartbeatTimer: NodeJS.Timeout | null;
    private missedPulseFeeds: number;
    private readonly heartbeatIntervalMs: number;
    private readonly heartbeatFeedLoseTimes: number;

    constructor(options: ClicBotSocketOptions = {}) {
        super();
        this.socket = new net.Socket();
        this.receiveBuffer = Buffer.alloc(0);
        this.heartbeatTimer = null;
        this.missedPulseFeeds = 0;
        this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 5000;
        this.heartbeatFeedLoseTimes = options.heartbeatFeedLoseTimes ?? 2;
        this.bindSocketEvents();
    }

    connect(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const onError = (err: Error) => {
                this.socket.off("connect", onConnect);
                reject(err);
            };
            const onConnect = () => {
                this.socket.off("error", onError);
                this.startPulseLoop();
                this.sendPulse();
                this.emit("connect");
                resolve();
            };
            this.socket.once("error", onError);
            this.socket.once("connect", onConnect);
            this.socket.connect(port, host);
        });
    }

    disconnect(): void {
        this.stopPulseLoop();
        this.socket.end();
    }

    sendCommand(command: number, body: Buffer = Buffer.alloc(0), index = 0): void {
        this.socket.write(new TCPDataPacket(command, index, body).toBuffer());
    }

    sendPulse(): void {
        this.sendCommand(PacketType.TCP_HEARTBEAT);
    }

    private bindSocketEvents(): void {
        this.socket.on("data", (chunk: Buffer) => {
            this.parseIncomingData(chunk);
        });

        this.socket.on("close", () => {
            this.stopPulseLoop();
            this.emit("close");
        });

        this.socket.on("error", (err) => {
            this.stopPulseLoop();
            this.emit("error", err);
        });
    }

    private feedPulse(): void {
        this.missedPulseFeeds = 0;
    }

    private startPulseLoop(): void {
        this.stopPulseLoop();
        this.heartbeatTimer = setInterval(() => {
            this.missedPulseFeeds += 1;
            if (this.missedPulseFeeds > this.heartbeatFeedLoseTimes) {
                this.emit("heartbeatTimeout");
                this.socket.destroy();
                return;
            }
            this.sendPulse();
        }, this.heartbeatIntervalMs);
    }

    private stopPulseLoop(): void {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    private parseIncomingData(chunk: Buffer): void {
        this.receiveBuffer = Buffer.concat([this.receiveBuffer, chunk]);

        while (this.receiveBuffer.length >= 8) {
            const bodyLength = this.receiveBuffer.readUInt32LE(4);
            const frameLength = 8 + bodyLength;
            if (this.receiveBuffer.length < frameLength) {
                return;
            }

            const frame = this.receiveBuffer.subarray(0, frameLength);
            this.receiveBuffer = this.receiveBuffer.subarray(frameLength);

            const packet = TCPDataPacket.fromBuffer(frame);
            if (!packet) {
                continue;
            }

            this.feedPulse();
            if (packet.command === PacketType.TCP_HEARTBEAT) {
                this.emit("heartbeat", packet);
                continue;
            }

            this.emit("packet", packet);
            this.emit(`command:${packet.command}`, packet);
        }
    }
}
