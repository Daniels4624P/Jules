const chatService = require('../services/chatService');
// userService is not directly used here but good to keep in mind if more complex user validation is needed in controller.
// const userService = require('../services/userService'); 
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');

/**
 * @controller createChatHandler
 * Handles the creation of new chats (1-on-1 or group).
 * Expects an array of `otherUserIds` and an optional `name` for group chats.
 * The current authenticated user (from `req.user`) is automatically added.
 * @param {object} req - Express request object. `req.user` from `verifyToken` middleware. 
 *                       `req.body` expected: { otherUserIds: number[], name?: string }.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends JSON response with the new chat object (201) or calls next with AppError.
 */
const createChatHandler = catchAsync(async (req, res, next) => {
  const { otherUserIds, name } = req.body; 
  const currentUserId = req.user.id; // Set by verifyToken middleware

  // --- Input Validation ---
  if (!otherUserIds || !Array.isArray(otherUserIds) || otherUserIds.length === 0) {
    return next(new AppError(400, '`otherUserIds` (array of user IDs) is required and must not be empty.'));
  }

  const parsedUserIds = otherUserIds.map(id => parseInt(id, 10));
  if (parsedUserIds.some(isNaN)) {
    return next(new AppError(400, 'All IDs in `otherUserIds` must be valid numbers.'));
  }

  const allUserIds = [currentUserId, ...parsedUserIds];
  // Remove duplicates to ensure each participant is added only once
  const uniqueUserIds = [...new Set(allUserIds)]; 

  if (uniqueUserIds.length < 2) {
    // A chat needs at least two distinct participants (current user + at least one other).
    return next(new AppError(400, 'A chat requires at least two unique participants.'));
  }
  
  // Optional: Further validation if users exist can be done here, but chatService.createChat also validates.
  // Example:
  // for (const userId of uniqueUserIds) {
  //   if (userId === currentUserId) continue; 
  //   await userService.findUserById(userId, true); // This would throw if any other user not found
  // }

  const isGroupChat = uniqueUserIds.length > 2;
  let chatName = isGroupChat ? name : null; // Chat name is only relevant for group chats.

  // For group chats, a name can be optional or required based on application rules.
  if (isGroupChat && (name && (typeof name !== 'string' || name.trim().length > 255))) {
    // Example: Validate name length if provided for a group chat.
    return next(new AppError(400, 'Group chat name, if provided, must be a string up to 255 characters.'));
  }
  if (isGroupChat && (!name || name.trim().length === 0)) {
    // Decide: either make name mandatory for group chats or allow unnamed group chats.
    // For this implementation, we allow unnamed group chats (chatName remains null or empty).
    // If required: return next(new AppError(400, 'Group chat name is required.'));
  }

  // --- Chat Creation ---
  // chatService.createChat handles the database interaction, including user validation within transaction.
  const newChat = await chatService.createChat(uniqueUserIds, chatName, isGroupChat);
  res.status(201).json(newChat);
});

/**
 * @controller getUserChatsHandler
 * Fetches all chats for the currently authenticated user.
 * @param {object} req - Express request object. `req.user` from `verifyToken` middleware.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends JSON response with an array of chat objects (200) or calls next with AppError.
 */
const getUserChatsHandler = catchAsync(async (req, res, next) => {
  const userId = req.user.id; // Get user ID from authenticated user
  const chats = await chatService.getUserChats(userId);
  res.status(200).json(chats);
});

/**
 * @controller getChatMessagesHandler
 * Fetches messages for a specific chat with pagination.
 * Ensures the authenticated user is a participant of the chat.
 * @param {object} req - Express request object. `req.user`, `req.params.chatId`. 
 *                       `req.query` for pagination: { limit?: number, offset?: number }.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends JSON response with an array of message objects (200) or calls next with AppError.
 */
const getChatMessagesHandler = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const chatId = parseInt(req.params.chatId, 10);
  
  // --- Path Parameter and Query Validation ---
  if (isNaN(chatId) || chatId <= 0) {
    return next(new AppError(400, 'Invalid Chat ID in path. Must be a positive integer.'));
  }

  const limit = parseInt(req.query.limit, 10) || 20; // Default limit to 20
  const offset = parseInt(req.query.offset, 10) || 0; // Default offset to 0

  if (isNaN(limit) || limit <= 0 || limit > 100) { // Max limit of 100 messages per request
    return next(new AppError(400, 'Invalid limit query parameter. Must be a positive integer, max 100.'));
  }
  if (isNaN(offset) || offset < 0) {
     return next(new AppError(400, 'Invalid offset query parameter. Must be a non-negative integer.'));
  }

  // --- Fetch Messages ---
  // chatService.getChatMessages includes authorization (checks if user is in chat).
  const messages = await chatService.getChatMessages(userId, chatId, limit, offset);
  res.status(200).json(messages);
});

/**
 * @controller searchChatsHandler
 * Searches chats for the authenticated user based on a query term.
 * The search term can match chat names or participant usernames.
 * @param {object} req - Express request object. `req.user`, `req.query.searchTerm`.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends JSON response with an array of matching chat objects (200) or calls next with AppError.
 */
const searchChatsHandler = catchAsync(async (req, res, next) => {
  const userId = req.user.id;
  const { searchTerm } = req.query;

  // --- Query Validation ---
  if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length === 0) {
    return next(new AppError(400, 'Search term is required and must be a non-empty string.'));
  }
  if (searchTerm.trim().length > 100) { // Arbitrary max length for search term
    return next(new AppError(400, 'Search term is too long (max 100 characters).'));
  }

  // --- Search Execution ---
  const chats = await chatService.searchUserChats(userId, searchTerm.trim());
  res.status(200).json(chats);
});

/**
 * @controller createMessageHandler
 * Handles creation of a new message in a specific chat.
 * Ensures the authenticated user is a participant of the chat.
 * The message is saved and then typically broadcast via Socket.IO (handled by socketHandler).
 * @param {object} req - Express request object. `req.user`, `req.params.chatId`. 
 *                       `req.body` expected: { content: string }.
 * @param {object} res - Express response object.
 * @param {function} next - Express next middleware function.
 * @returns {void} Sends JSON response with the new message object (201) or calls next with AppError.
 */
const createMessageHandler = catchAsync(async (req, res, next) => {
  const senderId = req.user.id;
  const chatId = parseInt(req.params.chatId, 10);
  const { content } = req.body;

  // --- Input Validation ---
  if (isNaN(chatId) || chatId <= 0) {
    return next(new AppError(400, 'Invalid Chat ID in path. Must be a positive integer.'));
  }
  if (!content || typeof content !== 'string' || content.trim() === '') {
    return next(new AppError(400, 'Message content cannot be empty.'));
  }
  if (content.trim().length > 2000) { // Example max message length
    return next(new AppError(400, 'Message content is too long (max 2000 characters).'));
  }

  // --- Message Creation ---
  // chatService.createMessage includes authorization and returns the created message.
  const newMessage = await chatService.createMessage(chatId, senderId, content.trim());
  
  // Note: The real-time broadcasting of this message to other chat participants
  // is handled by the socketHandler after a 'sendMessage' event is emitted from the client.
  // This controller's role is to persist the message and confirm its creation via HTTP.
  res.status(201).json(newMessage);
});

module.exports = {
  createChatHandler,
  getUserChatsHandler,
  getChatMessagesHandler,
  searchChatsHandler,
  createMessageHandler,
};
