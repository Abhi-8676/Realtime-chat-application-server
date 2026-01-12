// src/sockets/userHandlers.js
import User from '../models/User.js';
import logger from '../utils/logger.js';

const userHandlers = (io, socket) => {
  const userId = socket.userId;

  socket.on('user:status-update', async (data) => {
    const { status } = data;

    try {
      await User.findByIdAndUpdate(userId, { status });

      socket.broadcast.emit('user:status', {
        userId,
        status,
        lastSeen: new Date()
      });

      logger.info(`User ${userId} status updated to ${status}`);
    } catch (error) {
      logger.error(`Error updating user status: ${error.message}`);
    }
  });

  socket.on('user:get-online', () => {
    const onlineUsers = Array.from(io.activeUsers.keys());
    socket.emit('user:online-list', { users: onlineUsers });
  });
};

export default userHandlers;