const jwt = require('jsonwebtoken');
const cookie = require('cookie'); // For parsing cookie strings
const chatService = require('../services/chatService');
require('dotenv').config();

/**
 * Initializes Socket.IO authentication middleware and event handlers.
 * @param {import('socket.io').Server} io - The Socket.IO server instance.
 */
function initializeSocket(io) {
  /**
   * Socket.IO Authentication Middleware.
   * Verifies JWT from 'accessToken' cookie for each new socket connection.
   * Attaches decoded user payload to `socket.user` if authentication is successful.
   * Calls `next(new Error(...))` if authentication fails, preventing connection.
   */
  io.use(async (socket, next) => {
    try {
      const cookieString = socket.request.headers.cookie;
      if (!cookieString) {
        // No cookies sent by the client.
        return next(new Error('Authentication error: No cookies provided.'));
      }

      const parsedCookies = cookie.parse(cookieString);
      const token = parsedCookies.accessToken; 

      if (!token) {
        // 'accessToken' cookie not found.
        return next(new Error('Authentication error: Access token not found in cookies.'));
      }

      // Verify the JWT using the secret key.
      const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);
      // Attach the decoded user information (e.g., id, username) to the socket object.
      // This makes user information available in all event handlers for this socket.
      socket.user = decodedPayload; 
      next(); // Authentication successful, proceed with the connection.
    } catch (error) {
      // Handle different JWT verification errors.
      console.error('Socket authentication error:', error.name, error.message);
      if (error.name === 'TokenExpiredError') {
        return next(new Error('Authentication error: Access token expired. Please refresh.'));
      }
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Authentication error: Invalid access token.'));
      }
      // For other unexpected errors during authentication.
      return next(new Error('Authentication error: Could not verify token.'));
    }
  });

  /**
   * Handles events for established socket connections.
   * This function is called whenever a client successfully connects after passing authentication.
   */
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (ID: ${socket.user.id}, Socket ID: ${socket.id})`);

    /**
     * Handles 'joinChat' event from a client.
     * Allows a user to join a specific chat room to receive messages for that chat.
     * Validates chatId and user's participation in the chat.
     * @param {object} data - Expected: { chatId: number }
     */
    socket.on('joinChat', async (data) => {
      try {
        const chatId = data && data.chatId ? parseInt(data.chatId, 10) : null;

        if (!chatId || isNaN(chatId) || chatId <= 0) {
          return socket.emit('socketError', { event: 'joinChat', message: 'Invalid Chat ID. Must be a positive integer.' });
        }

        // chatService.checkUserInChat will throw an AppError if user is not in chat (handled by catch block).
        // It also verifies if the chat itself exists.
        await chatService.checkUserInChat(socket.user.id, chatId, true); // expectUserInChat = true
        
        socket.join(chatId.toString()); // Join the room identified by the chat ID.
        console.log(`User ${socket.user.username} joined chat room: ${chatId}`);
        // Confirm to the client that they have successfully joined the chat.
        socket.emit('chatJoined', { chatId, message: `Successfully joined chat ${chatId}` });
        
      } catch (error) {
        console.error(`Error in joinChat for user ${socket.user.username}, data: ${JSON.stringify(data)}:`, error.message);
        // Send a specific error message back to the client.
        socket.emit('socketError', { 
            event: 'joinChat', 
            message: error.isOperational ? error.message : 'Failed to join chat. An unexpected error occurred.' 
        });
      }
    });

    /**
     * Handles 'leaveChat' event from a client.
     * Allows a user to leave a specific chat room.
     * @param {object} data - Expected: { chatId: number }
     */
    socket.on('leaveChat', (data) => {
      const chatId = data && data.chatId ? parseInt(data.chatId, 10) : null;

      if (!chatId || isNaN(chatId) || chatId <= 0) {
        // Log warning for invalid data, but typically don't send error for non-critical ops like this.
        console.warn(`Invalid chatId for leaveChat from ${socket.user.username}: ${data ? data.chatId : 'undefined'}`);
        return; 
      }
      socket.leave(chatId.toString()); // Leave the room.
      console.log(`User ${socket.user.username} left chat room: ${chatId}`);
      // Confirm to the client they have left the chat.
      socket.emit('chatLeft', { chatId, message: `Successfully left chat ${chatId}` });
    });

    /**
     * Handles 'sendMessage' event from a client.
     * Persists the message via chatService and then broadcasts it to all users in the chat room.
     * Validates chatId and message content.
     * @param {object} data - Expected: { chatId: number, content: string }
     */
    socket.on('sendMessage', async (data) => {
      try {
        const chatId = data && data.chatId ? parseInt(data.chatId, 10) : null;
        const content = data && typeof data.content === 'string' ? data.content.trim() : null;

        // --- Input Validation ---
        if (!chatId || isNaN(chatId) || chatId <= 0) {
          return socket.emit('socketError', { event: 'sendMessage', message: 'Invalid Chat ID. Must be a positive integer.' });
        }
        if (!content || content === '') {
          return socket.emit('socketError', { event: 'sendMessage', message: 'Message content cannot be empty.' });
        }
        if (content.length > 2000) { // Max message length
          return socket.emit('socketError', { event: 'sendMessage', message: 'Message content is too long (max 2000 characters).' });
        }
        
        // --- Message Creation & Broadcast ---
        // chatService.createMessage includes authorization (user is in chat) and returns the full message object.
        const newMessage = await chatService.createMessage(chatId, socket.user.id, content);
        
        // Broadcast the new message to all clients in the specific chat room.
        io.to(chatId.toString()).emit('newMessage', newMessage); 
        console.log(`Message from ${socket.user.username} to chat ${chatId}: "${content}"`);
        
      } catch (error) {
        console.error(`Error in sendMessage for user ${socket.user.username}, data: ${JSON.stringify(data)}:`, error.message);
        socket.emit('socketError', { 
            event: 'sendMessage', 
            message: error.isOperational ? error.message : 'Failed to send message. An unexpected error occurred.' 
        });
      }
    });

    /**
     * Handles 'typing' event from a client.
     * Broadcasts typing status (true for typing, false for stopped typing) to other users in the chat room.
     * @param {object} data - Expected: { chatId: number, isTyping: boolean }
     */
    socket.on('typing', (data) => {
      const chatId = data && data.chatId ? parseInt(data.chatId, 10) : null;
      const isTyping = data && typeof data.isTyping === 'boolean' ? data.isTyping : null;

      if (!chatId || isNaN(chatId) || chatId <= 0 || isTyping === null) {
        console.warn(`Invalid typing event data from ${socket.user.username}:`, data);
        return; // Silently ignore invalid typing events or minor errors.
      }
      
      // Broadcast to other users in the room (excluding the sender of the typing event).
      socket.to(chatId.toString()).emit('userTyping', {
        userId: socket.user.id,
        username: socket.user.username, // Include username for easier display on client-side
        chatId: chatId,
        isTyping
      });
    });

    /**
     * Handles 'disconnect' event.
     * Called when a client connection is lost or explicitly closed.
     */
    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.user.username} (ID: ${socket.user.id}, Socket ID: ${socket.id})`);
      // Optional: Implement logic to notify other users in chats that this user has disconnected.
      // This would require tracking which chat rooms the socket was part of. Example:
      // socket.rooms.forEach(room => {
      //   if (room !== socket.id) { // Don't emit to the socket's own default room
      //     socket.to(room).emit('userLeftChat', { userId: socket.user.id, username: socket.user.username, chatId: room });
      //   }
      // });
    });
  });
}

module.exports = {
  initializeSocket,
};
