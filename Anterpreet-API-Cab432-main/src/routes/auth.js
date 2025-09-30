const express = require('express');
const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const { findUser } = require('../config/users');
const router = express.Router(); 

const useCognito = !!(process.env.COGNITO_APP_CLIENT_ID && process.env.COGNITO_USER_POOL_ID && process.env.AWS_REGION);
let cognito;
if (useCognito) {
  cognito = new AWS.CognitoIdentityServiceProvider({ region: process.env.AWS_REGION });
}

// Register (Cognito only)
router.post('/register', async (req, res) => {
  const { username, password, email } = req.body || {};
  if (!username || !password || !email) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (!useCognito) {
    // Local/demo mode does not support self-registration
    return res.status(501).json({ error: 'not_configured' });
  }
  try {
    await cognito.signUp({
      ClientId: process.env.COGNITO_APP_CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [{ Name: 'email', Value: email }]
    }).promise();
    res.status(201).json({ message: 'registered_check_email' });
  } catch (e) {
    res.status(400).json({ error: e.code || e.message });
  }
});

// Confirm (Cognito only)
router.post('/confirm', async (req, res) => {
  const { username, code } = req.body || {};
  if (!username || !code) {
    return res.status(400).json({ error: 'missing_fields' });
  }
  if (!useCognito) {
    return res.status(501).json({ error: 'not_configured' });
  }
  try {
    await cognito.confirmSignUp({
      ClientId: process.env.COGNITO_APP_CLIENT_ID,
      Username: username,
      ConfirmationCode: code
    }).promise();
    res.json({ message: 'confirmed' });
  } catch (e) {
    res.status(400).json({ error: e.code || e.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'missing_credentials' });
  }
  try {
    if (useCognito) {
      const out = await cognito.initiateAuth({
        AuthFlow: 'USER_PASSWORD_AUTH',
        ClientId: process.env.COGNITO_APP_CLIENT_ID,
        AuthParameters: { USERNAME: username, PASSWORD: password }
      }).promise();

      const idToken = out.AuthenticationResult.IdToken;
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
      const groups = payload['cognito:groups'] || [];
      const role = groups.includes('admin') ? 'admin' : 'user';

      res.json({
        token: idToken,
        user: {
          username: payload['cognito:username'] || username,
          email: payload.email,
          role
        }
      });
    } else {
      // Local/demo auth
      const user = findUser(username, password);
      if (!user) return res.status(401).json({ error: 'invalid_credentials' });

      const secret = process.env.LOCAL_JWT_SECRET || 'dev-secret';
      const payload = { username: user.username, email: user.email || null, sub: user.id, role: user.role };
      const token = jwt.sign(payload, secret, { algorithm: 'HS256', expiresIn: '12h' });
      res.json({ token, user: { username: user.username, email: user.email || null, role: user.role } });
    }
  } catch (e) {
    res.status(401).json({ error: 'invalid_credentials' });
  }
});

module.exports = { router };
