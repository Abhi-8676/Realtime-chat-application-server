import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';
import User from '../models/User.js';
import Room from '../models/Room.js';
import catchAsync from '../utils/catchAsync.js';
import AppError from '../utils/AppError.js';

// @desc    Get all conversations for current user
// @route   GET /api/chats/conversations
// @access  Private
export const getConversations = catchAsync(async (req, res, next) => {
  const conversations = await Conversation.find({
    participants: req.user._id
  })
  .populate('participants', 'username avatar status lastSeen')
  .populate('lastMessage')
  .sort('-updatedAt');

  res.status(200).json({
    status: 'success',
    results: conversations.length,
    data: { conversations }
  });
});

// @desc    Get or create conversation
// @route   POST /api/chats/conversations
// @access  Private
export const getOrCreateConversation = catchAsync(async (req, res, next) => {
  const { participantId } = req.body;

  if (!participantId) {
    return next(new AppError('Participant ID is required', 400));
  }

  if (participantId === req.user._id.toString()) {
    return next(new AppError('Cannot create conversation with yourself', 400));
  }

  // Check if participant exists
  const participant = await User.findById(participantId);
  if (!participant) {
    return next(new AppError('User not found', 404));
  }

  // Find existing conversation
  let conversation = await Conversation.findOne({
    isGroup: false,
    participants: { $all: [req.user._id, participantId] }
  })
  .populate('participants', 'username avatar status lastSeen')
  .populate('lastMessage');

  // Create new conversation if doesn't exist
  if (!conversation) {
    conversation = await Conversation.create({
      participants: [req.user._id, participantId],
      isGroup: false
    });

    conversation = await conversation.populate('participants', 'username avatar status lastSeen');

    // Notify the other participant via Socket.IO
    try {
      const io = req.app.get('io');
      if (io && io.activeUsers) {
        const otherParticipant = conversation.participants.find(
          p => p && p._id && p._id.toString() !== req.user._id.toString()
        );
        if (otherParticipant) {
          const socketId = io.activeUsers.get(otherParticipant._id.toString());
          if (socketId) {
            io.to(socketId).emit('conversation:new', { conversation });
          }
        }
      }
    } catch (error) {
      console.error('Socket notification error:', error);
    }
  }

  res.status(200).json({
    status: 'success',
    data: { conversation }
  });
});

// @desc    Get messages for a conversation
// @route   GET /api/chats/conversations/:conversationId/messages
// @access  Private
export const getMessages = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;
  const { page = 1, limit = 50 } = req.query;

  // Check if it's a conversation
  let conversation = await Conversation.findById(conversationId);
  let isRoom = false;

  if (conversation) {
    if (!conversation.participants.some(p => p.equals(req.user._id))) {
      return next(new AppError('You are not part of this conversation', 403));
    }
  } else {
    // Check if it's a room
    const room = await Room.findById(conversationId);
    if (!room) {
      return next(new AppError('Conversation or Room not found', 404));
    }
    if (!room.isMember(req.user._id)) {
      return next(new AppError('You are not a member of this room', 403));
    }
    isRoom = true;
  }

  // Get messages with pagination
  const query = { 
    isDeleted: false 
  };

  if (isRoom) {
    query.roomId = conversationId;
  } else {
    query.conversationId = conversationId;
  }

  const messages = await Message.find(query)
  .populate('sender', 'username avatar')
  .populate('replyTo')
  .sort('-createdAt')
  .limit(limit * 1)
  .skip((page - 1) * limit);

  const count = await Message.countDocuments(query);

  res.status(200).json({
    status: 'success',
    results: messages.length,
    data: {
      messages: messages.reverse(), // Reverse to show oldest first
      totalPages: Math.ceil(count / limit),
      currentPage: page
    }
  });
});

