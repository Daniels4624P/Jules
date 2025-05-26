const userService = require('../../services/userService');
const db = require('../../config/db'); // This will be the mocked version due to __mocks__
const AppError = require('../../utils/AppError');

jest.mock('../../config/db'); // Automatically uses src/config/__mocks__/db.js

describe('UserService', () => {
  afterEach(() => {
    // Clear all mock implementations and call history after each test
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      const mockUser = { id: 1, username: 'testuser', created_at: new Date().toISOString() };
      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const user = await userService.createUser('testuser', 'hashedpassword');
      
      expect(user).toEqual(mockUser);
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledWith(
        'INSERT INTO users(username, password_hash) VALUES($1, $2) RETURNING id, username, created_at',
        ['testuser', 'hashedpassword']
      );
    });

    it('should throw AppError for unique constraint violation (username exists)', async () => {
      const dbError = new Error('duplicate key value violates unique constraint "users_username_key"');
      dbError.code = '23505'; // PostgreSQL error code for unique_violation
      dbError.constraint = 'users_username_key';
      db.query.mockRejectedValueOnce(dbError);

      await expect(userService.createUser('testuser', 'hashedpassword'))
        .rejects.toThrow(AppError);
      
      await expect(userService.createUser('testuser', 'hashedpassword'))
        .rejects.toEqual(new AppError(409, 'Username already exists.'));
        
      expect(db.query).toHaveBeenCalledTimes(2); // Called twice due to two expect blocks
    });

    it('should throw AppError for other database errors', async () => {
      db.query.mockRejectedValueOnce(new Error('Some generic DB error'));

      await expect(userService.createUser('testuser', 'hashedpassword'))
        .rejects.toThrow(AppError);

      await expect(userService.createUser('testuser', 'hashedpassword'))
        .rejects.toEqual(new AppError(500, 'Could not create user due to a server error.'));
        
      expect(db.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('findUserByUsername', () => {
    it('should find and return an existing user', async () => {
      const mockUser = { id: 1, username: 'testuser', password_hash: 'hash', created_at: new Date().toISOString() };
      db.query.mockResolvedValueOnce({ rows: [mockUser] });

      const user = await userService.findUserByUsername('testuser');
      
      expect(user).toEqual(mockUser);
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(db.query).toHaveBeenCalledWith(
        'SELECT id, username, password_hash, created_at FROM users WHERE username = $1',
        ['testuser']
      );
    });

    it('should return undefined if user does not exist and expectUser is false', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      const user = await userService.findUserByUsername('nonexistentuser');
      
      expect(user).toBeUndefined();
      expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should throw AppError if user does not exist and expectUser is true', async () => {
      db.query.mockResolvedValueOnce({ rows: [] });

      await expect(userService.findUserByUsername('nonexistentuser', true))
        .rejects.toThrow(AppError);
      
      await expect(userService.findUserByUsername('nonexistentuser', true))
        .rejects.toEqual(new AppError(404, 'User not found.'));
        
      expect(db.query).toHaveBeenCalledTimes(2);
    });

    it('should throw AppError for database errors', async () => {
      db.query.mockRejectedValueOnce(new Error('Some generic DB error'));

      await expect(userService.findUserByUsername('testuser'))
        .rejects.toThrow(AppError);
      
      await expect(userService.findUserByUsername('testuser'))
        .rejects.toEqual(new AppError(500, 'Could not find user due to a server error.'));
      
      expect(db.query).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('findUserById', () => {
    it('should find and return an existing user by ID', async () => {
        const mockUser = { id: 1, username: 'testuser', created_at: new Date().toISOString() };
        db.query.mockResolvedValueOnce({ rows: [mockUser] });

        const user = await userService.findUserById(1);
        expect(user).toEqual(mockUser);
        expect(db.query).toHaveBeenCalledTimes(1);
        expect(db.query).toHaveBeenCalledWith(
            'SELECT id, username, created_at FROM users WHERE id = $1',
            [1]
        );
    });

    it('should return undefined if user does not exist by ID and expectUser is false', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        const user = await userService.findUserById(999);
        expect(user).toBeUndefined();
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should throw AppError if user does not exist by ID and expectUser is true', async () => {
        db.query.mockResolvedValueOnce({ rows: [] });
        await expect(userService.findUserById(999, true))
            .rejects.toEqual(new AppError(404, 'User with ID 999 not found.'));
        expect(db.query).toHaveBeenCalledTimes(1);
    });

    it('should throw AppError for database errors when finding by ID', async () => {
        db.query.mockRejectedValueOnce(new Error('DB error'));
        await expect(userService.findUserById(1))
            .rejects.toEqual(new AppError(500, 'Could not find user by ID due to a server error.'));
        expect(db.query).toHaveBeenCalledTimes(1);
    });
  });
});
