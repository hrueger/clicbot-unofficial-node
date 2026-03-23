export class UDPDataPacket {
    type: number;
    /** total number of pages in a multi-part message */
    total: number;
    /** current page number (1-based) */
    page: number;
    /** packet sequence index within a page */
    index: number;
    body: string;

    constructor(type: number, total: number, page: number, index: number, body: string) {
        this.type = type;
        this.total = total;
        this.page = page;
        this.index = index;
        this.body = body;
    }

    toBuffer(): Buffer {
        const buffer = Buffer.alloc(this.body.length + 10);
        buffer.writeUInt16LE(this.type, 0);
        buffer.writeUInt16LE(this.body.length, 2);
        buffer.writeUInt16LE(this.total, 4);
        buffer.writeUInt16LE(this.page, 6);
        buffer.writeUInt16LE(this.index, 8);
        buffer.write(this.body, 10);
        return buffer;
    }

    static fromBuffer(data: Buffer): UDPDataPacket | null {
        if (data.length < 10) {
            return null;
        }
        const type = data.readUInt16LE(0);
        const bodyLength = data.readUInt16LE(2);
        const total = data.readUInt16LE(4);
        const page = data.readUInt16LE(6);
        const index = data.readUInt16LE(8);
        const body = data.subarray(10, 10 + bodyLength).toString();
        return new UDPDataPacket(type, total, page, index, body);
    }
}
