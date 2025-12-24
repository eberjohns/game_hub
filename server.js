const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// DATA STORE (In-Memory for the event)
let rooms = {}; 
// Structure: 
// { 
//   "12345": { 
//      gameUrl: "https://...", 
//      status: "LOBBY" | "PLAYING" | "ENDED", 
//      isLocked: false,
//      players: { "socketID": { name: "Ali", score: null } }
//   } 
// }

io.on('connection', (socket) => {
    console.log('New connection:', socket.id);

    // --- ADMIN EVENTS ---
    
    socket.on('admin_create_room', (gameUrl) => {
        const pin = Math.floor(1000 + Math.random() * 9000).toString(); // 4 Digit PIN
        rooms[pin] = {
            gameUrl: gameUrl,
            status: "LOBBY",
            isLocked: false,
            adminSocket: socket.id,
            players: {}
        };
        socket.join(pin);
        socket.emit('room_created', pin);
        console.log(`Room ${pin} created for game: ${gameUrl}`);
    });

    socket.on('admin_lock_room', (pin) => {
        if (rooms[pin]) {
            rooms[pin].isLocked = true;
            io.to(pin).emit('room_locked_status', true); // Notify lobby
        }
    });

    socket.on('admin_start_game', (pin) => {
        if (rooms[pin]) {
            rooms[pin].status = "PLAYING";
            // Send the Game URL to everyone in the room
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

    // --- PLAYER EVENTS ---

    socket.on('player_join', ({ pin, username }) => {
        const room = rooms[pin];
        
        if (!room) {
            socket.emit('error_msg', "Invalid PIN");
            return;
        }
        if (room.isLocked) {
            socket.emit('error_msg', "Room is locked by Admin.");
            return;
        }
        if (room.status !== "LOBBY") {
            socket.emit('error_msg', "Game already started.");
            return;
        }
        
        // Check duplicate name
        const nameExists = Object.values(room.players).some(p => p.name === username);
        if (nameExists) {
            socket.emit('error_msg', "Username taken.");
            return;
        }

        // Success
        socket.join(pin);
        room.players[socket.id] = { name: username, score: null };
        
        // Tell player they joined
        socket.emit('join_success', { pin, username });
        
        // Update Admin Lobby list
        io.to(room.adminSocket).emit('update_player_list', Object.values(room.players));
    });

    socket.on('submit_score', ({ pin, score }) => {
        const room = rooms[pin];
        // Security checks
        if (!room || room.status !== "PLAYING") return;
        if (!room.players[socket.id]) return;

        // ONLY accept score if they haven't submitted yet (Prevent retry/spam)
        if (room.players[socket.id].score === null) {
            room.players[socket.id].score = score;
            
            // Confirm to user
            socket.emit('score_received', score);
            
            // Live update to Admin
            const leaderboard = getLeaderboard(pin);
            io.to(room.adminSocket).emit('live_leaderboard', leaderboard);
        }
    });

    socket.on('disconnect', () => {
        // Optional: Remove player if they leave before start? 
        // For stability, we usually keep them in memory even if disconnected temporarily
    });
});

function getLeaderboard(pin) {
    if (!rooms[pin]) return [];
    const list = Object.values(rooms[pin].players);
    // Filter only those who have scores and sort desc
    return list
        .filter(p => p.score !== null)
        .sort((a, b) => b.score - a.score); 
}

server.listen(3000, () => {
    console.log('Hub Server running on http://localhost:3000');
});