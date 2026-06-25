# Implementation Guide — Step by Step

Build the virtual event management backend in the order below. Each step maps to one requirement from the brief and produces working, testable output before moving to the next.

---

## Step 1 — Project Setup

**Goal:** Get a running Express server with all dependencies installed.

### 1.1 Initialize the project

```bash
mkdir event-management
cd event-management
npm init -y
```

### 1.2 Install dependencies

```bash
npm install express bcrypt jsonwebtoken uuid nodemailer dotenv
npm install --save-dev nodemon
```

| Package | Purpose |
|---|---|
| express | HTTP server and routing |
| bcrypt | Password hashing |
| jsonwebtoken | JWT sign and verify |
| uuid | Generate unique IDs for users and events |
| nodemailer | Send confirmation emails |
| dotenv | Load `.env` variables |
| nodemon | Auto-restart server on file change (dev only) |

### 1.3 Add scripts to `package.json`

```json
"scripts": {
  "start": "node src/index.js",
  "dev": "nodemon src/index.js"
}
```

### 1.4 Create the entry point

`src/index.js`

```js
require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

**Test:** `npm run dev` — server should start without errors.

---

## Step 2 — In-Memory Data Store

**Goal:** Create shared in-memory arrays that act as the database throughout the app.

`src/store/inMemoryStore.js`

```js
const users = [];
const events = [];

module.exports = { users, events };
```

**Why this works:** Node.js keeps the module cached after the first `require()`, so every file that imports this store gets the same live arrays.

**User shape:**
```js
{
  id: String,           // uuid
  name: String,
  email: String,
  passwordHash: String, // bcrypt output
  role: String,         // 'organizer' | 'attendee'
  registeredEvents: []  // event IDs
}
```

**Event shape:**
```js
{
  id: String,           // uuid
  title: String,
  description: String,
  date: String,         // 'YYYY-MM-DD'
  time: String,         // 'HH:MM'
  organizerId: String,  // user ID
  participants: []      // user IDs
}
```

---

## Step 3 — JWT Auth Middleware

**Goal:** Create a reusable middleware that protects routes by verifying the JWT on every request.

`src/middleware/auth.js`

```js
const jwt = require('jsonwebtoken');

function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed token.' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;   // { userId, role }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = authenticate;
```

**How to use on any route:**
```js
const authenticate = require('../middleware/auth');
router.get('/events', authenticate, (req, res) => { ... });
```

---

## Step 4 — User Registration (`POST /register`)

**Goal:** Accept a new user, hash their password, store them in memory, and send a welcome email.

### 4.1 Email service

`src/services/emailService.js`

```js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function sendWelcomeEmail(to, name) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Welcome to Event Platform',
    text: `Hi ${name}, your account has been created successfully.`,
  });
}

async function sendEventConfirmation(to, name, event) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Registered: ${event.title}`,
    text: `Hi ${name}, you're registered for "${event.title}" on ${event.date} at ${event.time}.`,
  });
}

module.exports = { sendWelcomeEmail, sendEventConfirmation };
```

### 4.2 Registration controller

`src/controllers/authController.js`

```js
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const { users } = require('../store/inMemoryStore');
const { sendWelcomeEmail } = require('../services/emailService');

async function register(req, res) {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!['organizer', 'attendee'].includes(role)) {
    return res.status(400).json({ error: 'Role must be organizer or attendee.' });
  }
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already in use.' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = { id: uuidv4(), name, email, passwordHash, role, registeredEvents: [] };
  users.push(user);

  // Fire-and-forget — do not await so the response is immediate
  sendWelcomeEmail(email, name).catch(err => console.error('Email error:', err));

  return res.status(201).json({ message: 'Registration successful.', userId: user.id });
}

module.exports = { register };
```

### 4.3 Auth route

`src/routes/auth.js`

```js
const express = require('express');
const router = express.Router();
const { register } = require('../controllers/authController');

router.post('/register', register);

module.exports = router;
```

### 4.4 Mount the route in `index.js`

```js
const authRoutes = require('./routes/auth');
app.use('/', authRoutes);
```

**Test:**
```
POST http://localhost:3000/register
Body: { "name": "Jane", "email": "jane@test.com", "password": "pass123", "role": "attendee" }
Expected: 201 { message, userId }
```

---

## Step 5 — User Login (`POST /login`)

**Goal:** Verify credentials and return a signed JWT.

Add to `src/controllers/authController.js`:

```js
const jwt = require('jsonwebtoken');

async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const user = users.find(u => u.email === email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const token = jwt.sign(
    { userId: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
  );

  return res.status(200).json({ token });
}

module.exports = { register, login };
```

Add the route in `src/routes/auth.js`:

```js
const { register, login } = require('../controllers/authController');
router.post('/login', login);
```

**Test:**
```
POST http://localhost:3000/login
Body: { "email": "jane@test.com", "password": "pass123" }
Expected: 200 { token: "eyJ..." }
```

---

## Step 6 — Event CRUD

**Goal:** Organizers can create, read, update, and delete events.

`src/controllers/eventController.js`

```js
const { v4: uuidv4 } = require('uuid');
const { events } = require('../store/inMemoryStore');

// GET /events
function getAllEvents(req, res) {
  const list = events.map(e => ({
    id: e.id,
    title: e.title,
    date: e.date,
    time: e.time,
    description: e.description,
    participantCount: e.participants.length,
  }));
  return res.status(200).json(list);
}

// GET /events/:id
function getEvent(req, res) {
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  return res.status(200).json(event);
}

// POST /events  (organizer only)
function createEvent(req, res) {
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ error: 'Only organizers can create events.' });
  }
  const { title, description, date, time } = req.body;
  if (!title || !description || !date || !time) {
    return res.status(400).json({ error: 'title, description, date and time are required.' });
  }
  const event = {
    id: uuidv4(),
    title,
    description,
    date,
    time,
    organizerId: req.user.userId,
    participants: [],
  };
  events.push(event);
  return res.status(201).json({ message: 'Event created.', event });
}

