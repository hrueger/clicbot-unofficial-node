import { ModuleType, type RawModuleInfo } from "./structure";

/**
 * Minimal interface that module objects use to dispatch commands.
 * Implemented by ClicBot and injected via bindController() during rebuildModules().
 * Defined here (not in ClicBot.ts) to avoid a circular import.
 */
export interface ModuleController {
    sendModuleAngle(moduleId: number, angle: number, speed: number): void;
    sendModuleRotateStart(moduleId: number, forward: boolean, speed: number): void;
    sendRotateStop(): void;
    sendModuleLock(moduleId: number, locked: boolean): void;
}

export class ClicBotModule {
    readonly id: number;
    readonly type: ModuleType;
    depth: number;
    portIndex: number;
    parentId: number;
    parentPortIndex: number;
    position: number;
    direction: number;
    parallel: boolean;
    address: string;

    /** Direct children of this module in the physical tree. Populated after each structure update. */
    children: ClicBotModule[] = [];
    /** Parent module in the physical tree. Undefined for the root (brain). */
    parent: ClicBotModule | undefined;

    private _controller: ModuleController | null = null;

    constructor(raw: RawModuleInfo) {
        this.id = raw.moduleId;
        this.type = raw.type;
        this.depth = raw.depth;
        this.portIndex = raw.portIndex;
        this.parentId = raw.parentId;
        this.parentPortIndex = raw.parentPortIndex;
        this.position = raw.position;
        this.direction = raw.direction;
        this.parallel = raw.parallel;
        this.address = raw.address;
    }

    /** Called by ClicBot after each structure update. */
    bindController(controller: ModuleController): void {
        this._controller = controller;
    }

    updateFromRaw(raw: RawModuleInfo): void {
        this.depth = raw.depth;
        this.portIndex = raw.portIndex;
        this.parentId = raw.parentId;
        this.parentPortIndex = raw.parentPortIndex;
        this.position = raw.position;
        this.direction = raw.direction;
        this.parallel = raw.parallel;
        this.address = raw.address;
    }

    /** Lock or unlock this module. */
    lock(locked: boolean): void {
        this.cmd.sendModuleLock(this.id, locked);
    }

    protected get cmd(): ModuleController {
        if (!this._controller)
            throw new Error(`Module ${this.id} is not bound to a bot — call requestStructure() first`);
        return this._controller;
    }
}

export class BrainModule extends ClicBotModule {}

export class ServoJointModule extends ClicBotModule {
    angle: number;

    constructor(raw: RawModuleInfo) {
        super(raw);
        this.angle = raw.angle;
    }

    updateAngle(angle: number): void {
        this.angle = angle;
    }

    updateFromRaw(raw: RawModuleInfo): void {
        super.updateFromRaw(raw);
        this.angle = raw.angle;
    }

    /** Move this joint to an absolute angle. */
    moveToAngle(angle: number, speed = 50): void {
        this.cmd.sendModuleAngle(this.id, angle, speed);
    }

    /** Start continuous rotation. */
    rotateStart(forward: boolean, speed: number): void {
        this.cmd.sendModuleRotateStart(this.id, forward, speed);
    }

    /** Stop this joint's rotation (sends rotateStart with speed 0). */
    rotateStop(): void {
        this.cmd.sendModuleRotateStart(this.id, true, 0);
    }
}

export class DistanceBarModule extends ClicBotModule {}

export class ServoWheelModule extends ClicBotModule {
    /** Start continuous rotation. */
    rotateStart(forward: boolean, speed: number): void {
        this.cmd.sendModuleRotateStart(this.id, forward, speed);
    }

    /** Stop this wheel's rotation (sends rotateStart with speed 0). */
    rotateStop(): void {
        this.cmd.sendModuleRotateStart(this.id, true, 0);
    }
}

export function createModuleFromRaw(raw: RawModuleInfo): ClicBotModule {
    switch (raw.type) {
        case ModuleType.BRAIN:
            return new BrainModule(raw);
        case ModuleType.SERVO_JOINT:
            return new ServoJointModule(raw);
        case ModuleType.DISTANCE_BAR:
            return new DistanceBarModule(raw);
        case ModuleType.SERVO_WHEEL:
            return new ServoWheelModule(raw);
        default:
            return new ClicBotModule(raw);
    }
}
