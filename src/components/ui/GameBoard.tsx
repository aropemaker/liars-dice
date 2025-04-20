'use client'

import { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Dice } from './Dice';
import { Button } from './button';
import { Card } from './card';
import { Input } from './input';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './tabs';

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

let socket: Socket;

export const GameBoard = () => {
  const [playerName, setPlayerName] = useState<string>("");
  const [gameId, setGameId] = useState<string>("");
  const [playerId, setPlayerId] = useState<string>("");
  const [joinGameId, setJoinGameId] = useState<string>("");
  const [game, setGame] = useState<Game | null>(null);
  const [bidCount, setBidCount] = useState<number>(1);
  const [bidValue, setBidValue] = useState<number>(1);
  const [gameMessage, setGameMessage] = useState<string>("Welcome to Liar's Dice! Enter your name to create or join a game.");
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>("create");

  // Initialize socket connection
  useEffect(() => {
    const socketInitializer = async () => {
      await fetch('/api/socket');
      
      socket = io();
      
      socket.on('connect', () => {
        console.log('Connected to socket');
        setIsConnected(true);
      });
      
      socket.on('disconnect', () => {
        console.log('Disconnected from socket');
        setIsConnected(false);
      });
      
      socket.on('error', (data) => {
        setGameMessage(data.message);
      });
      
      socket.on('gameCreated', (data) => {
        setGameId(data.gameId);
        setPlayerId(data.playerId);
        setGame(data.game);
        setGameMessage(`Game created! Game ID: ${data.gameId}. Waiting for another player to join...`);
      });
      
      socket.on('gameJoined', (data) => {
        setGameId(data.gameId);
        setPlayerId(data.playerId);
        setGame(data.game);
        setGameMessage(`You joined game ${data.gameId}. Waiting for the game to start...`);
      });
      
      socket.on('playerJoined', (data) => {
        setGame(data.game);
        setGameMessage(`${data.player.name} joined the game. Ready to start!`);
      });
      
      socket.on('computerAdded', (data) => {
        setGame(data.game);
        setGameMessage(data.message);
      });
      
      socket.on('gameStarted', (data) => {
        setGame(data.game);
        const currentPlayer = data.game.players.find((p: Player) => p.isCurrentTurn);
        setGameMessage(`Game started! ${currentPlayer?.name}'s turn to make the first bid.`);
      });
      
      socket.on('bidMade', (data) => {
        setGame(data.game);
        setGameMessage(data.message);
      });
      
      socket.on('bluffCalled', (data) => {
        setGame(data.game);
        setGameMessage(data.message);
      });
      
      socket.on('newRound', (data) => {
        setGame(data.game);
        setGameMessage(data.message);
        setBidCount(1);
        setBidValue(1);
      });
      
      socket.on('gameOver', (data) => {
        setGame(data.game);
        setGameMessage(data.message);
      });
      
      socket.on('playerLeft', (data) => {
        setGameMessage(data.message);
      });
    };
    
    socketInitializer();
    
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  // Create a new game
  const createGame = useCallback(() => {
    if (!playerName.trim()) {
      setGameMessage("Please enter your name to create a game.");
      return;
    }
    
    socket.emit('createGame', { playerName });
  }, [playerName]);

  // Join an existing game
  const joinGame = useCallback(() => {
    if (!playerName.trim()) {
      setGameMessage("Please enter your name to join a game.");
      return;
    }
    
    if (!joinGameId.trim()) {
      setGameMessage("Please enter a game ID to join.");
      return;
    }
    
    socket.emit('joinGame', { gameId: joinGameId, playerName });
  }, [playerName, joinGameId]);

  // Add computer player
  const addComputer = useCallback(() => {
    if (!gameId) {
      setGameMessage("No active game to add computer to.");
      return;
    }
    
    socket.emit('addComputer', { gameId });
  }, [gameId]);

  // Start the game
  const startGame = useCallback(() => {
    if (!gameId) {
      setGameMessage("No active game to start.");
      return;
    }
    
    if (!game || game.players.length < 2) {
      setGameMessage("Need at least 2 players to start the game.");
      return;
    }
    
    socket.emit('startGame', { gameId });
  }, [gameId, game]);

  // Make a bid
  const makeBid = useCallback(() => {
    if (!gameId || !playerId) {
      setGameMessage("No active game or player.");
      return;
    }
    
    socket.emit('makeBid', { gameId, playerId, count: bidCount, value: bidValue });
  }, [gameId, playerId, bidCount, bidValue]);

  // Call bluff
  const callBluff = useCallback(() => {
    if (!gameId || !playerId) {
      setGameMessage("No active game or player.");
      return;
    }
    
    if (!game || !game.currentBid) {
      setGameMessage("No bid to call bluff on.");
      return;
    }
    
    socket.emit('callBluff', { gameId, playerId });
  }, [gameId, playerId, game]);

  // Reset the game
  const resetGame = useCallback(() => {
    setGameId("");
    setPlayerId("");
    setJoinGameId("");
    setGame(null);
    setBidCount(1);
    setBidValue(1);
    setGameMessage("Welcome to Liar's Dice! Enter your name to create or join a game.");
    setActiveTab("create");
  }, []);

  // Check if it's the current player's turn
  const isPlayerTurn = useCallback(() => {
    if (!game || !playerId) return false;
    
    const currentPlayer = game.players.find(p => p.id === playerId);
    return currentPlayer?.isCurrentTurn || false;
  }, [game, playerId]);

  // Get the current player
  const getCurrentPlayer = useCallback(() => {
    if (!game || !playerId) return null;
    
    return game.players.find(p => p.id === playerId) || null;
  }, [game, playerId]);

  // Render player's dice
  const renderPlayerDice = useCallback((player: Player) => {
    if (!game) return null;
    
    const isCurrentUserPlayer = player.id === playerId;
    
    return (
      <div 
        key={player.id} 
        className={`p-2 border rounded-md ${player.isCurrentTurn ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
      >
        <p className="font-medium">{player.name} {player.isCurrentTurn ? '(Current Turn)' : ''}</p>
        <div className="flex flex-wrap gap-1 mt-1">
          {isCurrentUserPlayer || game.showDice ? (
            // Show actual dice for current user or when dice are revealed
            player.dice.map((value, i) => (
              <Dice key={i} value={value} size="sm" />
            ))
          ) : (
            // Show hidden dice for other players
            Array.from({ length: player.diceCount }).map((_, i) => (
              <div key={i} className="w-8 h-8 bg-gray-200 rounded-md"></div>
            ))
          )}
        </div>
      </div>
    );
  }, [game, playerId]);

  return (
    <div className="w-full max-w-md mx-auto">
      <Card className="p-4 mb-4">
        <h1 className="text-2xl font-bold text-center mb-2">Liar's Dice</h1>
        <p className="text-center text-sm mb-4">{gameMessage}</p>
        
        {!game ? (
          <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="create">Create Game</TabsTrigger>
              <TabsTrigger value="join">Join Game</TabsTrigger>
            </TabsList>
            <TabsContent value="create" className="mt-4">
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="mb-2"
                />
                <Button onClick={createGame}>Create Game</Button>
              </div>
            </TabsContent>
            <TabsContent value="join" className="mt-4">
              <div className="flex flex-col gap-2">
                <Input
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="mb-2"
                />
                <Input
                  placeholder="Enter game ID"
                  value={joinGameId}
                  onChange={(e) => setJoinGameId(e.target.value)}
                  className="mb-2"
                />
                <Button onClick={joinGame}>Join Game</Button>
              </div>
            </TabsContent>
          </Tabs>
        ) : !game.gameStarted ? (
          <div className="flex flex-col gap-2">
            <div className="p-2 bg-gray-100 rounded-md mb-2">
              <p className="text-center font-medium">Game ID: {gameId}</p>
              <p className="text-center text-sm">Share this ID with others to join your game</p>
            </div>
            
            <div className="grid grid-cols-1 gap-2 mb-4">
              {game.players.map((player) => (
                <div key={player.id} className="p-2 border rounded-md">
                  <p className="font-medium">{player.name}</p>
                </div>
              ))}
            </div>
            
            {game.players.length < 2 && (
              <Button onClick={addComputer} className="mb-2">Add Computer Player</Button>
            )}
            
            {game.players.length >= 2 && (
              <Button onClick={startGame}>Start Game</Button>
            )}
          </div>
        ) : game.gameOver ? (
          <div className="flex flex-col items-center gap-2">
            <p className="text-xl font-bold">{game.winner?.name} wins!</p>
            <Button onClick={resetGame}>New Game</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 mb-4">
              {game.players.map(renderPlayerDice)}
            </div>
            
            {game.currentBid && (
              <div className="mb-4 p-2 bg-gray-100 rounded-md">
                <p className="text-center">
                  Current bid: {game.currentBid.count} {game.currentBid.value}s
                </p>
              </div>
            )}
            
            {isPlayerTurn() && (
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <Select value={bidCount.toString()} onValueChange={(value) => setBidCount(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Count" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((count) => (
                          <SelectItem key={count} value={count.toString()}>
                            {count}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-1/2">
                    <Select value={bidValue.toString()} onValueChange={(value) => setBidValue(parseInt(value))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Value" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 6 }, (_, i) => i + 1).map((value) => (
                          <SelectItem key={value} value={value.toString()}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <Button className="w-1/2" onClick={makeBid}>Make Bid</Button>
                  <Button 
                    className="w-1/2" 
                    variant="destructive" 
                    onClick={callBluff}
                    disabled={!game.currentBid}
                  >
                    Call Bluff
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
      
      <Card className="p-4">
        <h2 className="font-bold mb-2">Game Rules:</h2>
        <ul className="text-sm space-y-1">
          <li>• Each player starts with 5 dice</li>
          <li>• Players take turns making bids about how many dice of a specific value exist among all players</li>
          <li>• A bid must be higher than the previous bid (either more dice or same number but higher value)</li>
          <li>• Players can call "bluff" if they think the previous bid is incorrect</li>
          <li>• If a bluff is called, all dice are revealed</li>
          <li>• If the bid was correct, the challenger loses a die</li>
          <li>• If the bid was incorrect, the bidder loses a die</li>
          <li>• A player who loses all dice is eliminated</li>
          <li>• The last player with dice wins</li>
        </ul>
      </Card>
    </div>
  );
};