// PUT /events/:id  (organizer who owns the event)
function updateEvent(req, res) {
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });
  if (event.organizerId !== req.user.userId) {
    return res.status(403).json({ error: 'Not authorized to update this event.' });
  }
  const { title, description, date, time } = req.body;
  if (title) event.title = title;
  if (description) event.description = description;
  if (date) event.date = date;
  if (time) event.time = time;
  return res.status(200).json({ message: 'Event updated.', event });
}

// DELETE /events/:id  (organizer who owns the event)
function deleteEvent(req, res) {
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Event not found.' });
  if (events[index].organizerId !== req.user.userId) {
    return res.status(403).json({ error: 'Not authorized to delete this event.' });
  }
  events.splice(index, 1);
  return res.status(200).json({ message: 'Event deleted.' });
}

module.exports = { getAllEvents, getEvent, createEvent, updateEvent, deleteEvent };
```

`src/routes/events.js`

```js
const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/auth');
const {
  getAllEvents, getEvent, createEvent, updateEvent, deleteEvent
} = require('../controllers/eventController');

router.get('/', authenticate, getAllEvents);
router.get('/:id', authenticate, getEvent);
router.post('/', authenticate, createEvent);
router.put('/:id', authenticate, updateEvent);
router.delete('/:id', authenticate, deleteEvent);

module.exports = router;
```

Mount in `index.js`:
```js
const eventRoutes = require('./routes/events');
app.use('/events', eventRoutes);
```

**Test sequence:**
```
POST /events  (with organizer token)
  Body: { "title": "React Summit", "description": "...", "date": "2026-08-15", "time": "10:00" }
  Expected: 201

GET /events
  Expected: 200 [ array of events ]

PUT /events/:id
  Body: { "title": "React Summit 2026" }
  Expected: 200

DELETE /events/:id
  Expected: 200
```

---

## Step 7 — Event Registration (`POST /events/:id/register`)

**Goal:** Attendees register for an event; a confirmation email is sent asynchronously.

Add to `src/controllers/eventController.js`:

```js
const { users } = require('../store/inMemoryStore');
const { sendEventConfirmation } = require('../services/emailService');

async function registerForEvent(req, res) {
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ error: 'Event not found.' });

  const userId = req.user.userId;
  if (event.participants.includes(userId)) {
    return res.status(409).json({ error: 'Already registered for this event.' });
  }

  event.participants.push(userId);

  const user = users.find(u => u.id === userId);
  user.registeredEvents.push(event.id);

  // Send email asynchronously — response does not wait for it
  sendEventConfirmation(user.email, user.name, event)
    .catch(err => console.error('Email error:', err));

  return res.status(200).json({ message: 'Successfully registered. A confirmation email has been sent.' });
}

module.exports = { getAllEvents, getEvent, createEvent, updateEvent, deleteEvent, registerForEvent };
```

Add the route in `src/routes/events.js`:
```js
const { ..., registerForEvent } = require('../controllers/eventController');
router.post('/:id/register', authenticate, registerForEvent);
```

**Test:**
```
POST /events/:id/register  (with attendee token)
Expected: 200 { message }

POST /events/:id/register  (same user, same event again)
Expected: 409 { error: 'Already registered...' }
```

---

## Step 8 — Environment Variables

Create `.env` in the project root:

```env
PORT=3000

JWT_SECRET=replace_with_a_long_random_string
JWT_EXPIRES_IN=24h

EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=587
EMAIL_USER=your_mailtrap_username
EMAIL_PASS=your_mailtrap_password
EMAIL_FROM=no-reply@eventplatform.com
```

> Use [Mailtrap](https://mailtrap.io) during development — it captures outgoing emails safely without delivering them to real inboxes.

Add `.env` to `.gitignore`:
```
node_modules/
.env
```

---

## Step 9 — Final `src/index.js`

Bring everything together:

```js
require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');

const app = express();
app.use(express.json());

app.use('/', authRoutes);
app.use('/events', eventRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

---

## API Quick Reference

| Method | Endpoint | Auth | Role |
|---|---|---|---|
| POST | /register | No | — |
| POST | /login | No | — |
| GET | /events | Yes | any |
| GET | /events/:id | Yes | any |
| POST | /events | Yes | organizer |
| PUT | /events/:id | Yes | organizer (owner) |
| DELETE | /events/:id | Yes | organizer (owner) |
| POST | /events/:id/register | Yes | attendee |

---

## Build Order Checklist

- [ ] Step 1 — Project setup, Express server running
- [ ] Step 2 — In-memory store created
- [ ] Step 3 — Auth middleware written
- [ ] Step 4 — `POST /register` working + welcome email fires
- [ ] Step 5 — `POST /login` returning JWT
- [ ] Step 6 — Event CRUD endpoints working
- [ ] Step 7 — `POST /events/:id/register` + confirmation email fires
- [ ] Step 8 — `.env` configured, `.gitignore` updated
- [ ] Step 9 — Final `index.js` wired together, end-to-end test passed
