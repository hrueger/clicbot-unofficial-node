import { EventEmitter } from "node:events";
import { ClicBotSocket } from "./ClicBotSocket";
import { CommandData } from "./CommandData";
import {
    type ClicBotModule,
    createModuleFromRaw,
    type ModuleController,
    ServoJointModule,
    ServoWheelModule,
} from "./modules";
import { PacketType } from "./PacketTypes";
import {
    encodeAngle,
    getAngleRequestModuleIds,
    ModuleType,
    parseAngleData,
    parseStructureData,
    type RawModuleInfo,
} from "./structure";
import type { TCPDataPacket } from "./TCPDataPacket";

export enum BrainState {
    /** Interactive / custom control mode. Send after connecting to enable motion control. */
    CUSTOM = 1,
    /** Official program mode — robot runs a built-in program. */
    OFFICIAL = 2,
    /** Received-only inactive/disconnect state — purpose not fully determined. */
    INACTIVE_3 = 3,
    /** Accept an incoming pairing request. */
    PAIRING_ACCEPT = 4,
    /**
     * Enter pairing search mode (competitive two-robot feature in official programs).
     * Also reported as the robot's mode in UDP discovery responses when the robot is
     * performing a firmware update (connection is blocked in that case).
     */
    PAIRING_OR_UPDATING = 5,
    /** Received-only inactive/disconnect state — purpose not fully determined. */
    INACTIVE_6 = 6,
    /** Clear the robot's internal cache. */
    CLEAR_CACHE = 50,
}

export interface ClientInfoPayload {
    /** JSON message sub-type discriminator — always 1 for the client-info handshake */
    jsonType: number;
    userId: number;
    userName: string;
    platform: string;
    appVersion: string;
    brainAppVersion: string;
    /** 1 if re-establishing a previous session, 0 for a fresh connection */
    reconnect: number;
    /** purpose unknown; always 0 in practice */
    invite: number;
    [key: string]: unknown;
}

export interface ClicBotConnectOptions {
    host: string;
    port: number;
}

/** Target position for a single servo joint. */
export interface ServoTarget {
    moduleId: number;
    /** Absolute angle in degrees. */
    angle: number;
    /** Movement speed 0–100 (default 50). */
    speed?: number;
}

/** Target for continuous rotation of a single module. */
export interface RotateTarget {
    moduleId: number;
    forward: boolean;
    /** Rotation speed 0–100. */
    speed: number;
}

export enum FullStopType {
    /** Stop all servos and wheels. */
    ALL = 0,
    /** Stop wheel modules only. */
    WHEELS = 1,
    /** Stop servo/cell modules only. */
    SERVOS = 2,
}

/** A single servo target within an action step. */
export interface ActionPosture {
    moduleId: number;
    /** Target angle in degrees. */
    angle: number;
}

/** One step in an ActionDefinition timeline. */
export interface ActionStep {
    /** Time in seconds to move to this posture. */
    executeTime: number;
    /** Time in seconds to hold at this posture before proceeding. */
    delayTime: number;
    postures: ActionPosture[];
}

/** A custom motion sequence for uploadSplineResource. */
export interface ActionDefinition {
    /** Action slot index on the robot (0-based). */
    actionId: number;
    steps: ActionStep[];
}