// @desc    Send a message
// @route   POST /api/chats/messages
// @access  Private
export const sendMessage = catchAsync(async (req, res, next) => {
  const { conversationId, roomId, content, type = 'text', replyTo } = req.body;

  if (!conversationId && !roomId) {
    return next(new AppError('Conversation ID or Room ID is required', 400));
  }

  if (type === 'text' && !content) {
    return next(new AppError('Message content is required', 400));
  }

  // Verify conversation or room exists and user has access
  if (conversationId) {
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      return next(new AppError('Conversation not found', 404));
    }
    if (!conversation.participants.some(p => p.equals(req.user._id))) {
      return next(new AppError('You are not part of this conversation', 403));
    }
  } else if (roomId) {
    const room = await Room.findById(roomId);
    if (!room) {
      return next(new AppError('Room not found', 404));
    }
    if (!room.isMember(req.user._id)) {
      return next(new AppError('You are not a member of this room', 403));
    }
  }

  // Create message
  const message = await Message.create({
    sender: req.user._id,
    content,
    type,
    conversationId,
    roomId,
    replyTo
  });

  // Populate sender info
  await message.populate('sender', 'username avatar');

  // Update conversation's last message
  if (conversationId) {
    const conversation = await Conversation.findById(conversationId);
    conversation.lastMessage = message._id;
    conversation.incrementUnreadCount(req.user._id);
    await conversation.save();
  }

  // Emit socket event for real-time update
  const io = req.app.get('io');
  if (io) {
    if (conversationId) {
      io.to(`conversation:${conversationId}`).emit('message:new', {
        message,
        conversationId
      });
    } else if (roomId) {
      io.to(`room:${roomId}`).emit('room:message-new', {
        message,
        roomId
      });
    }
  }

  res.status(201).json({
    status: 'success',
    data: { message }
  });
});

// @desc    Mark messages as read
// @route   PATCH /api/chats/conversations/:conversationId/read
// @access  Private
export const markAsRead = catchAsync(async (req, res, next) => {
  const { conversationId } = req.params;

  // Verify conversation exists
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) {
    return next(new AppError('Conversation not found', 404));
  }

  if (!conversation.participants.some(p => p.equals(req.user._id))) {
    return next(new AppError('You are not part of this conversation', 403));
  }

  // Mark all unread messages as read
  await Message.updateMany(
    {
      conversationId,
      sender: { $ne: req.user._id },
      'readBy.user': { $ne: req.user._id }
    },
    {
      $push: {
        readBy: {
          user: req.user._id,
          readAt: new Date()
        }
      }
    }
  );

  // Reset unread count
  conversation.resetUnreadCount(req.user._id);
  await conversation.save();

  res.status(200).json({
    status: 'success',
    message: 'Messages marked as read'
  });
});

// @desc    Delete a message
// @route   DELETE /api/chats/messages/:messageId
// @access  Private
export const deleteMessage = catchAsync(async (req, res, next) => {
  const { messageId } = req.params;

  const message = await Message.findById(messageId);
  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  // Only sender can delete
  if (message.sender.toString() !== req.user._id.toString()) {
    return next(new AppError('You can only delete your own messages', 403));
  }

  message.isDeleted = true;
  message.deletedAt = Date.now();
  message.content = 'This message was deleted';
  await message.save();

  res.status(200).json({
    status: 'success',
    message: 'Message deleted successfully'
  });
});

// @desc    Edit a message
// @route   PUT /api/chats/messages/:messageId
// @access  Private
export const editMessage = catchAsync(async (req, res, next) => {
  const { messageId } = req.params;
  const { content } = req.body;

  if (!content) {
    return next(new AppError('Message content is required', 400));
  }

  const message = await Message.findById(messageId);
  if (!message) {
    return next(new AppError('Message not found', 404));
  }

  // Only sender can edit
  if (message.sender.toString() !== req.user._id.toString()) {
    return next(new AppError('You can only edit your own messages', 403));
  }

  message.content = content;
  message.isEdited = true;
  message.editedAt = Date.now();
  await message.save();

  res.status(200).json({
    status: 'success',
    data: { message }
  });
});

// @desc    Search messages
// @route   GET /api/chats/search
// @access  Private
export const searchMessages = catchAsync(async (req, res, next) => {
  const { query, conversationId } = req.query;

  if (!query) {
    return next(new AppError('Search query is required', 400));
  }

  const searchFilter = {
    content: { $regex: query, $options: 'i' },
    isDeleted: false
  };

  if (conversationId) {
    searchFilter.conversationId = conversationId;
  }

  const messages = await Message.find(searchFilter)
    .populate('sender', 'username avatar')
    .populate('conversationId')
    .limit(50)
    .sort('-createdAt');

  res.status(200).json({
    status: 'success',
    results: messages.length,
    data: { messages }
  });
});