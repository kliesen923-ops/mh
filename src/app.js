const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const state = require('./game/state');
const { initDatabase } = require('./db');
const authRoutes = require('./routes/auth');
const { registerSocketHandlers } = require('./socket');
const { startPickupLoops, stopPickupLoops } = require('./game/pickups');
const { tickMobs } = require('./game/mobs');
const { tickField } = require('./game/field');
const { MOB_TICK_MS } = require('./config');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

function createServer() {
    const app = express();
    const httpServer = http.createServer(app);
    const io = new Server(httpServer);
    state.io = io;

    app.use(express.json());
    app.use(express.static(PUBLIC_DIR));
    app.get('/', (req, res) => {
        res.sendFile(path.join(PUBLIC_DIR, 'mh.html'));
    });
    app.use('/api/auth', authRoutes);

    registerSocketHandlers(io);
    return { app, httpServer, io };
}

function start(port = process.env.PORT || 3000) {
    const server = createServer();
    initDatabase().catch((error) => {
        console.error('Database init failed:', error);
    });
    const pickupIntervals = startPickupLoops();
    const mobInterval = setInterval(() => {
        tickField();
        tickMobs();
    }, MOB_TICK_MS);
    server.httpServer.on('close', () => {
        stopPickupLoops(pickupIntervals);
        clearInterval(mobInterval);
    });
    server.httpServer.listen(port, () => { console.log(`서버 실행 중: ${server.httpServer.address().port}`); });
    return server;
}

module.exports = { createServer, start };
