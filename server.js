const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Allow connections from anywhere (tunnel/localhost)
});

app.use(express.static('public'));

// --- DATA STORE ---
let rooms = {}; 

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // ==============================
    // 🛡️ ADMIN EVENTS
    // ==============================

    socket.on('admin_create_room', (gameUrl) => {
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        rooms[pin] = {
            gameUrl: gameUrl,
            status: "LOBBY", // LOBBY, PLAYING, ENDED
            isLocked: false,
            adminSocket: socket.id,
            players: {} // Format: { "socketID": { name: "Ali", score: null } }
        };
        socket.join(pin);
        socket.emit('room_created', pin);
        console.log(`Creating Room ${pin}`);
    });

    // FIX: Allow Admin to restore session after refresh
    socket.on('admin_rejoin', (pin) => {
        if (rooms[pin]) {
            console.log(`Admin reclaiming room ${pin}`);
            rooms[pin].adminSocket = socket.id;
            socket.join(pin);
            
            // Send back state so Admin UI updates
            socket.emit('admin_restore_success', {
                pin: pin,
                status: rooms[pin].status,
                gameUrl: rooms[pin].gameUrl,
                players: getPlayerList(pin)
            });
        } else {
            socket.emit('error_msg', "Session expired. Create new room.");
        }
    });

    socket.on('admin_lock_room', (pin) => {
        if (rooms[pin]) {
            rooms[pin].isLocked = true;
            io.to(pin).emit('room_locked_status', true);
        }
    });

    socket.on('admin_start_game', (pin) => {
        if (rooms[pin]) {
            rooms[pin].status = "PLAYING";
            console.log(`Room ${pin} Started!`);
            io.to(pin).emit('game_start', rooms[pin].gameUrl);
        }
    });

    socket.on('admin_end_game', (pin) => {
        if (rooms[pin]) {
            rooms[pin].status = "ENDED";
            const leaderboard = getLeaderboard(pin);
            io.to(pin).emit('game_ended', leaderboard);
        }
    });

    // ==============================
    // 🎮 PLAYER EVENTS
    // ==============================

    socket.on('player_join', ({ pin, username }) => {
        const room = rooms[pin];
        if (!room) return socket.emit('error_msg', "Invalid PIN");

        // Check if username already exists in this room (Reconnection logic)
        let existingSocketId = Object.keys(room.players).find(
            id => room.players[id].name === username
        );

        if (room.isLocked && !existingSocketId) {
            return socket.emit('error_msg', "Room is locked.");
        }

        // Join the Socket.io Room
        socket.join(pin);

        // If it's a new player, add them. If returning, update socket ID.
        if (existingSocketId) {
            // Move data to new socket ID
            room.players[socket.id] = room.players[existingSocketId];
            delete room.players[existingSocketId];
        } else {
            room.players[socket.id] = { name: username, score: null };
        }

        // Notify Player
        socket.emit('join_success', { pin, username });

        // Notify Admin
        io.to(room.adminSocket).emit('update_player_list', getPlayerList(pin));

        // FIX: If game is ALREADY PLAYING, send them straight to game!
        // This solves the "Sleeping Phone" issue.
        if (room.status === "PLAYING") {
            socket.emit('game_start', room.gameUrl);
        }
    });

    socket.on('submit_score', ({ pin, score }) => {
        const room = rooms[pin];
        if (!room || !room.players[socket.id]) return;

        // Only record first score (or overwrite if you prefer)
        if (room.players[socket.id].score === null) {
            console.log(`Score received: ${score} from ${room.players[socket.id].name}`);
            room.players[socket.id].score = score;
            
            // Confirm to player
            socket.emit('score_received', score);
            
            // Live Update Admin
            io.to(room.adminSocket).emit('live_leaderboard', getLeaderboard(pin));
        }
    });
});

// Helper: Get simple list for Lobby
function getPlayerList(pin) {
    if (!rooms[pin]) return [];
    return Object.values(rooms[pin].players).map(p => ({ name: p.name, hasScore: p.score !== null }));
}

// Helper: Get sorted leaderboard
function getLeaderboard(pin) {
    if (!rooms[pin]) return [];
    return Object.values(rooms[pin].players)
        .filter(p => p.score !== null)
        .sort((a, b) => b.score - a.score);
}

server.listen(3000, () => {
    console.log('✅ Server running on port 3000');
});