'use strict';
/* ============================================================
   SERPONIX — Live Multiplayer Server (original code)
   - Serves the game page at  http://HOST:PORT/
   - WebSocket relay on the same port: rooms, join/state/dead
   Run:  node server.js        (PORT env optional, default 8080)
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
const GAME_FILE = path.join(__dirname, 'serponix-game.html');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url.startsWith('/index')) {
    fs.readFile(GAME_FILE, (err, data) => {
      if (err) { res.writeHead(500); res.end('serponix-game.html missing next to server.js'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(data);
    });
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: [...rooms.keys()].map(k => ({ room: k, players: rooms.get(k).size })) }));
  } else {
    res.writeHead(404); res.end('not found');
  }
});

const wss = new WebSocketServer({ server });
const rooms = new Map();   // roomCode -> Map(id -> {ws, name, skin})
let nextId = 1;

function roomOf(code) {
  if (!rooms.has(code)) rooms.set(code, new Map());
  return rooms.get(code);
}
function broadcast(room, exceptId, obj) {
  const msg = JSON.stringify(obj);
  for (const [id, p] of room) {
    if (id !== exceptId && p.ws.readyState === 1) p.ws.send(msg);
  }
}

wss.on('connection', ws => {
  let myId = null, myRoom = null;
  ws.on('message', raw => {
    let m;
    try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'join') {
      myRoom = roomOf(String(m.room || 'global').slice(0, 24));
      myId = nextId++;
      const meta = { id: myId, name: String(m.name || 'Serpent').slice(0, 16), skin: m.skin | 0 };
      // tell the newcomer who is already here
      const players = [...myRoom.values()].map(p => p.meta);
      myRoom.set(myId, { ws, meta });
      ws.send(JSON.stringify({ t: 'welcome', id: myId, players }));
      broadcast(myRoom, myId, { t: 'joined', player: meta });
      console.log(`[+] ${meta.name} joined room "${[...rooms.entries()].find(([, r]) => r === myRoom)[0]}" (${myRoom.size} players)`);
    } else if (myId && myRoom && (m.t === 's' || m.t === 'dead')) {
      m.id = myId;
      broadcast(myRoom, myId, m);
    }
  });
  ws.on('close', () => {
    if (myId && myRoom) {
      broadcast(myRoom, myId, { t: 'left', id: myId });
      myRoom.delete(myId);
      console.log(`[-] player ${myId} left (${myRoom.size} left in room)`);
    }
  });
});

server.listen(PORT, () => {
  console.log('SERPONIX server running on port ' + PORT);
  console.log('Open the game at  http://localhost:' + PORT + '/');
});
