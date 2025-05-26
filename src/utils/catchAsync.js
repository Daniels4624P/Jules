/**
 * Higher-order function to wrap asynchronous Express route handlers.
 * It catches any promise rejections from the wrapped asynchronous function (`fn`)
 * and passes the error to the next middleware in the Express error handling chain
 * (which is typically the global error handler).
 * This utility avoids the need for explicit try-catch blocks in every async route handler.
 *
 * @param {Function} fn - The asynchronous route handler function to be wrapped.
 *                        This function is expected to be an `async` function or a function
 *                        that returns a Promise. It will receive `req`, `res`, and `next`
 *                        as arguments when called by Express.
 * @returns {Function} A new function that, when executed by Express as a route handler,
 *                     will execute `fn` and catch any errors, passing them to `next(err)`.
 *
 * @example
 * // Instead of:
 * // exports.someController = async (req, res, next) => {
 * //   try {
 * //     const data = await someAsyncOperation();
 * //     res.status(200).json({ data });
 * //   } catch (err) {
 * //     next(err); // Manually pass error to global error handler
 * //   }
 * // };
 *
 * // Use catchAsync:
 * // const catchAsync = require('./catchAsync');
 * // exports.someController = catchAsync(async (req, res, next) => {
 * //   const data = await someAsyncOperation();
 * //   res.status(200).json({ data });
 * //   // No try-catch needed here; catchAsync handles promise rejections.
 * // });
 */
const catchAsync = (fn) => {
  // The returned function is what Express will actually call as the route handler.
  return (req, res, next) => {
    // Execute the original async function (fn).
    // If fn resolves successfully, Express continues as normal.
    // If fn rejects (throws an error or a promise rejects), .catch(next) will pass the error
    // to Express's next error-handling middleware.
    fn(req, res, next).catch(next); // Equivalent to .catch(err => next(err))
  };
};

module.exports = catchAsync;
