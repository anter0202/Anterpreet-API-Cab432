const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const useCognito = !!(process.env.COGNITO_USER_POOL_ID && process.env.AWS_REGION);
let client;
if (useCognito) {
  client = jwksClient({
    jwksUri: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}/.well-known/jwks.json`,
    cache: true,
    cacheMaxEntries: 5,
    cacheMaxAge: 10 * 60 * 1000
  });
}

function getKey(header, cb) {
  if (!useCognito) return cb(new Error('no jwks'));
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return cb(err);
    const signingKey = key.getPublicKey();
    cb(null, signingKey);
  });
}

function verify(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing_token' });

  if (useCognito) {
    jwt.verify(token, getKey, { algorithms: ['RS256'] }, (err, decoded) => {
      if (err) return res.status(401).json({ error: 'invalid_token' });

      const groups = decoded['cognito:groups'] || [];
      req.user = {
        username: decoded['cognito:username'] || decoded.username,
        email: decoded.email,
        sub: decoded.sub,
        role: groups.includes('admin') ? 'admin' : 'user'
      };
      next();
    });
  } else {
    const secret = process.env.LOCAL_JWT_SECRET || 'dev-secret';
    try {
      const decoded = jwt.verify(token, secret, { algorithms: ['HS256'] });
      req.user = {
        username: decoded.username,
        email: decoded.email,
        sub: decoded.sub,
        role: decoded.role || 'user'
      };
      next();
    } catch (e) {
      return res.status(401).json({ error: 'invalid_token' });
    }
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role === 'admin') return next();
  return res.status(403).json({ error: 'forbidden' });
}

module.exports = { verify, requireAdmin };
