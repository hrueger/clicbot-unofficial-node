export const PacketType = {
    // UDP discovery (pre-TCP)
    UDP_DISCOVER_REQUEST: 666,
    UDP_DISCOVER_RESPONSE: 667,

    // Connection handshake
    TCP_CLIENT_INFO: 9,
    TCP_DEVICE_INFO: 10,

    // File transfer
    TCP_APP_FILE_INFO: 13,
    TCP_BRAIN_FILE_INFO: 14,

    // Structure observe
    TCP_STRUCTURE_OBSERVE_REQUEST: 100,
    TCP_STRUCTURE_OBSERVE_RESPONSE: 101,

    // Brain control
    TCP_BRAIN_CONTROL_REQUEST: 103,
    TCP_BRAIN_CONTROL_RESPONSE: 104,

    // Executor control
    TCP_EXECUTOR_CONTROL_REQUEST: 200,
    TCP_EXECUTOR_CONTROL_RESPONSE: 201,

    // Heartbeat
    TCP_HEARTBEAT: 995,

    // Module tree structure
    TCP_STRUCTURE_REQUEST: 1000,
    TCP_STRUCTURE_RESPONSE: 1001,

    // Joint angles
    TCP_ANGLES_REQUEST: 1002,
    TCP_ANGLES_RESPONSE: 1003,

    // Continuous rotation
    TCP_ROTATE_START_REQUEST: 1004,
    TCP_ROTATE_START_RESPONSE: 1005,
    TCP_ROTATE_STOP_REQUEST: 1006,
    TCP_ROTATE_STOP_RESPONSE: 1007,

    // Absolute servo positioning (6 bytes per module)
    TCP_SERVO_MOVE_REQUEST: 1008,
    TCP_SERVO_MOVE_RESPONSE: 1009,

    // Push-rotate mode toggle
    TCP_PUSH_ROTATE_REQUEST: 1010,
    TCP_PUSH_ROTATE_RESPONSE: 1011,

    // Stored action execution by ID
    TCP_ACTION_EXECUTE_REQUEST: 1014,
    TCP_ACTION_EXECUTE_RESPONSE: 1015,

    // Module lock / unlock
    TCP_MODULE_LOCK_REQUEST: 1016,
    TCP_MODULE_LOCK_RESPONSE: 1017,

    // Spline motion upload — requires NativeCubicSpline derivatives and unsure how to calculate them
    TCP_SPLINE_UPLOAD_REQUEST: 1018,
    TCP_SPLINE_UPLOAD_RESPONSE: 1019,

    // Emergency / full stop
    TCP_FULL_STOP_REQUEST: 1020,
    TCP_FULL_STOP_RESPONSE: 1021,

    // Spline resource upload — keyframes only
    TCP_SPLINE_RESOURCE_REQUEST: 1022,
    TCP_SPLINE_RESOURCE_RESPONSE: 1023,

    // Stored program execution
    TCP_PROGRAM_EXECUTE_REQUEST: 1028,
    TCP_PROGRAM_EXECUTE_RESPONSE: 1029,

    // Battery level pushed by robot
    TCP_BATTERY_LEVEL: 1031,
} as const;
