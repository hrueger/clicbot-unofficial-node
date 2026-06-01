export {
    type ActionDefinition,
    type ActionPosture,
    type ActionStep,
    BrainState,
    ClicBot,
    type ClicBotConnectOptions,
    type ClientInfoPayload,
    FullStopType,
    type RotateTarget,
    type ServoTarget,
} from "./ClicBot";

export {
    buildQrContent,
    ClicBotDiscovery,
    type DiscoveredDevice,
    discoverViaQrCode,
    type QrCodeDiscoveryOptions,
    type QrOutput,
    showQrCode,
    waitForRobot,
} from "./discovery";

export {
    BrainModule,
    ClicBotModule,
    DistanceBarModule,
    type ModuleController,
    ServoJointModule,
    ServoWheelModule,
} from "./modules";
export { PacketType } from "./PacketTypes";
export {
    ANGLE_SCALE,
    encodeAngle,
    getAngleRequestModuleIds,
    type LoopConnection,
    ModuleType,
    parseAngleData,
    parseStructureData,
    type RawModuleInfo,
    toMermaid,
} from "./structure";
export { TCPDataPacket } from "./TCPDataPacket";
