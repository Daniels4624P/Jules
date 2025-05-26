# Jules - Real-Time Chat API

Jules is a real-time chat application backend built with Node.js, Express, Socket.IO, and PostgreSQL. It features JWT-based authentication, real-time messaging, typing indicators, chat creation, and message history.

## Features

*   **User Authentication:**
    *   User registration and login.
    *   JWT (JSON Web Tokens) for secure authentication.
    *   Access and Refresh tokens stored in HttpOnly cookies for enhanced security (mitigates XSS).
    *   Password hashing using `bcrypt`.
*   **Real-Time Chat:**
    *   Socket.IO for bidirectional, real-time communication.
    *   Create 1-on-1 and group chats.
    *   Send and receive messages in real-time within chat rooms.
    *   Typing indicators to show when a user is typing.
*   **Chat Management:**
    *   Fetch user's chat list.
    *   Fetch chat message history with pagination.
    *   Search for chats by name or participant usernames.
*   **Database:**
    *   PostgreSQL for persistent data storage.
    *   Schema includes users, chats, messages, and participants.
*   **Error Handling:**
    *   Centralized error handling middleware.
    *   Custom `AppError` class for operational errors.
*   **Development & Testing:**
    *   Environment variable configuration using `.env` files.
    *   Unit tests for services and controllers using Jest.
    *   `nodemon` for automatic server restarts during development.

## Prerequisites

Before you begin, ensure you have the following installed on your system:

