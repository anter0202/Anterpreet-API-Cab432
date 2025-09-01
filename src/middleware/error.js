module.exports = function errorHandler(err, req, res, next) {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({
    type: 'about:blank',
    title: err.title || 'Internal Server Error',
    status: err.status || 500,
    detail: err.message || 'Unexpected error'
  });
}
