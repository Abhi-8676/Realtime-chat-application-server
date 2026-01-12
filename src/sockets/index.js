import { Server } from 'socket.io';
import { verifyAccessToken } from '../services/authService.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';
import chatHandlers from './chatHandlers.js';
import roomHandlers from './roomHandlers.js';
import userHandlers from './userHandlers.js';

// Store active user connections
const activeUsers = new Map(); // userId -> socketId
const userSockets = new Map(); // socketId -> userId

const initializeSocket = (server) => {
  const io = new Server(server, {
    cors: {
      origin: [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        process.env.CLIENT_URL
      ].filter(Boolean),
      credentials: true,
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Socket authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify token
      const decoded = verifyAccessToken(token);
      
      // Get user from database
      const user = await User.findById(decoded.userId);
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Attach user to socket
      socket.userId = user._id.toString();
      socket.user = user;
      
      next();
    } catch (error) {
      logger.error(`Socket authentication error: ${error.message}`);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle socket connections
  io.on('connection', (socket) => {
    const userId = socket.userId;
    logger.info(`✅ User connected: ${socket.user.username} (${socket.id})`);

    // Store user connection
    activeUsers.set(userId, socket.id);
    userSockets.set(socket.id, userId);

    // Update user status to online
    User.findByIdAndUpdate(userId, { 
      status: 'online',
      lastSeen: new Date()
    }).catch(err => logger.error(`Error updating user status: ${err.message}`));

    // Broadcast user online status
    socket.broadcast.emit('user:status', {
      userId,
      status: 'online',
      lastSeen: new Date()
    });

    // Register event handlers
    chatHandlers(io, socket);
    roomHandlers(io, socket);
    userHandlers(io, socket);

    // Handle disconnection
    socket.on('disconnect', async () => {
      logger.info(`❌ User disconnected: ${socket.user.username} (${socket.id})`);

      // Remove from active users
      activeUsers.delete(userId);
      userSockets.delete(socket.id);

      // Update user status to offline
      try {
        await User.findByIdAndUpdate(userId, {
          status: 'offline',
          lastSeen: new Date()
        });

        // Broadcast user offline status
        socket.broadcast.emit('user:status', {
          userId,
          status: 'offline',
          lastSeen: new Date()
        });
      } catch (error) {
        logger.error(`Error updating user status on disconnect: ${error.message}`);
      }
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error(`Socket error for user ${userId}: ${error.message}`);
    });
  });

  // Make active users accessible
  io.activeUsers = activeUsers;
  io.userSockets = userSockets;

  logger.info('✅ Socket.IO initialized successfully');
  
  return io;
};

export default initializeSocket;