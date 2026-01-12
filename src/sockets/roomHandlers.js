// src/sockets/roomHandlers.js
import Room from '../models/Room.js';
import Message from '../models/Message.js';
import logger from '../utils/logger.js';

const roomHandlers = (io, socket) => {
  const userId = socket.userId;

  socket.on('room:join', async (roomId) => {
    try {
      const room = await Room.findById(roomId);
      if (!room || !room.isMember(userId)) {
        return socket.emit('error', { message: 'Not authorized to join this room' });
      }

      socket.join(`room:${roomId}`);
      logger.info(`User ${userId} joined room ${roomId}`);

      socket.to(`room:${roomId}`).emit('room:user-joined', {
        userId,
        username: socket.user.username,
        roomId
      });

      socket.emit('room:joined', { roomId });
    } catch (error) {
      logger.error(`Error joining room: ${error.message}`);
      socket.emit('error', { message: 'Failed to join room' });
    }
  });

  socket.on('room:leave', async (roomId) => {
    socket.leave(`room:${roomId}`);
    socket.to(`room:${roomId}`).emit('room:user-left', {
      userId,
      roomId
    });
    logger.info(`User ${userId} left room ${roomId}`);
  });

  socket.on('room:message', async (data) => {
    const { roomId, content, type = 'text' } = data;

    try {
      const room = await Room.findById(roomId);
      if (!room || !room.isMember(userId)) {
        return socket.emit('error', { message: 'Not authorized' });
      }

      const message = await Message.create({
        sender: userId,
        content,
        type,
        roomId
      });

      await message.populate('sender', 'username avatar');

      io.to(`room:${roomId}`).emit('room:message-new', {
        message,
        roomId
      });
    } catch (error) {
      logger.error(`Error sending room message: ${error.message}`);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
};

export default roomHandlers;