export class ClicBot extends EventEmitter<{
    connect: [];
    close: [];
    error: [Error];
    heartbeat: [];
    clientInfo: [Record<string, unknown> | null];
    battery: [number];
    structure: [RawModuleInfo[], Map<number, ClicBotModule>];
    angles: [Map<number, number>, Map<number, ServoJointModule>];
    /** Brain state change acknowledgement (cmd 104). */
    brainControl: [Buffer];
    /** Structure observe toggle acknowledgement (cmd 101). */
    structureWatchdog: [Buffer];
    /** Acknowledgement for rotateStart (cmd 1005). */
    rotateStarted: [Buffer];
    /** Acknowledgement for rotateStop (cmd 1007). */
    rotateStopped: [Buffer];
    /** Acknowledgement for servoToPosture (cmd 1009). */
    servoMoved: [Buffer];
    /** Acknowledgement for pushRotate (cmd 1011). */
    pushRotateChanged: [Buffer];
    /** Acknowledgement for executeAction (cmd 1015). */
    actionExecuted: [Buffer];
    /** Acknowledgement for lock commands (cmd 1017). */
    locked: [Buffer];
    /** Acknowledgement for spline upload (cmd 1019). */
    splineUploaded: [Buffer];
    /** Acknowledgement for fullStop (cmd 1021). */
    stopped: [Buffer];
    /** Acknowledgement for uploadSplineResource (cmd 1023). */
    splineResourceUploaded: [Buffer];
    /** Acknowledgement for executeProgram (cmd 1029). */
    programExecuted: [Buffer];
    /** Every received packet, regardless of command. */
    command: [TCPDataPacket];
}> {
    readonly socket: ClicBotSocket;
    /** float 0–1, null if unknown */
    batteryLevel: number | null;
    clientInfoReply: Record<string, unknown> | null;
    rawStructure: RawModuleInfo[];
    modules: Map<number, ClicBotModule>;
    private readonly moduleController: ModuleController = {
        sendModuleAngle: (moduleId, angle, speed) => this.servosToPosture([{ moduleId, angle, speed }]),
        sendModuleRotateStart: (moduleId, forward, speed) => this.rotateStart([{ moduleId, forward, speed }]),
        sendRotateStop: () => this.rotateStop(),
        sendModuleLock: (moduleId, locked) => this.lockModule(moduleId, locked),
    };

    constructor(socket = new ClicBotSocket()) {
        super();
        this.socket = socket;
        this.batteryLevel = null;
        this.clientInfoReply = null;
        this.rawStructure = [];
        this.modules = new Map();
        this.bindSocketEvents();
    }

    // ── Connection ─────────────────────────────────────────────────────────────

    async connect(options: ClicBotConnectOptions): Promise<void> {
        await this.socket.connect(options.host, options.port);
    }

    disconnect(): void {
        this.socket.disconnect();
    }

    sendClientInfo(overrides: Partial<ClientInfoPayload> = {}): void {
        const payload: ClientInfoPayload = {
            jsonType: 1,
            userId: 0,
            userName: "tourist",
            platform: "Node",
            appVersion: "1.0.0",
            brainAppVersion: "1.0",
            reconnect: 0,
            invite: 0,
            ...overrides,
        };
        const body = new CommandData(payload).toBuffer();
        this.socket.sendCommand(PacketType.TCP_CLIENT_INFO, body);
    }

    // ── Brain control ──────────────────────────────────────────────────────────

    setBrainState(state: BrainState): void {
        const body = Buffer.alloc(2);
        body.writeInt16LE(state, 0);
        this.socket.sendCommand(PacketType.TCP_BRAIN_CONTROL_REQUEST, body);
    }

    // ── Structure ──────────────────────────────────────────────────────────────

    requestStructure(): void {
        this.socket.sendCommand(PacketType.TCP_STRUCTURE_REQUEST);
    }

    setStructureWatchdog(enabled: boolean): void {
        this.socket.sendCommand(PacketType.TCP_STRUCTURE_OBSERVE_REQUEST, Buffer.from([enabled ? 1 : 0]));
    }

    requestAngles(moduleIds?: number[]): void {
        const ids = moduleIds && moduleIds.length > 0 ? moduleIds : this.getServoModuleIds();
        const valid = ids.filter((id) => Number.isInteger(id) && id > 0 && id <= 255);
        if (valid.length === 0) return;
        this.socket.sendCommand(PacketType.TCP_ANGLES_REQUEST, Buffer.from(valid));
    }

    getServoModuleIds(): number[] {
        return getAngleRequestModuleIds(this.rawStructure);
    }

    /** Root module (the brain), available after the first structure response. */
    get root(): ClicBotModule | undefined {
        return this.modules.get(0);
    }

    /** All servo joint modules in the current structure. */
    get servoJoints(): ServoJointModule[] {
        return [...this.modules.values()].filter((m): m is ServoJointModule => m instanceof ServoJointModule);
    }

    /** All servo wheel modules in the current structure. */
    get servoWheels(): ServoWheelModule[] {
        return [...this.modules.values()].filter((m): m is ServoWheelModule => m instanceof ServoWheelModule);
    }

    /** Get a module by its ID. */
    getModule(id: number): ClicBotModule | undefined {
        return this.modules.get(id);
    }

    // ── Servo positioning ──────────────────────────────────────────────────────

    /**
     * Move servos to absolute angle targets (cmd 1008).
     * Body: 6 bytes per module — [moduleId, 0x02, speed, 0x00, angleLow, angleHigh].
     */
    servosToPosture(targets: ServoTarget[]): void {
        const valid = targets.filter((t) => t.moduleId > 0 && t.moduleId <= 255);
        if (valid.length === 0) return;
        const body = Buffer.alloc(valid.length * 6);
        for (let i = 0; i < valid.length; i++) {
            const off = i * 6;
            const target = valid[i];
            const speed = Math.max(0, Math.min(100, target.speed ?? 50));
            body.writeUInt8(target.moduleId, off);
            body.writeUInt8(0x02, off + 1); // motion mode byte, hardcoded in app
            body.writeUInt8(speed, off + 2);
            body.writeUInt8(0x00, off + 3);
            body.writeInt16LE(encodeAngle(target.angle), off + 4);
        }
        this.socket.sendCommand(PacketType.TCP_SERVO_MOVE_REQUEST, body);
    }

    // ── Continuous rotation ────────────────────────────────────────────────────

    /**
     * Start continuous rotation on one or more modules (cmd 1004).
     * Body: 3 bytes per module — [moduleId, forward (0/1), speed (0–100)].
     */
    rotateStart(targets: RotateTarget[]): void {
        const valid = targets.filter((t) => t.moduleId > 0 && t.moduleId <= 255);
        if (valid.length === 0) return;
        const body = Buffer.alloc(valid.length * 3);
        for (let i = 0; i < valid.length; i++) {
            const off = i * 3;
            body.writeUInt8(valid[i].moduleId, off);
            body.writeUInt8(valid[i].forward ? 1 : 0, off + 1);
            body.writeUInt8(Math.max(0, Math.min(100, valid[i].speed)), off + 2);
        }
        this.socket.sendCommand(PacketType.TCP_ROTATE_START_REQUEST, body);
    }

    /** Stop continuous rotation (cmd 1006, empty body). */
    rotateStop(): void {
        this.socket.sendCommand(PacketType.TCP_ROTATE_STOP_REQUEST);
    }

    /**
     * Toggle push-rotate mode (cmd 1010).
     * In push-rotate mode the robot tracks physical force applied to servo joints.
     */
    pushRotate(enabled: boolean): void {
        this.socket.sendCommand(PacketType.TCP_PUSH_ROTATE_REQUEST, Buffer.from([enabled ? 1 : 0]));
    }

    // ── Stop ───────────────────────────────────────────────────────────────────

    /**
     * Emergency stop (cmd 1020).
     * @param lock  If true, hold modules in place after stopping (default false).
     * @param type  Which modules to stop (default ALL).
     */
    fullStop(lock = false, type = FullStopType.ALL): void {
        this.socket.sendCommand(PacketType.TCP_FULL_STOP_REQUEST, Buffer.from([lock ? 1 : 0, type]));
    }

    // ── Module lock ────────────────────────────────────────────────────────────

    /**
     * Lock or unlock a single module (cmd 1016).
     * Body: [moduleId, locked (0/1)].
     */
    lockModule(moduleId: number, locked: boolean): void {
        if (moduleId <= 0 || moduleId > 255) return;
        this.socket.sendCommand(PacketType.TCP_MODULE_LOCK_REQUEST, Buffer.from([moduleId, locked ? 1 : 0]));
    }

    /**
     * Lock or unlock multiple modules (cmd 1016).
     * Body: N × [moduleId, locked (0/1)].
     */
    lockModules(moduleIds: number[], locked: boolean): void {
        const valid = moduleIds.filter((id) => id > 0 && id <= 255);
        if (valid.length === 0) return;
        const body = Buffer.alloc(valid.length * 2);
        for (let i = 0; i < valid.length; i++) {
            body.writeUInt8(valid[i], i * 2);
            body.writeUInt8(locked ? 1 : 0, i * 2 + 1);
        }
        this.socket.sendCommand(PacketType.TCP_MODULE_LOCK_REQUEST, body);
    }

    /**
     * Lock or unlock all servo and wheel modules in the current structure (cmd 1016).
     * Distance-bar modules and the root are excluded (matches app behaviour).
     */
    lockByStructure(locked: boolean): void {
        const ids = this.rawStructure
            .filter((m) => m.moduleId > 0 && m.moduleId <= 255 && m.type !== ModuleType.DISTANCE_BAR)
            .map((m) => m.moduleId);
        this.lockModules(ids, locked);
    }

    /**
     * Lock or unlock an explicit list of modules via the posture-lock command (cmd 1016).
     * Semantically identical to lockModules on the wire; the distinction is in SDK intent.
     */
    lockByPosture(moduleIds: number[], locked: boolean): void {
        this.lockModules(moduleIds, locked);
    }

    // ── Action execution ───────────────────────────────────────────────────────

    /**
     * Execute a previously uploaded action by its slot ID (cmd 1014).
     * Body: [actionId: u8].
     */
    executeAction(actionId: number): void {
        this.socket.sendCommand(PacketType.TCP_ACTION_EXECUTE_REQUEST, Buffer.from([actionId & 0xff]));
    }

    /**
     * Execute a stored program by its ID (cmd 1028).
     * Body: actionId as int16 LE.
     */
    executeProgram(actionId: number): void {
        const body = Buffer.alloc(2);
        body.writeInt16LE(actionId, 0);
        this.socket.sendCommand(PacketType.TCP_PROGRAM_EXECUTE_REQUEST, body);
    }

    // ── Spline resource upload ─────────────────────────────────────────────────

    /**
     * Upload a custom keyframe-based motion sequence to the robot (cmd 1022).
     *
     * Per-module binary block:
     *   [moduleId: u8][actionId: u8][dataLen: u32 LE][frames: (time: f32 LE, angle: f32 LE) × N]
     *
     * Note: this is the simplified spline format (no derivative data). The full
     * cubic-spline variant (cmd 1018) requires NativeCubicSpline (JNI) from the Android
     * app and cannot be computed in Node.
     */
    uploadSplineResource(action: ActionDefinition): Promise<Buffer> {
        const body = buildSplineResourceBody(action);
        if (!body || body.length === 0) return Promise.reject(new Error("Action produced empty payload"));
        return new Promise((resolve) => {
            this.once("splineResourceUploaded", resolve);
            this.socket.sendCommand(PacketType.TCP_SPLINE_RESOURCE_REQUEST, body);
        });
    }

    // ── Executor control ──────────────────────────────────────────────────────

    /**
     * Control a specific executor module (cmd 200).
     * Body: [moduleIndex: u8, moduleType: u8, value: u8].
     */
    controlExecutor(moduleIndex: number, moduleType: number, value: number): void {
        this.socket.sendCommand(
            PacketType.TCP_EXECUTOR_CONTROL_REQUEST,
            Buffer.from([moduleIndex & 0xff, moduleType & 0xff, value & 0xff]),
        );
    }

    // ── Internal ───────────────────────────────────────────────────────────────

    private bindSocketEvents(): void {
        this.socket.on("connect", () => this.emit("connect"));
        this.socket.on("close", () => this.emit("close"));
        this.socket.on("error", (err) => this.emit("error", err));
        this.socket.on("heartbeat", () => this.emit("heartbeat"));
        this.socket.on("packet", (packet: TCPDataPacket) => this.handlePacket(packet));
    }

    private handlePacket(packet: TCPDataPacket): void {
        const { command, body } = packet;

        switch (command) {
            case PacketType.TCP_CLIENT_INFO: {
                try {
                    const cmd = CommandData.fromBuffer(body);
                    this.clientInfoReply = cmd?.json ?? null;
                } catch {
                    this.clientInfoReply = null;
                }
                this.emit("clientInfo", this.clientInfoReply);
                break;
            }
            case PacketType.TCP_BATTERY_LEVEL: {
                if (body.length >= 1) {
                    this.batteryLevel = body[0] / 100;
                    this.emit("battery", this.batteryLevel);
                }
                break;
            }
            case PacketType.TCP_STRUCTURE_RESPONSE: {
                this.rawStructure = parseStructureData(body);
                this.rebuildModules();
                this.emit("structure", this.rawStructure, this.modules);
                break;
            }
            case PacketType.TCP_ANGLES_RESPONSE: {
                const angles = parseAngleData(body);
                const filteredModules = new Map<number, ServoJointModule>();
                for (const [moduleId, angle] of angles.entries()) {
                    const moduleRef = this.modules.get(moduleId);
                    if (moduleRef && moduleRef.type === ModuleType.SERVO_JOINT) {
                        (moduleRef as ServoJointModule).updateAngle(angle);
                        filteredModules.set(moduleId, moduleRef as ServoJointModule);
                    }
                }
                this.emit("angles", angles, filteredModules);
                break;
            }
            case PacketType.TCP_BRAIN_CONTROL_RESPONSE:
                this.emit("brainControl", body);
                break;
            case PacketType.TCP_STRUCTURE_OBSERVE_RESPONSE:
                this.emit("structureWatchdog", body);
                break;
            case PacketType.TCP_ROTATE_START_RESPONSE:
                this.emit("rotateStarted", body);
                break;
            case PacketType.TCP_ROTATE_STOP_RESPONSE:
                this.emit("rotateStopped", body);
                break;
            case PacketType.TCP_SERVO_MOVE_RESPONSE:
                this.emit("servoMoved", body);
                break;
            case PacketType.TCP_PUSH_ROTATE_RESPONSE:
                this.emit("pushRotateChanged", body);
                break;
            case PacketType.TCP_ACTION_EXECUTE_RESPONSE:
                this.emit("actionExecuted", body);
                break;
            case PacketType.TCP_MODULE_LOCK_RESPONSE:
                this.emit("locked", body);
                break;
            case PacketType.TCP_SPLINE_UPLOAD_RESPONSE:
                this.emit("splineUploaded", body);
                break;
            case PacketType.TCP_FULL_STOP_RESPONSE:
                this.emit("stopped", body);
                break;
            case PacketType.TCP_SPLINE_RESOURCE_RESPONSE:
                this.emit("splineResourceUploaded", body);
                break;
            case PacketType.TCP_PROGRAM_EXECUTE_RESPONSE:
                this.emit("programExecuted", body);
                break;
        }

        this.emit("command", packet);
    }

    private rebuildModules(): void {
        const next = new Map<number, ClicBotModule>();
        for (const raw of this.rawStructure) {
            const existing = this.modules.get(raw.moduleId);
            if (existing) {
                existing.updateFromRaw(raw);
                next.set(raw.moduleId, existing);
            } else {
                next.set(raw.moduleId, createModuleFromRaw(raw));
            }
        }
        // Bind controller and build parent/children tree
        for (const module of next.values()) {
            module.bindController(this.moduleController);
            module.children = [];
            module.parent = undefined;
        }
        for (const module of next.values()) {
            if (module.id !== 0) {
                const parent = next.get(module.parentId);
                if (parent) {
                    module.parent = parent;
                    parent.children.push(module);
                }
            }
        }
        this.modules = next;
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSplineResourceBody(action: ActionDefinition): Buffer {
    const { actionId, steps } = action;
    if (!steps || steps.length === 0) return Buffer.alloc(0);

    const moduleFrames = new Map<number, Array<{ time: number; angle: number }>>();
    let t = 0;

    for (const step of steps) {
        for (const posture of step.postures) {
            if (!moduleFrames.has(posture.moduleId)) {
                moduleFrames.set(posture.moduleId, []);
            }
            // biome-ignore lint/style/noNonNullAssertion: set in the line above
            const frames = moduleFrames.get(posture.moduleId)!;
            frames.push({ time: t + step.executeTime, angle: posture.angle });
            if (step.delayTime > 1e-4) {
                frames.push({ time: t + step.executeTime + step.delayTime, angle: posture.angle });
            }
        }
        t += step.executeTime + step.delayTime;
    }

    const parts: Buffer[] = [];
    for (const [moduleId, frames] of moduleFrames.entries()) {
        if (frames.length < 2) continue; // robot requires at least two keyframes
        const block = Buffer.alloc(6 + frames.length * 8);
        block.writeUInt8(moduleId, 0);
        block.writeUInt8(actionId & 0xff, 1);
        block.writeUInt32LE(frames.length * 8, 2);
        for (let i = 0; i < frames.length; i++) {
            block.writeFloatLE(frames[i].time, 6 + i * 8);
            block.writeFloatLE(frames[i].angle, 6 + i * 8 + 4);
        }
        parts.push(block);
    }

    return Buffer.concat(parts);
}