*   [Node.js](https://nodejs.org/) (v14.x or later recommended)
*   [npm](https://www.npmjs.com/) (usually comes with Node.js)
*   [PostgreSQL](https://www.postgresql.org/) (v12.x or later recommended)

## Setup and Installation

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/your-username/jules-chat-api.git # Replace with your repo URL if forked
    cd jules-chat-api
    ```

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Set up PostgreSQL Database:**
    *   **Connect to PostgreSQL:**
        Open your terminal and connect to PostgreSQL using `psql` or your preferred GUI tool (e.g., pgAdmin).
        ```bash
        psql -U postgres # Or your PostgreSQL superuser
        ```
    *   **Create a Database User (Recommended):**
        Replace `jules_user` and `your_secure_password` with your desired credentials.
        ```sql
        CREATE USER jules_user WITH PASSWORD 'your_secure_password';
        ```
    *   **Create the Database:**
        Replace `jules_chat_db` with your desired database name. Grant privileges to your new user.
        ```sql
        CREATE DATABASE jules_chat_db OWNER jules_user;
        ```
    *   **Run Database Schema Script:**
        Connect to your newly created database as `jules_user` and run the schema script.
        ```bash
        psql -U jules_user -d jules_chat_db -f src/models/db_schema.sql
        ```
        You might be prompted for the password for `jules_user`.

4.  **Configure Environment Variables:**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   Open the `.env` file and update the variables with your settings:

        *   `DB_USER`: Your PostgreSQL username (e.g., `jules_user`).
        *   `DB_HOST`: Database server host (usually `localhost`).
        *   `DB_DATABASE`: Your PostgreSQL database name (e.g., `jules_chat_db`).
        *   `DB_PASSWORD`: Password for your PostgreSQL user.
        *   `DB_PORT`: Port PostgreSQL is running on (default: `5432`).
        *   `JWT_SECRET`: A long, random, and strong string for signing JWT access tokens.
            *   Generate using: `openssl rand -hex 32` or a password manager.
        *   `REFRESH_TOKEN_SECRET`: A different long, random, and strong string for signing JWT refresh tokens.
            *   Generate similarly to `JWT_SECRET`.
        *   `PORT`: The port the application will run on (e.g., `3000`).
        *   `NODE_ENV`: Set to `development` for development features (like detailed error stacks) or `production` for production optimizations.
        *   `FRONTEND_URL`: The URL of your frontend application (e.g., `http://localhost:5500` or your production frontend domain). Used for CORS configuration in Socket.IO.

## Running the Application

*   **Production Mode:**
    ```bash
    npm start 
    ```
    (This typically runs `node server.js` as defined in `package.json`'s `scripts.start` if you have one, otherwise use `node server.js` directly)

*   **Development Mode (with automatic restarts):**
    Ensure you have `nodemon` installed (`npm install -g nodemon` or as a dev dependency).
    Add a script to your `package.json` if it's not already there:
    ```json
    "scripts": {
      "start": "node server.js",
      "dev": "NODE_ENV=development nodemon server.js", // Ensure NODE_ENV is set for dev
      "test": "NODE_ENV=test jest --detectOpenHandles"
    }
    ```
    Then run:
    ```bash
    npm run dev
    ```

## Running Tests

To run the unit tests:

```bash
npm test
```
This command will execute Jest tests and look for files ending in `.test.js` within the `src` directory (or as configured in Jest settings). Ensure your `NODE_ENV` is set to `test` for tests, which the script in `package.json` handles.

## API Endpoints (Overview)

A brief overview of the main API endpoints:

*   **Authentication (`/api/auth`)**
    *   `POST /register`: Register a new user.
    *   `POST /login`: Log in an existing user, sets HttpOnly cookies for tokens.
    *   `POST /refresh-token`: Obtain a new access token using a refresh token.
    *   `POST /logout`: Log out a user by clearing token cookies.

*   **Chats (`/api/chats`)** (Protected: Requires authentication)
    *   `POST /`: Create a new chat (1-on-1 or group).
    *   `GET /`: Get all chats for the current user.
    *   `GET /search`: Search chats for the current user by name or participant.
    *   `GET /:chatId/messages`: Get messages for a specific chat (paginated).
    *   `POST /:chatId/messages`: Create a new message in a specific chat.

## Socket Events (Overview)

Key client-emitted and server-emitted socket events for real-time communication:

*   **Client to Server:**
    *   `joinChat ({ chatId })`: User requests to join a chat room.
    *   `leaveChat ({ chatId })`: User requests to leave a chat room.
    *   `sendMessage ({ chatId, content })`: User sends a message to a chat.
    *   `typing ({ chatId, isTyping })`: User indicates they are typing or stopped typing.

*   **Server to Client:**
    *   `connect`: Confirms connection to the socket server.
    *   `disconnect`: Indicates disconnection from the server.
    *   `socketError ({ event, message })`: Reports an error related to a socket event.
    *   `chatJoined ({ chatId, message })`: Confirms user successfully joined a chat.
    *   `chatLeft ({ chatId, message })`: Confirms user successfully left a chat.
    *   `newMessage (messageObject)`: Broadcasts a new message to participants in a chat.
    *   `userTyping ({ userId, username, chatId, isTyping })`: Broadcasts typing status to other participants.

## Project Structure

```
jules-chat-api/
├── public/                 # Static frontend files (HTML, CSS, client-side JS)
│   ├── css/
│   ├── js/
│   └── index.html
│   └── chat.html
├── src/
│   ├── config/             # Configuration files (e.g., db.js)
│   │   └── __mocks__/      # Mocks for testing
│   ├── controllers/        # Request handlers for API routes
│   ├── middleware/         # Custom Express middleware (e.g., auth.js)
│   ├── models/             # Database schema (db_schema.sql)
│   ├── routes/             # Express route definitions
│   ├── services/           # Business logic and database interactions
│   ├── socket/             # Socket.IO connection and event handling
│   ├── utils/              # Utility functions (AppError, catchAsync, authUtils, etc.)
│   └── __tests__/          # Jest unit tests
├── .env.example            # Example environment variables file
├── .gitignore              # Specifies intentionally untracked files that Git should ignore
├── package.json            # Project metadata and dependencies
├── package-lock.json       # Records exact versions of dependencies
├── README.md               # This file
└── server.js               # Main application entry point
```

## Contributing

Contributions are welcome! If you'd like to contribute, please follow these steps:

1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'Add some feature'`).
5.  Push to the branch (`git push origin feature/your-feature-name`).
6.  Open a Pull Request.

Please ensure your code adheres to the existing style and that all tests pass.