// Shared API middleware
function requireAuth(req, res, next) {
  if (!req.session?.loggedIn) return res.status(401).json({ success: false, error: 'Non authentifié' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session?.loggedIn) return res.status(401).json({ success: false, error: 'Non authentifié' });
  if (req.session.role !== 'admin') return res.status(403).json({ success: false, error: 'Admin requis' });
  next();
}
module.exports = { requireAuth, requireAdmin };
