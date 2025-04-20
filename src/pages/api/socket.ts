import { Server } from 'socket.io';
import type { NextApiRequest } from 'next';
import type { Server as HTTPServer } from 'http';
import type { Socket as NetSocket } from 'net';

interface SocketServer extends HTTPServer {
  io?: Server | undefined;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

interface NextApiResponse {
  socket: SocketWithIO;
}

// Game state interfaces
interface Player {
  id: string;
  name: string;
  dice: number[];
  diceCount: number;
  isCurrentTurn: boolean;
  socketId: string;
}

interface Game {
  id: string;
  players: Player[];
  currentBid: Bid | null;
  gameStarted: boolean;
  gameOver: boolean;
  winner: Player | null;
  showDice: boolean;
}

interface Bid {
  count: number;
  value: number;
  playerId: string;
}

// Store active games
const games: Record<string, Game> = {};

// Generate a random game ID
const generateGameId = () => {
  return Math.random().toString(36).substring(2, 8);
};

// Roll dice for a player
const rollDice = (count: number): number[] => {
  return Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1);
};

export default function SocketHandler(req: NextApiRequest, res: NextApiResponseWithSocket) {
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  console.log('Setting up socket');
  const io = new Server(res.socket.server);
  res.socket.server.io = io;

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create a new game
    socket.on('createGame', ({ playerName }) => {
      const gameId = generateGameId();
      const playerId = Math.random().toString(36).substring(2, 9);
      
      const player: Player = {
        id: playerId,
        name: playerName,
        dice: rollDice(5),
        diceCount: 5,
        isCurrentTurn: true,
        socketId: socket.id
      };
      
      games[gameId] = {
        id: gameId,
        players: [player],
        currentBid: null,
        gameStarted: false,
        gameOver: false,
        winner: null,
        showDice: false
      };
      
      socket.join(gameId);
      socket.emit('gameCreated', { gameId, playerId, game: games[gameId] });
      
      console.log(`Game created: ${gameId} by player ${playerName}`);
    });

    // Join an existing game
    socket.on('joinGame', ({ gameId, playerName }) => {
      const game = games[gameId];
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (game.gameStarted) {
        socket.emit('error', { message: 'Game already started' });
        return;
      }
      
      if (game.players.length >= 2) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }
      
      const playerId = Math.random().toString(36).substring(2, 9);
      
      const player: Player = {
        id: playerId,
        name: playerName,
        dice: rollDice(5),
        diceCount: 5,
        isCurrentTurn: false,
        socketId: socket.id
      };
      
      game.players.push(player);
      
      socket.join(gameId);
      socket.emit('gameJoined', { gameId, playerId, game });
      
      // Notify other players
      socket.to(gameId).emit('playerJoined', { player, game });
      
      console.log(`Player ${playerName} joined game ${gameId}`);
    });

    // Start the game
    socket.on('startGame', ({ gameId }) => {
      const game = games[gameId];
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (game.players.length < 2) {
        socket.emit('error', { message: 'Need at least 2 players to start' });
        return;
      }
      
      game.gameStarted = true;
      
      // First player's turn
      game.players[0].isCurrentTurn = true;
      
      io.to(gameId).emit('gameStarted', { game });
      
      console.log(`Game ${gameId} started`);
    });

    // Make a bid
    socket.on('makeBid', ({ gameId, playerId, count, value }) => {
      const game = games[gameId];
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      const player = game.players.find(p => p.id === playerId);
      
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      if (!player.isCurrentTurn) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      // Validate bid
      if (game.currentBid && (
        count < game.currentBid.count || 
        (count === game.currentBid.count && value <= game.currentBid.value)
      )) {
        socket.emit('error', { message: 'Invalid bid! You must bid a higher count or same count with higher value.' });
        return;
      }
      
      const newBid: Bid = {
        count,
        value,
        playerId
      };
      
      game.currentBid = newBid;
      
      // Switch turns
      const currentPlayerIndex = game.players.findIndex(p => p.id === playerId);
      const nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
      
      game.players.forEach((p, index) => {
        p.isCurrentTurn = index === nextPlayerIndex;
      });
      
      io.to(gameId).emit('bidMade', { 
        bid: newBid, 
        game,
        nextPlayerId: game.players[nextPlayerIndex].id,
        message: `${player.name} bid ${count} ${value}s. ${game.players[nextPlayerIndex].name}'s turn!`
      });
      
      console.log(`Player ${player.name} bid ${count} ${value}s in game ${gameId}`);
      
      // If next player is computer, make computer move
      if (game.players[nextPlayerIndex].name === "Computer") {
        setTimeout(() => {
          computerMove(game, gameId, io);
        }, 1500);
      }
    });

    // Call bluff
    socket.on('callBluff', ({ gameId, playerId }) => {
      const game = games[gameId];
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (!game.currentBid) {
        socket.emit('error', { message: 'No bid to call bluff on' });
        return;
      }
      
      const player = game.players.find(p => p.id === playerId);
      
      if (!player) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      if (!player.isCurrentTurn) {
        socket.emit('error', { message: 'Not your turn' });
        return;
      }
      
      game.showDice = true;
      
      // Count total dice with the bid value
      const totalDiceWithValue = game.players.reduce((count, player) => {
        return count + player.dice.filter(d => d === game.currentBid!.value).length;
      }, 0);
      
      const bidder = game.players.find(p => p.id === game.currentBid.playerId);
      const challenger = game.players.find(p => p.id === playerId);
      
      if (!bidder || !challenger) {
        socket.emit('error', { message: 'Player not found' });
        return;
      }
      
      let loser: Player;
      let message: string;
      
      if (totalDiceWithValue >= game.currentBid.count) {
        // Bid was valid, challenger loses a die
        loser = challenger;
        message = `${challenger.name} called bluff, but there were ${totalDiceWithValue} ${game.currentBid.value}s. ${challenger.name} loses a die!`;
      } else {
        // Bid was a bluff, bidder loses a die
        loser = bidder;
        message = `${challenger.name} called bluff! There were only ${totalDiceWithValue} ${game.currentBid.value}s. ${bidder.name} loses a die!`;
      }
      
      // Update loser's dice count
      loser.diceCount -= 1;
      if (loser.diceCount > 0) {
        loser.dice = rollDice(loser.diceCount);
      } else {
        loser.dice = [];
      }
      
      // Re-roll dice for all players
      game.players.forEach(p => {
        if (p.id !== loser.id && p.diceCount > 0) {
          p.dice = rollDice(p.diceCount);
        }
      });
      
      io.to(gameId).emit('bluffCalled', { 
        game, 
        bluffCaller: challenger.id,
        loser: loser.id,
        totalDiceWithValue,
        bidValue: game.currentBid.value,
        message
      });
      
      console.log(`Player ${challenger.name} called bluff in game ${gameId}`);
      
      // Check if game is over
      const gameEnded = game.players.some(p => p.diceCount === 0);
      
      if (gameEnded) {
        const winner = game.players.find(p => p.diceCount > 0);
        
        if (winner) {
          game.winner = winner;
          game.gameOver = true;
          
          io.to(gameId).emit('gameOver', { 
            game, 
            winner: winner.id,
            message: `Game over! ${winner.name} wins!`
          });
          
          console.log(`Game ${gameId} over. ${winner.name} wins!`);
        }
      } else {
        // Start new round after a delay
        setTimeout(() => {
          game.showDice = false;
          game.currentBid = null;
          
          // Next round starts with the challenger
          game.players.forEach(p => {
            p.isCurrentTurn = p.id === challenger.id;
          });
          
          io.to(gameId).emit('newRound', { 
            game,
            message: `New round! ${challenger.name}'s turn to bid.`
          });
          
          console.log(`New round in game ${gameId}`);
          
          // If computer starts, make a move
          if (challenger.name === "Computer") {
            setTimeout(() => {
              computerMove(game, gameId, io);
            }, 1500);
          }
        }, 3000);
      }
    });

    // Add computer player
    socket.on('addComputer', ({ gameId }) => {
      const game = games[gameId];
      
      if (!game) {
        socket.emit('error', { message: 'Game not found' });
        return;
      }
      
      if (game.players.length >= 2) {
        socket.emit('error', { message: 'Game is full' });
        return;
      }
      
      const computerId = Math.random().toString(36).substring(2, 9);
      
      const computerPlayer: Player = {
        id: computerId,
        name: "Computer",
        dice: rollDice(5),
        diceCount: 5,
        isCurrentTurn: false,
        socketId: 'computer'
      };
      
      game.players.push(computerPlayer);
      
      io.to(gameId).emit('computerAdded', { 
        game,
        message: 'Computer player added to the game.'
      });
      
      console.log(`Computer player added to game ${gameId}`);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      
      // Find games where this socket is a player
      Object.keys(games).forEach(gameId => {
        const game = games[gameId];
        const playerIndex = game.players.findIndex(p => p.socketId === socket.id);
        
        if (playerIndex !== -1) {
          const player = game.players[playerIndex];
          
          // Remove player from game
          game.players.splice(playerIndex, 1);
          
          // Notify other players
          socket.to(gameId).emit('playerLeft', { 
            playerId: player.id,
            message: `${player.name} has left the game.`
          });
          
          console.log(`Player ${player.name} left game ${gameId}`);
          
          // If no players left, remove the game
          if (game.players.length === 0) {
            delete games[gameId];
            console.log(`Game ${gameId} removed`);
          }
        }
      });
    });
  });

  res.end();
}

