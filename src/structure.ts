export interface LoopConnection {
    /** slot index (0–3) that identifies which loop-connection entry this is */
    type: number;
    /** module ID of the connected module forming the loop */
    index: number;
    /** port index on the connected module */
    iface: number;
}

export enum ModuleType {
    BRAIN = 0,
    SERVO_JOINT = 1,
    DISTANCE_BAR = 2,
    SERVO_WHEEL = 3,
}

export interface RawModuleInfo {
    /** unique module index (1-255), 0 for root */
    moduleId: number;
    /** depth in the structure tree, root is 0, direct children of root are 1, etc. */
    depth: number;
    /** port index on this module that connects to the parent */
    portIndex: number;
    type: ModuleType;
    /** raw byte at struct offset 4 — purpose not yet determined */
    position: number;
    /** raw byte at struct offset 5 — purpose not yet determined */
    direction: number;
    /** true when module type is 4 (parallel connector) or the parallel flag byte is set */
    parallel: boolean;
    angle: number;
    /** index of the parent module, 0 for root */
    parentId: number;
    /** which port the parent module is connected to (0-3) */
    parentPortIndex: number;
    /** back-edges to non-parent modules (loop/cycle connections in the physical assembly) */
    loopConnections: LoopConnection[];
    /** hex-encoded hardware address derived from the loop-connection byte range */
    address: string;
}

const STRUCT_RECORD_SIZE = 28;
export const ANGLE_SCALE = 45 / 512;

/** Encode degrees to the raw int16 used in servo commands (inverse of ANGLE_SCALE). */
export function encodeAngle(degrees: number): number {
    return Math.round(degrees / ANGLE_SCALE);
}

function byteToInt(value: number): number {
    return value & 0xff;
}

function bytesToShortLE(buffer: Buffer, offset: number): number {
    return buffer.readInt16LE(offset);
}

function bytesToHex(buffer: Buffer): string {
    return Array.from(buffer)
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
}

export function parseStructureData(data: Buffer | null | undefined): RawModuleInfo[] {
    const modelList: RawModuleInfo[] = [];
    const root: RawModuleInfo = {
        moduleId: 0,
        depth: 0,
        portIndex: 0,
        type: 0,
        position: 0,
        direction: 0,
        parallel: false,
        angle: 0,
        parentId: 0,
        parentPortIndex: 0,
        loopConnections: [],
        address: "",
    };
    modelList.push(root);

    if (!data || data.length === 0) {
        return modelList;
    }

    let offset = 0;
    while (offset < data.length) {
        if (offset + STRUCT_RECORD_SIZE > data.length) {
            return modelList;
        }
        const item = data.subarray(offset, offset + STRUCT_RECORD_SIZE);
        offset += STRUCT_RECORD_SIZE;

        const model: RawModuleInfo = {
            moduleId: byteToInt(item[0]),
            depth: byteToInt(item[1]),
            portIndex: byteToInt(item[2]),
            type: byteToInt(item[3]),
            position: byteToInt(item[4]),
            direction: byteToInt(item[5]),
            parallel: byteToInt(item[3]) === 4 || item[6] === 1,
            angle: bytesToShortLE(item, 7) * ANGLE_SCALE,
            parentId: byteToInt(item[9]),
            parentPortIndex: byteToInt(item[10]),
            loopConnections: [],
            address: "",
        };

        const circular0Index = byteToInt(item[11]);
        if (circular0Index !== 255 && circular0Index !== model.parentId) {
            model.loopConnections.push({ type: 0, index: circular0Index, iface: byteToInt(item[12]) });
        }

        const circular1Index = byteToInt(item[13]);
        if (circular1Index !== 255 && circular1Index !== model.parentId) {
            model.loopConnections.push({ type: 1, index: circular1Index, iface: byteToInt(item[14]) });
        }

        const circular2Index = byteToInt(item[15]);
        if (circular2Index !== 255 && circular2Index !== model.parentId) {
            model.loopConnections.push({ type: 2, index: circular2Index, iface: byteToInt(item[16]) });
        }

        const circular3Index = byteToInt(item[17]);
        if (circular3Index !== 255 && circular3Index !== model.parentId) {
            model.loopConnections.push({ type: 3, index: circular3Index, iface: byteToInt(item[18]) });
        }

        const addressBytesLength = Math.floor((byteToInt(item[12]) + 1) / 2);
        const addressBytes = item.subarray(13, 13 + addressBytesLength);
        model.address = bytesToHex(addressBytes);

        modelList.push(model);
    }
    return modelList;
}

export function getAngleRequestModuleIds(structure: RawModuleInfo[]): number[] {
    return structure.filter((model) => model.type === ModuleType.SERVO_JOINT).map((model) => model.moduleId);
}

export function parseAngleData(angles: Buffer | null | undefined): Map<number, number> {
    const result = new Map<number, number>();
    if (!angles || angles.length === 0 || angles.length % 3 !== 0) {
        return result;
    }

    for (let i = 0; i < angles.length / 3; i++) {
        const offset = i * 3;
        const moduleId = byteToInt(angles[offset]);
        const angle = bytesToShortLE(angles, offset + 1) * ANGLE_SCALE;
        result.set(moduleId, angle);
    }
    return result;
}

export function toMermaid(structure: RawModuleInfo[]): string {
    let result = "graph TD\n";
    const connectionCounts: Record<ModuleType, number> = {
        [ModuleType.BRAIN]: 1,
        [ModuleType.SERVO_JOINT]: 4,
        [ModuleType.DISTANCE_BAR]: 2,
        [ModuleType.SERVO_WHEEL]: 1,
    };
    for (const model of structure) {
        const connections = connectionCounts[model.type] || 0;
        result += `    subgraph ${ModuleType[model.type]} ${model.moduleId}\n`;
        result += `        direction LR\n`;
        for (let i = 0; i < connections; i++) {
            result += `        ${model.moduleId}_conn${i}(Port ${i})\n`;
        }
        result += `    end\n`;
        if (model.moduleId !== 0) {
            const parentConnections = connectionCounts[structure[model.parentId].type] || 0;
            const parentConnectionIndex = model.parentPortIndex % parentConnections;
            result += `    ${structure[model.parentId].moduleId}_conn${parentConnectionIndex} --> ${model.moduleId}_conn${model.portIndex}\n`;
        }
    }
    return result;
}
