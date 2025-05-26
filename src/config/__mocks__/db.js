// src/config/__mocks__/db.js

// This will be the central mock for all database query operations
const mockQuery = jest.fn();

// Mock the pool object and its connect method
const mockPoolConnect = jest.fn().mockResolvedValue({
  query: mockQuery, // The connected client uses the same central mockQuery
  release: jest.fn(),
  // Add BEGIN, COMMIT, ROLLBACK mocks if your services use transactions directly on client
  // For example:
  // BEGIN: jest.fn().mockResolvedValue(),
  // COMMIT: jest.fn().mockResolvedValue(),
  // ROLLBACK: jest.fn().mockResolvedValue(),
});

const mockPool = {
  query: mockQuery, // For direct pool.query calls
  connect: mockPoolConnect, // For pool.connect().then(client => ...)
};

module.exports = {
  query: mockQuery, // If your db module directly exports a query function like db.query()
  pool: mockPool,   // If your db module exports the pool, and services use pool.query() or pool.connect()
};
