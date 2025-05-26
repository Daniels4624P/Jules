const db = require('../config/db');
const AppError = require('../utils/AppError');
const userService = require('./userService'); // Used for validating user existence

/**
 * Verifies if a user is a participant in a specific chat.
 * This function serves as an authorization check before performing actions on a chat.
 * It first ensures the chat exists, then checks for the user's participation.
 * @param {number} userId - The ID of the user.
 * @param {number} chatId - The ID of the chat.
 * @param {boolean} [expectUserInChat=true] - If true (default), throws an AppError if the user is not in the chat.
 *                                           If false, returns boolean without throwing for non-participation.
 * @returns {Promise<boolean>} True if the user is in the chat.
 * @throws {AppError} If chat not found (404), or if user not in chat and expectUserInChat is true (403).
 *                    Also throws for database errors (500).
 */
async function checkUserInChat(userId, chatId, expectUserInChat = true) {
  // First, ensure the chat itself exists. findChatById will throw if not found when expectChat=true.
  await findChatById(chatId, true); 

  const query = 'SELECT 1 FROM chat_participants WHERE user_id = $1 AND chat_id = $2';
  try {
    const { rows } = await db.query(query, [userId, chatId]);
    if (rows.length > 0) {
      return true; // User is a participant
    }
    // User is not a participant
    if (expectUserInChat) {
      // If user's participation is strictly required, throw an authorization error.
      throw new AppError(403, 'Access denied. You are not a participant in this chat.');
    }
    return false; // User is not in chat, but it was not strictly expected (e.g., for informational checks)
  } catch (error) {
    if (error instanceof AppError) throw error; // Re-throw AppErrors from findChatById or our own
    console.error('Error in checkUserInChat:', error);
    throw new AppError(500, 'Error verifying chat participation.');
  }
}


/**
 * Creates a new chat (either 1-on-1 or group) and adds specified users as participants.
 * Uses a database transaction to ensure atomicity.
 * @param {number[]} userIds - Array of user IDs to be included in the chat.
 * @param {string|null} [name] - Optional name for the chat (typically for group chats).
 * @param {boolean} isGroupChat - Indicates if the chat is a group chat.
 * @returns {Promise<object>} The newly created chat object, including participant details.
 * @throws {AppError} If any user in userIds does not exist (404 via userService), 
 *                    or for other database errors (500).
 */
async function createChat(userIds, name, isGroupChat) {
  const client = await db.pool.connect(); // Get a client from the pool for transaction
  try {
    await client.query('BEGIN'); // Start transaction

    // Validate all users exist *before* creating the chat or adding participants.
    // userService.findUserById will throw an AppError if a user is not found.
    for (const userId of userIds) {
        await userService.findUserById(userId, true); // expectUser = true
    }

    // Insert the new chat into the 'chats' table
    const chatQuery = 'INSERT INTO chats (name, is_group_chat) VALUES ($1, $2) RETURNING id, name, is_group_chat, created_at';
    const chatResult = await client.query(chatQuery, [name, isGroupChat]);
    const newChat = chatResult.rows[0];

    // Insert participants into the 'chat_participants' table
    const participantQuery = 'INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)';
    for (const userId of userIds) {
      await client.query(participantQuery, [newChat.id, userId]);
    }

    await client.query('COMMIT'); // Commit transaction

    // Fetch and return the newly created chat with comprehensive participant details for the response.
    // Assumes userIds[0] is a valid participant (e.g., the creator) to help build participant list.
    const createdChatDetails = await getUserChatsWithParticipants(newChat.id, userIds[0]); 
    return createdChatDetails[0] || newChat; // Fallback to newChat if details somehow not found
  } catch (error) {
    await client.query('ROLLBACK'); // Rollback transaction on error
    if (error instanceof AppError) throw error; // Re-throw known AppErrors
    console.error('Error in createChat:', error);
    throw new AppError(500, 'Could not create chat due to a server error.');
  } finally {
    client.release(); // Release client back to the pool
  }
}

/**
 * Helper function to fetch chat details along with its participants.
 * Used internally by createChat to provide a rich response.
 * @param {number} chatId - The ID of the chat to fetch.
 * @param {number} currentUserId - The ID of the user making the request (used to determine 'other_participants').
 * @returns {Promise<Array<object>>} An array containing the chat object with participant details, or empty if not found.
 * @throws {AppError} If database query fails (500).
 */
