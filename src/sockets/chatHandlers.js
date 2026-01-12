import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import logger from '../utils/logger.js';

const chatHandlers = (io, socket) => {
  const userId = socket.userId;

  // Join conversation room
  socket.on('conversation:join', async (conversationId) => {
    try {
      // Verify user is part of conversation
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.some(p => p.toString() === userId)) {
        return socket.emit('error', { message: 'Not authorized to join this conversation' });
      }

      socket.join(`conversation:${conversationId}`);
      logger.info(`User ${userId} joined conversation ${conversationId}`);

      socket.emit('conversation:joined', { conversationId });
    } catch (error) {
      logger.error(`Error joining conversation: ${error.message}`);
      socket.emit('error', { message: 'Failed to join conversation' });
    }
  });

  // Leave conversation room
  socket.on('conversation:leave', (conversationId) => {
    socket.leave(`conversation:${conversationId}`);
    logger.info(`User ${userId} left conversation ${conversationId}`);
  });

  // Send message via socket
  socket.on('message:send', async (data) => {
    try {
      const { conversationId, content, type = 'text', replyTo } = data;

      // Verify conversation exists and user has access
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.some(p => p.toString() === userId)) {
        return socket.emit('error', { message: 'Not authorized' });
      }

      // Create message
      const message = await Message.create({
        sender: userId,
        content,
        type,
        conversationId,
        replyTo
      });

      await message.populate('sender', 'username avatar');
      if (replyTo) {
        await message.populate('replyTo');
      }

      // Update conversation
      conversation.lastMessage = message._id;
      conversation.incrementUnreadCount(userId);
      await conversation.save();

      // Broadcast to others in conversation
      socket.broadcast.to(`conversation:${conversationId}`).emit('message:new', {
        message,
        conversationId
      });

      // Emit to sender
      socket.emit('message:new', {
        message,
        conversationId
      });

      // Send notification to offline users
      const recipientIds = conversation.participants.filter(
        id => id.toString() !== userId && !io.activeUsers.has(id.toString())
      );

      // TODO: Send push notifications to offline users
      logger.info(`Message sent in conversation ${conversationId} by user ${userId}`);

    } catch (error) {
      logger.error(`Error sending message: ${error.message}`);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Typing indicator
  socket.on('typing:start', async (data) => {
    const { conversationId } = data;

    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.some(p => p.toString() === userId)) {
        return;
      }

      // Broadcast to others in conversation
      socket.to(`conversation:${conversationId}`).emit('typing:user', {
        userId,
        username: socket.user.username,
        conversationId
      });
    } catch (error) {
      logger.error(`Error in typing indicator: ${error.message}`);
    }
  });

  socket.on('typing:stop', async (data) => {
    const { conversationId } = data;

    try {
      socket.to(`conversation:${conversationId}`).emit('typing:stopped', {
        userId,
        conversationId
      });
    } catch (error) {
      logger.error(`Error in stop typing: ${error.message}`);
    }
  });

  // Mark messages as read
  socket.on('messages:read', async (data) => {
    const { conversationId, messageIds } = data;

    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.some(p => p.toString() === userId)) {
        return;
      }

      // Update messages
      await Message.updateMany(
        {
          _id: { $in: messageIds },
          'readBy.user': { $ne: userId }
        },
        {
          $push: {
            readBy: {
              user: userId,
              readAt: new Date()
            }
          }
        }
      );

      // Reset unread count
      conversation.resetUnreadCount(userId);
      await conversation.save();

      // Notify sender that messages were read
      socket.to(`conversation:${conversationId}`).emit('messages:read', {
        conversationId,
        messageIds,
        readBy: userId
      });

    } catch (error) {
      logger.error(`Error marking messages as read: ${error.message}`);
    }
  });

  // Delete message
  socket.on('message:delete', async (data) => {
    const { messageId, conversationId } = data;

    try {
      const message = await Message.findById(messageId);
      if (!message || message.sender.toString() !== userId) {
        return socket.emit('error', { message: 'Not authorized to delete this message' });
      }

      message.isDeleted = true;
      message.deletedAt = new Date();
      message.content = 'This message was deleted';
      await message.save();

      // Broadcast deletion
      io.to(`conversation:${conversationId}`).emit('message:deleted', {
        messageId,
        conversationId
      });

    } catch (error) {
      logger.error(`Error deleting message: ${error.message}`);
      socket.emit('error', { message: 'Failed to delete message' });
    }
  });

  // Edit message
  socket.on('message:edit', async (data) => {
    const { messageId, content, conversationId } = data;

    try {
      const message = await Message.findById(messageId);
      if (!message || message.sender.toString() !== userId) {
        return socket.emit('error', { message: 'Not authorized to edit this message' });
      }

      message.content = content;
      message.isEdited = true;
      message.editedAt = new Date();
      await message.save();

      await message.populate('sender', 'username avatar');

      // Broadcast edit
      io.to(`conversation:${conversationId}`).emit('message:edited', {
        message,
        conversationId
      });

    } catch (error) {
      logger.error(`Error editing message: ${error.message}`);
      socket.emit('error', { message: 'Failed to edit message' });
    }
  });

  // Add reaction to message
  socket.on('message:react', async (data) => {
    const { messageId, emoji, conversationId } = data;

    try {
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { message: 'Message not found' });
      }

      // Check if user already reacted with this emoji
      const existingReaction = message.reactions.find(
        r => r.user.toString() === userId && r.emoji === emoji
      );

      if (existingReaction) {
        // Remove reaction
        message.reactions = message.reactions.filter(
          r => !(r.user.toString() === userId && r.emoji === emoji)
        );
      } else {
        // Add reaction
        message.reactions.push({
          user: userId,
          emoji
        });
      }

      await message.save();

      // Broadcast reaction
      io.to(`conversation:${conversationId}`).emit('message:reacted', {
        messageId,
        reactions: message.reactions,
        conversationId
      });

    } catch (error) {
      logger.error(`Error adding reaction: ${error.message}`);
      socket.emit('error', { message: 'Failed to add reaction' });
    }
  });
};

export default chatHandlers;