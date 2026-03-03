const admin = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.role === 'administrator')) {
        next();
    } else {
        res.status(403).json({ error: 'Acesso negado. Requer privilégios de administrador.' });
    }
};

module.exports = admin;