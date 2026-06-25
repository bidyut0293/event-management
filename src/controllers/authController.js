const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { users } = require('../store/inMemoryStore');
const { sendWelcomeEmail } = require('../services/emailService');

async function register(req, res) {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ message: 'name, email, password, and role are required' });
  }
  if (!['organizer', 'attendee'].includes(role)) {
    return res.status(400).json({ message: 'role must be organizer or attendee' });
  }
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ message: 'Email already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const userId = uuidv4();

  users.push({ id: userId, name, email, passwordHash, role, registeredEvents: [] });

  sendWelcomeEmail(email, name).catch(err => console.error('Welcome email error:', err));

  return res.status(201).json({ message: 'User registered successfully', userId });
}

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'email and password are required' });
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  return res.status(200).json({ token });
}

module.exports = { register, login };
