/**
 * Wiregasm's Emscripten loader contains Node-only branches guarded by runtime
 * environment checks. Browser bundlers still resolve their static requires,
 * so Turbopack aliases those modules here for browser targets.
 */
const unavailableNodeModule = {};

export default unavailableNodeModule;
