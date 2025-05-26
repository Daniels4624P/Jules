const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { verifyToken } = require('../middleware/auth'); // Correct path to auth middleware

// All routes in this file are protected and require a valid token
router.use(verifyToken);

// POST /api/chats - Create a new chat
router.post('/', chatController.createChatHandler);

// GET /api/chats - Get all chats for the current user
router.get('/', chatController.getUserChatsHandler);

// GET /api/chats/search - Search chats for the current user
router.get('/search', chatController.searchChatsHandler); // Should be before /:chatId to avoid conflict

// GET /api/chats/:chatId/messages - Get messages for a specific chat
router.get('/:chatId/messages', chatController.getChatMessagesHandler);

// POST /api/chats/:chatId/messages - Create a new message in a specific chat
router.post('/:chatId/messages', chatController.createMessageHandler);

module.exports = router;
