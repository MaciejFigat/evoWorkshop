import { createServer } from 'node:http';
import { DEFAULT_TABLE } from '@evo/brawl-shared';
import { WebSocketServer } from 'ws';
import { Lobby, type Connection } from './lobby.ts';

const PORT = Number(process.env['PORT'] ?? 5191);

const lobby = new Lobby(DEFAULT_TABLE);
const http = createServer((_request, response) => {
  response.writeHead(404).end();
});
const wss = new WebSocketServer({ server: http, path: '/ws' });

wss.on('connection', (socket) => {
  const conn: Connection = {
    send: (message) => {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    },
  };
  socket.on('message', (data, isBinary) => {
    if (!isBinary) {
      lobby.receive(conn, data.toString());
    }
  });
  socket.on('close', () => lobby.disconnect(conn));
});

http.listen(PORT, () => {
  console.log(`Alchemy Brawl server on ws://localhost:${PORT}/ws`);
});