// Computer move logic
function computerMove(game: Game, gameId: string, io: Server) {
  if (!game.currentBid) {
    // First bid in the game
    const computerPlayer = game.players.find(p => p.name === "Computer");
    
    if (!computerPlayer || !computerPlayer.isCurrentTurn) return;
    
    // Make a random first bid
    const count = Math.floor(Math.random() * 3) + 1; // 1-3
    const value = Math.floor(Math.random() * 6) + 1; // 1-6
    
    const newBid: Bid = {
      count,
      value,
      playerId: computerPlayer.id
    };
    
    game.currentBid = newBid;
    
    // Switch turns
    const currentPlayerIndex = game.players.findIndex(p => p.id === computerPlayer.id);
    const nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
    
    game.players.forEach((p, index) => {
      p.isCurrentTurn = index === nextPlayerIndex;
    });
    
    io.to(gameId).emit('bidMade', { 
      bid: newBid, 
      game,
      nextPlayerId: game.players[nextPlayerIndex].id,
      message: `Computer bid ${count} ${value}s. ${game.players[nextPlayerIndex].name}'s turn!`
    });
    
    console.log(`Computer bid ${count} ${value}s in game ${gameId}`);
    return;
  }
  
  const computerPlayer = game.players.find(p => p.name === "Computer");
  
  if (!computerPlayer || !computerPlayer.isCurrentTurn) return;
  
  // Calculate probability of current bid being true
  // Count how many of the bid value the computer has
  const computerValueCount = computerPlayer.dice.filter(d => d === game.currentBid!.value).length;
  
  // Calculate how many more dice with the bid value are needed
  const neededFromOpponent = game.currentBid.count - computerValueCount;
  
  // Get total opponent dice
  const opponentDiceCount = game.players.reduce((count, p) => {
    return p.name !== "Computer" ? count + p.diceCount : count;
  }, 0);
  
  // Simple probability calculation
  const probPerDie = 1/6;
  let probability = 1.0;
  
  if (neededFromOpponent <= 0) {
    // Computer already has enough dice to satisfy the bid
    probability = 1.0;
  } else if (neededFromOpponent > opponentDiceCount) {
    // Impossible bid - opponent doesn't have enough dice
    probability = 0.0;
  } else {
    // Simplified probability calculation
    for (let i = 0; i < neededFromOpponent; i++) {
      probability *= probPerDie * opponentDiceCount / (i + 1);
    }
    probability = Math.min(1.0, Math.max(0.0, probability));
  }
  
  // Decision making based on probability
  const bluffThreshold = 0.3; // Adjust this threshold as needed
  const callBluff = probability < bluffThreshold;
  
  if (callBluff) {
    // Call bluff
    game.showDice = true;
    
    // Count total dice with the bid value
    const totalDiceWithValue = game.players.reduce((count, player) => {
      return count + player.dice.filter(d => d === game.currentBid!.value).length;
    }, 0);
    
    const bidder = game.players.find(p => p.id === game.currentBid!.playerId);
    
    if (!bidder) return;
    
    let loser: Player;
    let message: string;
    
    if (totalDiceWithValue >= game.currentBid.count) {
      // Bid was valid, computer loses a die
      loser = computerPlayer;
      message = `Computer called bluff, but there were ${totalDiceWithValue} ${game.currentBid.value}s. Computer loses a die!`;
    } else {
      // Bid was a bluff, bidder loses a die
      loser = bidder;
      message = `Computer called bluff! There were only ${totalDiceWithValue} ${game.currentBid.value}s. ${bidder.name} loses a die!`;
    }
    
    // Update loser's dice count
    loser.diceCount -= 1;
    if (loser.diceCount > 0) {
      loser.dice = rollDice(loser.diceCount);
    } else {
      loser.dice = [];
    }
    
    // Re-roll dice for all players
    game.players.forEach(p => {
      if (p.id !== loser.id && p.diceCount > 0) {
        p.dice = rollDice(p.diceCount);
      }
    });
    
    io.to(gameId).emit('bluffCalled', { 
      game, 
      bluffCaller: computerPlayer.id,
      loser: loser.id,
      totalDiceWithValue,
      bidValue: game.currentBid.value,
      message
    });
    
    console.log(`Computer called bluff in game ${gameId}`);
    
    // Check if game is over
    const gameEnded = game.players.some(p => p.diceCount === 0);
    
    if (gameEnded) {
      const winner = game.players.find(p => p.diceCount > 0);
      
      if (winner) {
        game.winner = winner;
        game.gameOver = true;
        
        io.to(gameId).emit('gameOver', { 
          game, 
          winner: winner.id,
          message: `Game over! ${winner.name} wins!`
        });
        
        console.log(`Game ${gameId} over. ${winner.name} wins!`);
      }
    } else {
      // Start new round after a delay
      setTimeout(() => {
        game.showDice = false;
        game.currentBid = null;
        
        // Next round starts with the computer
        game.players.forEach(p => {
          p.isCurrentTurn = p.id === computerPlayer.id;
        });
        
        io.to(gameId).emit('newRound', { 
          game,
          message: `New round! Computer's turn to bid.`
        });
        
        console.log(`New round in game ${gameId}`);
        
        // Computer makes a move
        setTimeout(() => {
          computerMove(game, gameId, io);
        }, 1500);
      }, 3000);
    }
  } else {
    // Make a bid
    // Count frequency of each dice value in computer's hand
    const valueCounts = [0, 0, 0, 0, 0, 0, 0]; // Index 0 is unused, 1-6 for dice values
    computerPlayer.dice.forEach(value => {
      valueCounts[value]++;
    });
    
    // Find the most frequent value in computer's hand
    let maxCount = 0;
    let maxValue = 1;
    for (let i = 1; i <= 6; i++) {
      if (valueCounts[i] > maxCount) {
        maxCount = valueCounts[i];
        maxValue = i;
      }
    }
    
    // Determine new bid
    let newCount = game.currentBid.count;
    let newValue = game.currentBid.value;
    
    // If computer has a lot of a certain value, bid on that value
    if (maxCount >= 2) {
      // Computer has multiple dice of the same value
      // Bid based on this value if possible
      
      if (maxValue > game.currentBid.value) {
        // Can bid same count but higher value
        newValue = maxValue;
      } else if (maxValue < game.currentBid.value) {
        // Need to increase count
        newCount = game.currentBid.count + 1;
        newValue = maxValue;
      } else {
        // Same value, need to increase count
        newCount = game.currentBid.count + 1;
      }
    } else {
      // No multiple dice of same value, make a random bid
      // 50% chance to increase value, 50% chance to increase count
      if (Math.random() < 0.5 && game.currentBid.value < 6) {
        newValue = game.currentBid.value + 1;
      } else {
        newCount = game.currentBid.count + 1;
        // Randomly choose a new value
        newValue = Math.floor(Math.random() * 6) + 1;
      }
    }
    
    // Ensure the bid is valid (higher than current bid)
    if (newCount < game.currentBid.count || (newCount === game.currentBid.count && newValue <= game.currentBid.value)) {
      newCount = game.currentBid.count;
      newValue = game.currentBid.value + 1;
      if (newValue > 6) {
        newValue = 1;
        newCount++;
      }
    }
    
    const newBid: Bid = {
      count: newCount,
      value: newValue,
      playerId: computerPlayer.id
    };
    
    game.currentBid = newBid;
    
    // Switch turns
    const currentPlayerIndex = game.players.findIndex(p => p.id === computerPlayer.id);
    const nextPlayerIndex = (currentPlayerIndex + 1) % game.players.length;
    
    game.players.forEach((p, index) => {
      p.isCurrentTurn = index === nextPlayerIndex;
    });
    
    io.to(gameId).emit('bidMade', { 
      bid: newBid, 
      game,
      nextPlayerId: game.players[nextPlayerIndex].id,
      message: `Computer bid ${newCount} ${newValue}s. ${game.players[nextPlayerIndex].name}'s turn!`
    });
    
    console.log(`Computer bid ${newCount} ${newValue}s in game ${gameId}`);
  }
}
