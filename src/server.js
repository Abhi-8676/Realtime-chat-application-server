import { createServer } from 'http';
import dotenv from 'dotenv';
import {connectDB} from './config/database.js';
import { connectRedis } from './config/redis.js';
import app from './app.js';

import initializeSocket from './sockets/index.js';
import logger from './utils/logger.js';

// Load environment variables
dotenv.config();

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  logger.error(`${err.name}: ${err.message}`);
  logger.error(err.stack);
  process.exit(1);
});

// Create HTTP server
const server = createServer(app);

// Initialize Socket.IO
const io = initializeSocket(server);

// Make io accessible to routes
app.set('io', io);

// Connect to databases
const startServer = async () => {
  try {
    // Connect to MongoDB
    await connectDB();

    // Connect to Redis (optional - comment out if not using Redis)
    try {
      await connectRedis();
    } catch (redisError) {
      logger.warn(`Redis connection failed: ${redisError.message}. Continuing without Redis.`);
    }

    // Start server
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      logger.info(`
╔════════════════════════════════════════╗
║                                        ║
║   🚀 Server running in ${process.env.NODE_ENV || 'development'} mode    ║
║   📡 Port: ${PORT}                     ║
║   🌐 URL: http://localhost:${PORT}     ║
║                                        ║
╚════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('UNHANDLED REJECTION! 💥 Shutting down...');
  logger.error(`${err.name}: ${err.message}`);
  server.close(() => {
    process.exit(1);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('👋 SIGTERM RECEIVED. Shutting down gracefully');
  server.close(() => {
    logger.info('💥 Process terminated!');
  });
});

// Start the server
startServer();