async function getUserChatsWithParticipants(chatId, currentUserId) {
    const query = `
    SELECT 
      c.id, 
      c.name, 
      c.is_group_chat, 
      c.created_at,
      (
        SELECT json_agg(json_build_object('id', u.id, 'username', u.username))
        FROM users u
        JOIN chat_participants cp_inner ON u.id = cp_inner.user_id
        WHERE cp_inner.chat_id = c.id AND cp_inner.user_id != $2 -- Exclude current user from 'other_participants'
      ) as other_participants,
      (
        SELECT json_agg(json_build_object('id', u.id, 'username', u.username))
        FROM users u
        JOIN chat_participants cp_all ON u.id = cp_all.user_id
        WHERE cp_all.chat_id = c.id -- All participants for this chat
      ) as all_participants
    FROM chats c
    WHERE c.id = $1; -- Filter by the specific chat ID
  `;
  try {
    const { rows } = await db.query(query, [chatId, currentUserId]);
    return rows.map(chat => ({
        ...chat,
        other_participants: chat.other_participants || [], // Ensure array even if no other participants
        all_participants: chat.all_participants || []   // Ensure array even if no participants (should not happen)
    }));
  } catch (error) {
    console.error('Error in getUserChatsWithParticipants:', error);
    throw new AppError(500, 'Could not retrieve detailed chat information.');
  }
}


/**
 * Fetches all chats a specific user is a participant in.
 * Includes details of other participants for each chat.
 * @param {number} userId - The ID of the user whose chats are to be fetched.
 * @returns {Promise<Array<object>>} A list of chat objects, each with participant details.
 * @throws {AppError} If the specified user does not exist (404 via userService), or for database errors (500).
 */
async function getUserChats(userId) {
  // Validate that the user for whom chats are being fetched actually exists.
  await userService.findUserById(userId, true); // expectUser = true

  const query = `
    SELECT 
      c.id, 
      c.name, 
      c.is_group_chat, 
      c.created_at,
      (
        SELECT json_agg(json_build_object('id', u.id, 'username', u.username))
        FROM users u
        JOIN chat_participants cp_inner ON u.id = cp_inner.user_id
        WHERE cp_inner.chat_id = c.id AND cp_inner.user_id != $1 -- Exclude the requesting user
      ) as other_participants,
      (
        SELECT json_agg(json_build_object('id', u.id, 'username', u.username))
        FROM users u
        JOIN chat_participants cp_all ON u.id = cp_all.user_id
        WHERE cp_all.chat_id = c.id
      ) as all_participants
    FROM chats c
    JOIN chat_participants cp ON c.id = cp.chat_id
    WHERE cp.user_id = $1 -- Filter chats where the user is a participant
    ORDER BY c.created_at DESC; -- Show most recent chats first
  `;
  try {
    const { rows } = await db.query(query, [userId]);
    return rows.map(chat => ({
        ...chat,
        other_participants: chat.other_participants || [],
        all_participants: chat.all_participants || []
    }));
  } catch (error) {
    console.error('Error in getUserChats:', error);
    throw new AppError(500, 'Could not retrieve user chats.');
  }
}

/**
 * Fetches messages for a given chat ID with pagination.
 * Ensures the requesting user is a participant of the chat before fetching messages.
 * @param {number} currentUserId - The ID of the user requesting messages (for authorization).
 * @param {number} chatId - The ID of the chat whose messages are to be fetched.
 * @param {number} [limit=20] - Number of messages to fetch per page.
 * @param {number} [offset=0] - Number of messages to skip (for pagination).
 * @returns {Promise<Array<object>>} A list of message objects, including sender details.
 * @throws {AppError} If user not in chat (403 via checkUserInChat), chat not found (404 via checkUserInChat), 
 *                    or for database errors (500).
 */
async function getChatMessages(currentUserId, chatId, limit = 20, offset = 0) {
  // Authorize: ensure user is part of the chat. checkUserInChat throws AppError if not.
  await checkUserInChat(currentUserId, chatId, true); 

  const query = `
    SELECT m.id, m.chat_id, m.content, m.created_at, 
           json_build_object('id', u.id, 'username', u.username) as sender
    FROM messages m
    JOIN users u ON m.sender_id = u.id
    WHERE m.chat_id = $1
    ORDER BY m.created_at ASC  -- Oldest messages first for typical chat display (client prepends)
    LIMIT $2 OFFSET $3;
  `;
  try {
    const { rows } = await db.query(query, [chatId, limit, offset]);
    return rows;
  } catch (error) {
    console.error('Error in getChatMessages:', error);
    throw new AppError(500, 'Could not retrieve chat messages.');
  }
}

/**
 * Inserts a new message into the database for a specific chat.
 * Ensures the sender is a participant of the chat before creating the message.
 * @param {number} chatId - The ID of the chat where the message is being sent.
 * @param {number} senderId - The ID of the user sending the message.
 * @param {string} content - The content of the message.
 * @returns {Promise<object>} The newly created message object, including sender details.
 * @throws {AppError} If sender not in chat (403 via checkUserInChat), chat not found (404 via checkUserInChat),
 *                    or for database/validation errors (500).
 */
