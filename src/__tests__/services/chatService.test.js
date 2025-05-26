const chatService = require('../../services/chatService');
const userService = require('../../services/userService'); // For mocking findUserById
const db = require('../../config/db'); // Mocked
const AppError = require('../../utils/AppError');

jest.mock('../../config/db');
jest.mock('../../services/userService'); // Mock userService to control its behavior

describe('ChatService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('checkUserInChat', () => {
    it('should return true if user is in chat', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Chat' }] }); // Mock findChatById
      db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] }); // Mock participant check
      
      const result = await chatService.checkUserInChat(1, 1, false); // expectUserInChat = false
      expect(result).toBe(true);
      expect(db.query).toHaveBeenCalledTimes(2); // findChatById + participant check
    });

    it('should throw AppError if chat not found', async () => {
      db.query.mockResolvedValueOnce({ rows: [] }); // Mock findChatById returning no chat
      
      await expect(chatService.checkUserInChat(1, 999))
        .rejects.toEqual(new AppError(404, 'Chat with ID 999 not found.'));
      expect(db.query).toHaveBeenCalledTimes(1); // Only findChatById called
    });
    
    it('should return false if user not in chat and expectUserInChat is false', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Chat' }] }); // Mock findChatById
        db.query.mockResolvedValueOnce({ rows: [] }); // Mock participant check - no rows
        const result = await chatService.checkUserInChat(1, 1, false);
        expect(result).toBe(false);
    });

    it('should throw AppError if user not in chat and expectUserInChat is true', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: 1, name: 'Test Chat' }] }); // Mock findChatById
      db.query.mockResolvedValueOnce({ rows: [] }); // Mock participant check - no rows
      
      await expect(chatService.checkUserInChat(1, 1, true)) // expectUserInChat = true by default
        .rejects.toEqual(new AppError(403, 'Access denied. You are not a participant in this chat.'));
    });
  });

  describe('createChat', () => {
    it('should create a new chat and add participants', async () => {
      const userIds = [1, 2];
      const chatName = 'Test Chat';
      const isGroupChat = false;
      const mockNewChat = { id: 1, name: chatName, is_group_chat: isGroupChat, created_at: new Date() };
      const mockUser = { id: 1, username: 'user1' };

      userService.findUserById.mockResolvedValue(mockUser); // Assume users exist
      
      // Mock transaction behavior for db.pool.connect()
      const mockClient = {
        query: jest.fn()
            .mockResolvedValueOnce({ rows: [mockNewChat] }) // INSERT into chats
            .mockResolvedValueOnce({}) // INSERT into chat_participants (user 1)
            .mockResolvedValueOnce({}) // INSERT into chat_participants (user 2)
            .mockResolvedValueOnce({ rows: [mockNewChat] }), // For getUserChatsWithParticipants call
        release: jest.fn(),
        BEGIN: jest.fn().mockResolvedValue({}),
        COMMIT: jest.fn().mockResolvedValue({}),
        ROLLBACK: jest.fn().mockResolvedValue({})
      };
      db.pool.connect.mockResolvedValue(mockClient);
      mockClient.query.mockImplementation((queryText) => {
        if (queryText.startsWith('INSERT INTO chats')) return Promise.resolve({ rows: [mockNewChat] });
        if (queryText.startsWith('INSERT INTO chat_participants')) return Promise.resolve({});
        if (queryText.startsWith('SELECT \n    c.id')) return Promise.resolve({ rows: [{...mockNewChat, other_participants:[], all_participants:[]}] }); // for getUserChatsWithParticipants
        return Promise.resolve({});
      });


      const chat = await chatService.createChat(userIds, chatName, isGroupChat);
      
      expect(chat).toBeDefined();
      expect(chat.id).toBe(mockNewChat.id);
      expect(userService.findUserById).toHaveBeenCalledTimes(userIds.length);
      expect(db.pool.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chats'), [chatName, isGroupChat]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chat_participants'), [mockNewChat.id, userIds[0]]);
      expect(mockClient.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO chat_participants'), [mockNewChat.id, userIds[1]]);
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });

    it('should throw AppError if a user in userIds does not exist', async () => {
      userService.findUserById
        .mockResolvedValueOnce({ id: 1, username: 'user1' }) // First user exists
        .mockRejectedValueOnce(new AppError(404, 'User with ID 2 not found.')); // Second user doesn't

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
        BEGIN: jest.fn().mockResolvedValue({}),
        ROLLBACK: jest.fn().mockResolvedValue({}) // Ensure rollback is called
      };
      db.pool.connect.mockResolvedValue(mockClient);

      await expect(chatService.createChat([1, 2], 'Group Chat', true))
        .rejects.toEqual(new AppError(404, 'User with ID 2 not found.'));
      
      expect(db.pool.connect).toHaveBeenCalledTimes(1);
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK'); // Check if rollback was called
      expect(mockClient.release).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserChats', () => {
    it('should fetch chats for a user', async () => {
      const userId = 1;
      const mockChats = [{ id: 1, name: 'Chat 1' }, { id: 2, name: 'Chat 2' }];
      userService.findUserById.mockResolvedValue({ id: userId, username: 'user1' }); // User exists
      db.query.mockResolvedValueOnce({ rows: mockChats });

      const chats = await chatService.getUserChats(userId);
      
      expect(chats).toEqual(mockChats.map(c => ({ ...c, other_participants: [], all_participants: [] })));
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM chats c'), [userId]);
    });

     it('should throw AppError if user for getUserChats does not exist', async () => {
        userService.findUserById.mockRejectedValueOnce(new AppError(404, 'User not found.'));
        await expect(chatService.getUserChats(999))
            .rejects.toEqual(new AppError(404, 'User not found.'));
    });
  });

  describe('getChatMessages', () => {
    const currentUserId = 1;
    const chatId = 1;
    it('should fetch messages for a chat if user is a participant', async () => {
      const mockMessages = [{ id: 1, content: 'Hello' }];
      // Mock checkUserInChat (indirectly, by mocking its db calls)
      db.query.mockResolvedValueOnce({ rows: [{ id: chatId, name: 'Test Chat' }] }); // findChatById
      db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] }); // checkUserInChat participant check
      db.query.mockResolvedValueOnce({ rows: mockMessages }); // actual getChatMessages query

      const messages = await chatService.getChatMessages(currentUserId, chatId);
      
      expect(messages).toEqual(mockMessages);
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('FROM messages m'), [chatId, 20, 0]);
    });

    it('should throw AppError if user is not a participant (via checkUserInChat)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: chatId, name: 'Test Chat' }] }); // findChatById
      db.query.mockResolvedValueOnce({ rows: [] }); // checkUserInChat - user not participant
      
      await expect(chatService.getChatMessages(currentUserId, chatId))
        .rejects.toEqual(new AppError(403, 'Access denied. You are not a participant in this chat.'));
    });
  });

  describe('createMessage', () => {
    const chatId = 1;
    const senderId = 1;
    const content = 'Hello world';
    const mockMessage = { id: 1, chat_id: chatId, sender_id: senderId, content: content, created_at: new Date() };
    const mockSender = { id: senderId, username: 'senderUser' };

    it('should create a message if user is a participant', async () => {
      // Mock checkUserInChat (indirectly)
      db.query.mockResolvedValueOnce({ rows: [{ id: chatId, name: 'Test Chat' }] }); // findChatById for checkUserInChat
      db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] }); // participant check for checkUserInChat
      
      db.query.mockResolvedValueOnce({ rows: [mockMessage] }); // INSERT into messages
      userService.findUserById.mockResolvedValueOnce(mockSender); // Fetch sender details

      const message = await chatService.createMessage(chatId, senderId, content);
      
      expect(message).toEqual({ ...mockMessage, sender: mockSender });
      expect(db.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO messages'), [chatId, senderId, content]);
      expect(userService.findUserById).toHaveBeenCalledWith(senderId);
    });

    it('should throw AppError if user is not a participant (via checkUserInChat)', async () => {
      db.query.mockResolvedValueOnce({ rows: [{ id: chatId, name: 'Test Chat' }] }); // findChatById
      db.query.mockResolvedValueOnce({ rows: [] }); // checkUserInChat - user not participant
      
      await expect(chatService.createMessage(chatId, senderId, content))
        .rejects.toEqual(new AppError(403, 'Access denied. You are not a participant in this chat.'));
    });

    it('should throw AppError if sender details not found after message creation', async () => {
        db.query.mockResolvedValueOnce({ rows: [{ id: chatId, name: 'Test Chat' }] }); 
        db.query.mockResolvedValueOnce({ rows: [{ '1': 1 }] }); 
        db.query.mockResolvedValueOnce({ rows: [mockMessage] }); 
        userService.findUserById.mockResolvedValueOnce(null); // Sender not found

        await expect(chatService.createMessage(chatId, senderId, content))
            .rejects.toEqual(new AppError(500, 'Failed to retrieve sender details for new message.'));
    });
  });
  
  describe('findChatById', () => {
    it('should find and return an existing chat by ID', async () => {
        const mockChat = { id: 1, name: 'Test Chat', is_group_chat: false, created_at: new Date() };
        db.query.mockResolvedValueOnce({ rows: [mockChat] });

        const chat = await chatService.findChatById(1);
        expect(chat).toEqual(mockChat);
        expect(db.query).toHaveBeenCalledWith(
            'SELECT id, name, is_group_chat, created_at FROM chats WHERE id = $1',
            [1]
        );
    });

    it('should return undefined if chat does not exist and expectChat is false', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        const chat = await chatService.findChatById(999, false);
        expect(chat).toBeUndefined();
    });

    it('should throw AppError if chat does not exist and expectChat is true', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        await expect(chatService.findChatById(999, true))
            .rejects.toEqual(new AppError(404, 'Chat with ID 999 not found.'));
    });
  });

});
