// Shared mutable game state. `io` is assigned once the Socket.IO server is created.
module.exports = {
    io: null,
    players: {},
    attackSequences: {},
    attackHitTargets: new Map(),
};