async function createMessage(chatId, senderId, content) {
  // Authorize: ensure sender is part of the chat.
  await checkUserInChat(senderId, chatId, true); 

  const query = `
    INSERT INTO messages (chat_id, sender_id, content) 
    VALUES ($1, $2, $3) 
    RETURNING id, chat_id, sender_id, content, created_at;
  `;
  try {
    const { rows } = await db.query(query, [chatId, senderId, content]);
    const newMessage = rows[0];
    if (newMessage) {
        // Enrich the message with sender's username for immediate use by clients.
        const senderDetails = await userService.findUserById(newMessage.sender_id);
        if (!senderDetails) {
            // This should ideally not happen if senderId was validated by checkUserInChat implicitly.
            throw new AppError(500, 'Failed to retrieve sender details for the new message.');
        }
        return { ...newMessage, sender: { id: senderDetails.id, username: senderDetails.username } };
    }
    // This case should ideally not be reached if the INSERT query was successful and RETURNING was used.
    throw new AppError(500, 'Message creation failed to return the new message details.');
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error in createMessage:', error);
    throw new AppError(500, 'Could not create message due to a server error.');
  }
}

/**
 * Searches chats for a specific user based on a search term.
 * The search term is matched against chat names (for group chats) 
 * or usernames of other participants (for 1-on-1 and group chats).
 * @param {number} userId - The ID of the user performing the search.
 * @param {string} searchTerm - The term to search for.
 * @returns {Promise<Array<object>>} A list of matching chat objects, with participant details.
 * @throws {AppError} If the searching user does not exist (404 via userService), or for database errors (500).
 */
async function searchUserChats(userId, searchTerm) {
  // Validate that the user performing the search exists.
  await userService.findUserById(userId, true);

  const query = `
    SELECT DISTINCT -- Ensure each chat appears only once
      c.id, 
      c.name, 
      c.is_group_chat, 
      c.created_at,
      (
        SELECT json_agg(json_build_object('id', u_other.id, 'username', u_other.username))
        FROM users u_other
        JOIN chat_participants cp_inner ON u_other.id = cp_inner.user_id
        WHERE cp_inner.chat_id = c.id AND cp_inner.user_id != $1 -- Other participants
      ) as other_participants,
       (
        SELECT json_agg(json_build_object('id', u_all_part.id, 'username', u_all_part.username))
        FROM users u_all_part -- Renamed to avoid conflict
        JOIN chat_participants cp_all_users ON u_all_part.id = cp_all_users.user_id
        WHERE cp_all_users.chat_id = c.id -- All participants
      ) as all_participants
    FROM chats c
    JOIN chat_participants cp_user ON c.id = cp_user.chat_id -- Link to current user's participation
    LEFT JOIN chat_participants cp_search_part ON c.id = cp_search_part.chat_id -- Link for searching participants
    LEFT JOIN users u_search ON cp_search_part.user_id = u_search.id -- User details for searched participants
    WHERE 
      cp_user.user_id = $1 AND ( -- The user must be part of the chat
        c.name ILIKE $2 OR -- Chat name matches (case-insensitive)
        -- For 1-on-1 chats: other participant's username matches
        (c.is_group_chat = FALSE AND u_search.id != $1 AND u_search.username ILIKE $2) OR
        -- For group chats: any participant's username matches (including self, can be filtered client-side if needed)
        (c.is_group_chat = TRUE AND EXISTS (
          SELECT 1 FROM chat_participants cp_group_search
          JOIN users u_group_search ON cp_group_search.user_id = u_group_search.id
          WHERE cp_group_search.chat_id = c.id AND u_group_search.username ILIKE $2
        ))
      )
    ORDER BY c.created_at DESC;
  `;
  const searchTermLike = `%${searchTerm}%`; // Prepare search term for ILIKE
  try {
    const { rows } = await db.query(query, [userId, searchTermLike]);
     return rows.map(chat => ({
        ...chat,
        other_participants: chat.other_participants || [],
        all_participants: chat.all_participants || []
    }));
  } catch (error) {
    console.error('Error in searchUserChats:', error);
    throw new AppError(500, 'Could not perform chat search.');
  }
}


/**
 * Finds a specific chat by its ID.
 * @param {number} chatId - The ID of the chat to find.
 * @param {boolean} [expectChat=false] - If true, throws an AppError if the chat is not found.
 * @returns {Promise<object|undefined>} The chat object if found, otherwise undefined (or throws if expectChat is true).
 * @throws {AppError} If expectChat is true and chat not found (404), or for database errors (500).
 */
async function findChatById(chatId, expectChat = false) {
  const query = 'SELECT id, name, is_group_chat, created_at FROM chats WHERE id = $1';
  try {
    const { rows } = await db.query(query, [chatId]);
    if (!rows[0] && expectChat) {
      throw new AppError(404, `Chat with ID ${chatId} not found.`);
    }
    return rows[0];
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error('Error in findChatById:', error);
    throw new AppError(500, 'Could not find chat due to a server error.');
  }
}


module.exports = {
  createChat,
  getUserChats,
  getChatMessages,
  createMessage,
  searchUserChats,
  findChatById,
  checkUserInChat, 
};
