// Load environment variables from .env file at the very beginning
require('dotenv').config(); 

const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path'); // Node.js path module for working with file and directory paths
const http = require('http'); // Node.js HTTP module
const { Server } = require("socket.io"); // Socket.IO server

// Import custom modules
const authRoutes = require('./src/routes/authRoutes');
const chatRoutes = require('./src/routes/chatRoutes');
const { initializeSocket } = require('./src/socket/socketHandler');
const AppError = require('./src/utils/AppError'); // Custom error class
const globalErrorHandler = require('./src/utils/errorHandler'); // Global error handling middleware

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000; // Use port from environment or default to 3000

// --- Core Middleware ---
// Parse JSON request bodies (e.g., for API requests)
app.use(express.json()); 
// Parse URL-encoded request bodies (e.g., from HTML form submissions)
app.use(express.urlencoded({ extended: true })); 
// Parse cookies attached to the client request object, making them available in req.cookies
app.use(cookieParser()); 

// --- Static Files ---
// Serve static files (HTML, CSS, client-side JS) from the 'public' directory.
// path.join ensures cross-platform compatibility for directory paths.
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---
// Mount authentication-related routes (register, login, logout, refresh-token) under '/api/auth'
app.use('/api/auth', authRoutes);
// Mount chat-related routes (create chat, get chats, get messages, etc.) under '/api/chats'
app.use('/api/chats', chatRoutes);

// --- HTML Serving Routes ---
// Route to serve the main chat page.
app.get('/chat', (req, res) => {
    // Server-side authentication for direct access to /chat.html is implicitly handled
    // by the client-side JavaScript (in public/js/chat.js), which should redirect to 
    // the login page if no valid token/session is found.
    // API calls and socket connections made from chat.html are protected by JWT middleware.
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Routes to serve the login/registration page (index.html).
// This handles the root path, /login, and /index.html.
app.get(['/', '/login', '/index.html'], (req, res) => {
    // Client-side logic (in public/js/auth.js) can redirect to /chat.html 
    // if the user is already authenticated (e.g., by checking for existing valid cookies).
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- 404 Handler for API Routes ---
// This middleware catches all requests to '/api/*' that haven't been handled by previous route handlers.
// It creates a new AppError with a 404 status and passes it to the global error handler.
app.all('/api/*', (req, res, next) => {
    // req.originalUrl preserves the full, original URL of the request.
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// --- Global Error Handling Middleware ---
// This middleware is the final error handler for all Express errors.
// It catches errors passed by 'next(err)' from any part of the application.
// It must be defined after all other app.use() and routes calls to function as a catch-all.
app.use(globalErrorHandler);

// --- HTTP Server and Socket.IO Setup ---
// Create an HTTP server using the Express app. This is necessary for Socket.IO.
const httpServer = http.createServer(app);

// Initialize Socket.IO server, attaching it to the HTTP server.
const io = new Server(httpServer, {
  cors: {
    // Configure Cross-Origin Resource Sharing (CORS) for Socket.IO.
    // Allow connections from the frontend URL specified in the .env file.
    // If FRONTEND_URL is not set, it defaults to allowing all origins ("*") - useful for development.
    // For production, FRONTEND_URL should be explicitly set to the domain of your frontend application.
    origin: process.env.FRONTEND_URL || "*", 
    methods: ["GET", "POST"], // Specify allowed HTTP methods for CORS requests.
    credentials: true // Allow cookies to be sent with CORS requests (e.g., for Socket.IO JWT authentication via cookies).
  }
});

// Initialize custom Socket.IO event handlers and authentication middleware.
// This function (from src/socket/socketHandler.js) sets up all real-time communication logic.
initializeSocket(io);

// --- Server Startup ---
// Check for essential JWT secrets before attempting to start the server.
// These secrets are critical for token generation and validation.
if (process.env.JWT_SECRET && process.env.REFRESH_TOKEN_SECRET) {
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Current Node Environment: ${process.env.NODE_ENV || 'development (default)'}`);
  });
} else {
  // Log a fatal error and exit if critical environment variables are missing.
  // This prevents the server from running in an insecure or non-functional state.
  console.error('FATAL ERROR: JWT_SECRET or REFRESH_TOKEN_SECRET is not defined in .env file.');
  console.log('Please ensure these environment variables are set for proper token generation and validation.');
  process.exit(1); // Exit the process with an error code, indicating a failure.
}
