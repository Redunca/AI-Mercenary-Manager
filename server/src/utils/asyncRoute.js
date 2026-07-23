// Wraps an async Express handler that doesn't need a pooled client (it
// calls into a service that manages its own transaction, e.g. game.service.js's
// withTransaction) so a thrown/rejected error reaches `next` without a
// try/catch repeated in every route.
function asyncRoute(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res)
    } catch (err) {
      next(err)
    }
  }
}

module.exports = { asyncRoute }
