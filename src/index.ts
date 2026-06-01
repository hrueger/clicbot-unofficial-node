export {
    ClicBot,
    BrainState,
    FullStopType,
    type ClientInfoPayload,
    type ClicBotConnectOptions,
    type ServoTarget,
    type RotateTarget,
    type ActionPosture,
    type ActionStep,
    type ActionDefinition,
} from "./ClicBot";

export {
    ClicBotDiscovery,
    buildQrContent,
    showQrCode,
    waitForRobot,
    discoverViaQrCode,
    type DiscoveredDevice,
    type QrOutput,
    type QrCodeDiscoveryOptions,
} from "./discovery";

export {
    ClicBotModule,
    BrainModule,
    ServoJointModule,
    DistanceBarModule,
    ServoWheelModule,
    type ModuleController,
} from "./modules";

export {
    ModuleType,
    toMermaid,
    ANGLE_SCALE,
    encodeAngle,
    parseStructureData,
    parseAngleData,
    getAngleRequestModuleIds,
    type RawModuleInfo,
    type LoopConnection,
} from "./structure";

export { PacketType } from "./PacketTypes";
export { TCPDataPacket } from "./TCPDataPacket";
