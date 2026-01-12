import express from 'express';
import {
  getConversations,
  getOrCreateConversation,
  getMessages,
  sendMessage,
  markAsRead,
  deleteMessage,
  editMessage,
  searchMessages
} from '../controllers/chatController.js';
import { protect } from '../middlewares/authMiddleware.js';

const router = express.Router();

// All routes require authentication
router.use(protect);

// Conversation routes
router.get('/conversations', getConversations);
router.post('/conversations', getOrCreateConversation);
router.get('/conversations/:conversationId/messages', getMessages);
router.patch('/conversations/:conversationId/read', markAsRead);

// Message routes
router.post('/messages', sendMessage);
router.delete('/messages/:messageId', deleteMessage);
router.put('/messages/:messageId', editMessage);
router.get('/search', searchMessages);

export default router;