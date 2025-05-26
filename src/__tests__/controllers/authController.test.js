const authController = require('../../controllers/authController');
const userService = require('../../services/userService');
const authUtils = require('../../utils/authUtils');
const AppError = require('../../utils/AppError');

// Mock services and utils
jest.mock('../../services/userService');
jest.mock('../../utils/authUtils');

describe('AuthController', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      body: {},
      cookies: {},
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a user successfully and return 201', async () => {
      mockReq.body = { username: 'newuser', password: 'password123' };
      
      userService.findUserByUsername.mockResolvedValueOnce(null); // No existing user
      authUtils.hashPassword.mockResolvedValueOnce('hashedpassword');
      userService.createUser.mockResolvedValueOnce({ id: 1, username: 'newuser' });

      await authController.register(mockReq, mockRes, mockNext);

      expect(userService.findUserByUsername).toHaveBeenCalledWith('newuser');
      expect(authUtils.hashPassword).toHaveBeenCalledWith('password123');
      expect(userService.createUser).toHaveBeenCalledWith('newuser', 'hashedpassword');
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'User created successfully.',
        user: { id: 1, username: 'newuser' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next with AppError if username is too short', async () => {
      mockReq.body = { username: 'nu', password: 'password123' };
      await authController.register(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new AppError(400, 'Username must be a string and at least 3 characters long.'));
    });
    
    it('should call next with AppError if password is too short', async () => {
      mockReq.body = { username: 'newuser', password: '123' };
      await authController.register(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new AppError(400, 'Password must be a string and at least 6 characters long.'));
    });

    it('should call next with AppError if user already exists', async () => {
      mockReq.body = { username: 'existinguser', password: 'password123' };
      userService.findUserByUsername.mockResolvedValueOnce({ id: 1, username: 'existinguser' });

      await authController.register(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(new AppError(409, 'Username already taken.'));
      expect(authUtils.hashPassword).not.toHaveBeenCalled();
      expect(userService.createUser).not.toHaveBeenCalled();
    });
    
    it('should call next with error if createUser fails', async () => {
        mockReq.body = { username: 'newuser', password: 'password123' };
        userService.findUserByUsername.mockResolvedValueOnce(null);
        authUtils.hashPassword.mockResolvedValueOnce('hashedpassword');
        const createUserError = new Error("DB create error");
        userService.createUser.mockRejectedValueOnce(createUserError);

        await authController.register(mockReq, mockRes, mockNext);
        expect(mockNext).toHaveBeenCalledWith(createUserError);
    });
  });

  describe('login', () => {
    it('should login a user successfully and set cookies', async () => {
      mockReq.body = { username: 'testuser', password: 'password123' };
      const mockUser = { id: 1, username: 'testuser', password_hash: 'hashedpassword' };
      
      userService.findUserByUsername.mockResolvedValueOnce(mockUser);
      authUtils.comparePassword.mockResolvedValueOnce(true); // Password matches
      authUtils.generateAccessToken.mockReturnValueOnce('accesstoken123');
      authUtils.generateRefreshToken.mockReturnValueOnce('refreshtoken123');

      await authController.login(mockReq, mockRes, mockNext);

      expect(userService.findUserByUsername).toHaveBeenCalledWith('testuser', true);
      expect(authUtils.comparePassword).toHaveBeenCalledWith('password123', 'hashedpassword');
      expect(authUtils.generateAccessToken).toHaveBeenCalledWith({ id: 1, username: 'testuser' });
      expect(authUtils.generateRefreshToken).toHaveBeenCalledWith({ id: 1, username: 'testuser' });
      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('accessToken', 'accesstoken123', expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refreshToken', 'refreshtoken123', expect.any(Object));
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Logged in successfully.',
        user: { id: 1, username: 'testuser' },
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should call next with AppError if username is not provided', async () => {
      mockReq.body = { password: 'password123' };
      await authController.login(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new AppError(400, 'Username is required.'));
    });

    it('should call next with AppError if password is not provided', async () => {
      mockReq.body = { username: 'testuser' };
      await authController.login(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new AppError(400, 'Password is required.'));
    });

    it('should call next with AppError if user not found (via userService)', async () => {
      mockReq.body = { username: 'unknownuser', password: 'password123' };
      userService.findUserByUsername.mockRejectedValueOnce(new AppError(404, 'User not found.'));

      await authController.login(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new AppError(404, 'User not found.'));
    });

    it('should call next with AppError if password does not match', async () => {
      mockReq.body = { username: 'testuser', password: 'wrongpassword' };
      const mockUser = { id: 1, username: 'testuser', password_hash: 'hashedpassword' };
      userService.findUserByUsername.mockResolvedValueOnce(mockUser);
      authUtils.comparePassword.mockResolvedValueOnce(false); // Password does not match

      await authController.login(mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(new AppError(401, 'Invalid credentials.'));
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
        mockReq.cookies = { refreshToken: 'validrefreshtoken' };
        authUtils.generateAccessToken.mockReturnValueOnce('newaccesstoken');
        // Mock jwt.verify to be successful
        const jwt = require('jsonwebtoken');
        jest.spyOn(jwt, 'verify').mockImplementation(() => ({ id: 1, username: 'testuser' }));


        await authController.refreshToken(mockReq, mockRes, mockNext);

        expect(jwt.verify).toHaveBeenCalledWith('validrefreshtoken', process.env.REFRESH_TOKEN_SECRET);
        expect(authUtils.generateAccessToken).toHaveBeenCalledWith({ id: 1, username: 'testuser' });
        expect(mockRes.cookie).toHaveBeenCalledWith('accessToken', 'newaccesstoken', expect.any(Object));
        expect(mockRes.json).toHaveBeenCalledWith({ message: 'Access token refreshed successfully.' });
        expect(mockNext).not.toHaveBeenCalled();
        
        jwt.verify.mockRestore(); // Clean up spy
    });

    it('should call next with AppError if no refresh token in cookie', async () => {
        mockReq.cookies = {}; // No refreshToken
        await authController.refreshToken(mockReq, mockRes, mockNext);
        expect(mockNext).toHaveBeenCalledWith(new AppError(401, 'Refresh token not found.'));
    });

    it('should call next with AppError if refresh token is invalid', async () => {
        mockReq.cookies = { refreshToken: 'invalidrefreshtoken' };
        const jwt = require('jsonwebtoken');
        jest.spyOn(jwt, 'verify').mockImplementation(() => { throw new jwt.JsonWebTokenError('invalid token'); });

        await authController.refreshToken(mockReq, mockRes, mockNext);
        
        expect(mockNext).toHaveBeenCalledWith(new AppError(403, 'Invalid or expired refresh token.'));
        expect(mockRes.cookie).toHaveBeenCalledWith('refreshToken', '', expect.any(Object)); // Clears cookie
        jwt.verify.mockRestore();
    });
  });

  describe('logout', () => {
    it('should clear cookies and return 200', () => {
      authController.logout(mockReq, mockRes, mockNext); // logout is synchronous

      expect(mockRes.cookie).toHaveBeenCalledTimes(2);
      expect(mockRes.cookie).toHaveBeenCalledWith('accessToken', '', expect.any(Object));
      expect(mockRes.cookie).toHaveBeenCalledWith('refreshToken', '', expect.any(Object));
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({ message: 'Logged out successfully.' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
