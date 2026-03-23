export class TCPDataPacket {
    command: number;
    /** chunk sequence number used to reassemble large payloads split across multiple frames */
    index: number;
    body: Buffer;

    constructor(command: number, index = 0, body: Buffer) {
        this.command = command;
        this.index = index;
        this.body = body;
    }

    toBuffer(): Buffer {
        const payload = this.body;
        const packet = Buffer.alloc(8 + payload.length);
        packet.writeUInt16LE(this.command, 0);
        packet.writeUInt16LE(this.index, 2);
        packet.writeUInt32LE(payload.length, 4);
        payload.copy(packet, 8);
        return packet;
    }

    static fromBuffer(data: Buffer): TCPDataPacket | null {
        if (data.length < 8) {
            return null;
        }

        const command = data.readUInt16LE(0);
        const index = data.readUInt16LE(2);
        const bodyLength = data.readUInt32LE(4);
        const fullLength = 8 + bodyLength;
        if (data.length < fullLength) {
            return null;
        }

        const body = data.subarray(8, fullLength);
        return new TCPDataPacket(command, index, body);
    }
}
