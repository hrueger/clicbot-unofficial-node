export class CommandData {
    json: Record<string, unknown>;

    constructor(json: Record<string, unknown>) {
        this.json = json;
    }

    toBuffer(): Buffer {
        return Buffer.from(JSON.stringify(this.json), "utf8");
    }

    static fromBuffer(buffer: Buffer): CommandData | null {
        const parsed = JSON.parse(buffer.toString("utf8")) as Record<string, unknown>;
        return new CommandData(parsed);
    }
}
