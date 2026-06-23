// Wraps an async route handler so a rejected promise (e.g. a MongoDB error)
// is forwarded to next(err) instead of hanging the request forever.
module.exports = fn => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
