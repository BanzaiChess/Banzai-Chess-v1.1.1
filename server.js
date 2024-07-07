const express = require("express");
const app = express();

const path = require("path");
const http = require("http");

const server = http.createServer(app);
const { Server } = require("socket.io");

const roomApi = require("./roomApi.js");
const config = require("./config.json");

const { createNewGame, getGameData } = require("./room/RoomService.js"); // Importa le funzioni necessarie

const GameManager = require("./game/GameManager.js");
const gameManager = new GameManager(config.games || 128);

app.use(express.static(path.join(__dirname + "/view")));

// monta la roomApi nel server
app.use("/", roomApi);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/view/index.html");
});

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/view/index.html");
});

app.get("/init", (req, res) => {
  res.json({ games: gameManager.games.length });
});

app.get("/room-status", (req, res) => {
  res.json(gameManager.getGamesStatus());
});

const io = new Server(server, {
  connectionStateRecovery: {
    // the backup duration of the sessions and the packets
    maxDisconnectionDuration: 2 * 60 * 1000,
    // whether to skip middlewares upon successful recovery
    skipMiddlewares: true,
  }
});

const games = {}; // Memorizza i dati dei giochi

io.on("connection", (socket) => {

  //console.log(`New connection: ${socket.id}`);

  socket.on("watch", ({ gameId, spectatorKey }) => {
    //console.log(`Spectator with key ${spectatorKey} attempting to join room: ${gameId}`);
    socket.join(gameId);
    console.log(`Spectator ${spectatorKey} has joined room ${gameId}`);
    socket.emit("spectator", {
      gameId,
      isSpectator: true,
      specatatorSocket: socket.id,
    });
  });

  //console.log("New Connection");
  socket.on("join", ({ gameId, playerKey }) => {
    //console.log(`Player with key ${playerKey} attempting to join room: ${gameId}`);

    try {
      const game = getGameData(gameId, playerKey);
      const players = game.players;
      var color = game.colors;
      const timeSettings = game.timeSettings;
      const position = game.position
      const playerIndex = players.indexOf(playerKey);
      playerColor = color[playerIndex];
      const AI = game.isAI;
      const Depth = game.aiLevel;
      //console.log(`Player assigned color: ${playerColor}`);

      if (!game || !game.players) {
        throw new Error(`Invalid game data for gameId: ${gameId}`);
      }
      if (playerIndex === -1) {
        throw new Error(`Player key ${playerKey} not found in game ${gameId}`);
      }

      // Salva l'ID del gioco nei dati del socket
      socket.data.gameId = gameId;

      // Unisci alla stanza
      socket.join(gameId);
      //console.log(`socket ${playerKey} has joined room ${gameId}`);

      // Controlla il numero di socket nella stanza
      const socketsInRoom = io.sockets.adapter.rooms.get(gameId);
      const numClients = socketsInRoom ? socketsInRoom.size : 0;
      //console.log(`Number of clients in room ${gameId}: ${numClients}`);
      //const JointClient = io.sockets.adapter.rooms.get(gameId).size;

      //console.log(socket.rooms);
      //console.log(JointClient);

      // Inizializza il gioco se non esiste ancora nell'oggetto 'games'
      if (!games[gameId]) {
        games[gameId] = { white: null, black: null };
      }
      
      if (playerColor === 'black') { //se siamo il nero ruota la scacchiera
        socket.emit("rotate-board", {
          playerId: playerKey,
          players: playerIndex,
          color: playerColor,
          gameId,
        });
      }   
      
      if (playerIndex === -1) {
        throw new Error(`Player key ${playerKey} not found in game ${gameId}`);
      }

      // Gestisci Giocatori e IA
      if (AI == true) { //Partita contro computer
        if (numClients <= 1) {
          // Assegna il socket ID al giocatore corretto
          const playerColor = game.colors[playerIndex];
          if (playerColor === 'white') {
            games[gameId].white = socket.id;
          } else if (playerColor === 'black') {
            games[gameId].black = socket.id;
          }    
          //console.log(`Game ${gameId} state:`, games[gameId]);
          //console.log("Partita contro AI")
          // Inizializza il gioco con l'IA
          socket.emit("player", {
            playerId: playerKey,
            playerColor: playerColor,
            timeSettings: game.timeSettings,
            position: game.position,
            gameId,
            playerSocket: socket.id,
            isAI: true,
            aiLevel: Depth,
          });
          // Inizia la partita
          io.in(gameId).emit("play", {gameId, WhitePlayerSocket: games[gameId].white, BlackPlayerSocket: games[gameId].black});
          io.in(gameId).emit("AIstart", playerColor);

        } else {
          socket.emit("spectator", {
            gameId,
            isSpectator: true,
            specatatorSocket: socket.id,
          });
        }    
      } else { //Partita tra persone

        if (numClients <= 2) {
          // Assegna il socket ID al giocatore corretto
          const playerColor = game.colors[playerIndex];
          if (playerColor === 'white') {
            games[gameId].white = socket.id;
          } else if (playerColor === 'black') {
            games[gameId].black = socket.id;
          }
          //console.log(`Game ${gameId} state:`, games[gameId]);        
          socket.emit("player", {
            playerId: playerKey,
            players: playerIndex,
            color: playerColor,
            timeSettings: timeSettings,
            position: position,
            gameId,
            playerSocket: socket.id,
          });

        } else {
          // Gestisci come spettatore
          //games[gameId].spectators.push(socket.id);
          socket.emit("spectator", {
            gameId,
            isSpectator: true,
            specatatorSocket: socket.id,
          });
        }
        //Controlla se entrambi i giocatori sono nella stanza
        const sockets = io.sockets.adapter.rooms.get(gameId);
        if (sockets && sockets.size === 2) {
          // Controlla se il giocatore è già connesso
          const game = games[gameId];
          if (game && game.whiteSocketId && game.blackSocketId) {
             // Non emettere "play" se i giocatori sono già connessi
            return;
          }
            io.in(gameId).emit("play", {gameId, WhitePlayerSocket: games[gameId].white, BlackPlayerSocket: games[gameId].black});
            console.log("Both players have joined the room");       
        }
      }
    } catch (error) {
      console.log(`Error joining room: ${error.message}`);
      //io.in(gameId).emit("error", error.message);
      if (playerKey===undefined) {
        socket.emit("spectator", {
          gameId,
          isSpectator: true,
          specatatorSocket: socket.id,
        });
      }
      socket.emit("error", error.message);
    }
    
  });
  
  // recieved when a player makes a move
  socket.on("move", (msg) => {
    const AI = msg.AI;
    currentRoom = msg.room;
    currentFEN = msg.board;

    // Gestione mosse IA e umane
    if (AI === true) {
      //console.log("mossa ricevuta: ", msg);
      //io.in(currentRoom).emit("move", msg);
      io.in(currentRoom).emit("AItomove", msg);
      io.in(currentRoom).emit("NewTurn", msg);
      io.in(currentRoom).emit("NewFen", currentFEN);
      io.in(currentRoom).emit("Update-Status", msg);
    } else {
      //console.log("mossa ricevuta: ", msg);
      //io.in(currentRoom).sockets.broadcast.emit("move", msg);
      socket.broadcast.emit("move", msg);
      socket.broadcast.emit("newmove", msg);
 
      io.in(currentRoom).emit("NewTurn", msg);
      io.in(currentRoom).emit("NewFen", currentFEN);
      io.in(currentRoom).emit("Update-Status", msg);
    
    }
  });

  // recieved when the AI makes a move
  socket.on("AImove", (msg) => {
    
    currentRoom = msg.room;
    currentFEN = msg.board;
    
    //console.log("mossa ricevuta: ", msg);
    //io.in(currentRoom).emit("move", msg);
    io.in(currentRoom).emit("NewTurn", msg);
    io.in(currentRoom).emit("NewFen", currentFEN);
    io.in(currentRoom).emit("Update-Status", msg);
    
  });

  // recieved when the game is over
  socket.on("game-is-over", (msg) => {

    const { gameId } = msg;
    io.in(gameId).emit("game-over", msg);
    console.log("Game Over event received for room:", msg);

  });

   // recieved when the game is over
   socket.on("time-is-over", (data) => {

    const { player, gameId } = data;
    io.in(gameId).emit("time-over", { player, gameId });
    console.log("Time Over event received for room:", data);

  });

// gestione pulsanti partita in corso
  socket.on("resign", (data) => {
    const { gameId, playerKey, playerColor} = data;
    console.log("Resigning data:", data);

    //const isWhite = playerKey;
    //const isBlack = playerKey;

    io.in(gameId).emit("resigned", { playerColor });
    io.in(gameId).emit("game-over", { gameId });
    
  });

  socket.on("draw-offer", (data) => {
    const { gameId, sender } = data;
    const receiver = (games[gameId].white === sender) ? games[gameId].black : games[gameId].white;
    console.log("Sender Socket:", sender);
    console.log("Receiver Socket:", receiver);
    io.to(receiver).emit("draw-offered", { playerKey: data.playerKey });
  });

  socket.on("draw-response", (data) => {
    const { gameId, accept } = data;
    io.in(gameId).emit("draw-response-result", { accept });
    // Se la patta è accettata, termina la partita
    if (accept) {
        // Logica per gestire la fine della partita 
        io.in(gameId).emit("game-over", { gameId });
        console.log("La partita è finita in patta.");
    } else {
        console.log("La patta è stata rifiutata, il gioco continua.");
    }
  });

  socket.on("undo-move", (data) => {
    const { gameId, playerKey, playerColor, sender, board, AI } = data;

    if(AI===true) {
      io.in(gameId).emit("NewTurn", data);
      io.in(gameId).emit("NewFen", board);
      io.in(gameId).emit("Update-Status", data);

    } else {
      const receiver = (games[gameId].white === sender) ? games[gameId].black : games[gameId].white;
      console.log("Sender Socket:", sender);
      console.log("Receiver Socket:", receiver);
      //io.in(gameId).broadcast("undo-request", { playerKey });
      io.to(receiver).emit("undo-request", { playerKey: data.playerKey });
    }
 
  });

  socket.on("move-takeback-response", (data) => {
    const { gameId, accept } = data;
    // Invia la risposta di ritiro mossa a entrambi i giocatori
    io.to(gameId).emit("move-takeback-response-result", { accept });
    // Se il ritiro è accettato, esegui logica per ritirare l'ultima mossa
    if (accept) {
        io.to(gameId).emit("NewTurn");
        console.log("La richiesta di ritiro mossa è stata accettata.");
    } else {
        console.log("La richiesta di ritiro mossa è stata rifiutata, il gioco continua.");
    }  
  });

  socket.on("restart", (data) => {
    const { gameId, playerKey, board, AI } = data;
    console.log("Player color:", playerColor);
    

    if(AI===true) {

      if (playerColor==="black") { 
        io.in(gameId).emit("AIstart", playerColor);
        //io.in(gameId).emit("play", gameId);
      } else { 
        io.in(gameId).emit("NewTurn", data);
        io.in(gameId).emit("NewFen", board);
        io.in(gameId).emit("Update-Status", data);
        //io.in(gameId).emit("play", gameId);
      }
    } else {
      io.in(gameId).broadcast.emit("restart", { playerKey });
      //socket.broadcast.emit("undo-request", { playerKey });
    }
 
  });

  socket.on("get-room-status", () => {
    console.log("Get room status request received");
    

    socket.emit("send-room-status", gameManager.getGamesStatus());
    //socket.broadcast.emit("send-room-status", gameManager.getGamesStatus());
  });

  socket.on("reconnect", ({ gameId, playerId }) => {
    const game = games[gameId];
    if (!game) return;

    // Trova il giocatore nel gioco e aggiorna il suo socket ID
    if (game.whitePlayerId === playerId) {
        game.whiteSocketId = socket.id;
    } else if (game.blackPlayerId === playerId) {
        game.blackSocketId = socket.id;
    } else {
        // Se il giocatore non è trovato, potrebbe essere uno spettatore
        socket.join(gameId);
        socket.emit('spectator',); // Invia la posizione corrente
        return;
    }

    // Sincronizza lo stato del gioco senza emettere un nuovo evento "play"
    socket.join(gameId);
    socket.emit('sync', {
        gameId,
        //fen: game.fen(),
        //moveHistory: game.moveHistory,
        //currentPlayer: game.currentPlayer,
        //remainingTime: game.remainingTime
    });

    console.log(`Player reconnected: ${playerId}`);
});

  socket.on("disconnect", () => {
    //socket.broadcast.emit('player-exit', { roomId: gameId });
    //gameManager.removePlayerFromGame(playerId);

    socket.emit("send-room-status", gameManager.getGamesStatus());
    socket.broadcast.emit("send-room-status", gameManager.getGamesStatus());
  });
});

server.listen(config.port || process.env.PORT, () =>
  console.info(`Banzai Chess running on port ${config.port}.`)
);