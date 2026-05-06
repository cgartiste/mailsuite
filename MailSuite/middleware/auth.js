/**
 * MailSuite — Auth Middleware
 */
function loginRequired(req, res, next) {
  if (!req.session || !req.session.loggedIn) {
    return res.redirect('/login');
  }
  next();
}

function adminRequired(req, res, next) {
  if (!req.session || !req.session.loggedIn) {
    return res.redirect('/login');
  }
  if (req.session.role !== 'admin') {
    req.flash('error', 'Accès administrateur requis');
    return res.redirect('/');
  }
  next();
}

module.exports = { loginRequired, adminRequired };
