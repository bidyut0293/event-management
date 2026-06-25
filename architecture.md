# Architecture — Virtual Event Management Platform

A layered breakdown of how the backend is structured, how data flows through it, and how each component connects to the next.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        CLIENT                           │
│              (Postman / Frontend / cURL)                │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP Requests
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    EXPRESS SERVER                       │
│                    src/index.js                         │
│                                                         │
│  ┌──────────────┐          ┌───────────────────────┐    │
│  │  Auth Routes │          │    Event Routes       │    │
│  │  /register   │          │  /events              │    │
│  │  /login      │          │  /events/:id          │    │
│  └──────┬───────┘          │  /events/:id/register │    │
│         │                  └──────────┬────────────┘    │
│         │                             │                 │
│         │              ┌──────────────┘                 │
│         │              ▼                                │
│         │   ┌──────────────────────┐                    │
│         │   │   Auth Middleware    │                    │
│         │   │  src/middleware/     │                    │
│         │   │     auth.js         │                    │
│         │   └──────────┬───────────┘                    │
│         │              │                                │
│         ▼              ▼                                │
│  ┌──────────────────────────────────────────────┐       │
│  │               CONTROLLERS                   │       │
│  │  authController.js   eventController.js     │       │
│  └──────────────┬───────────────────────────────┘       │
│                 │                                       │
│        ┌────────┴──────────┐                            │
│        ▼                   ▼                            │
│  ┌───────────┐    ┌─────────────────┐                   │
│  │ In-Memory │    │  Email Service  │                   │
│  │   Store   │    │ emailService.js │                   │
│  │ users[]   │    │ (Nodemailer)    │                   │
│  │ events[]  │    └────────┬────────┘                   │
│  └───────────┘             │                            │
└───────────────────────────┼─────────────────────────────┘
                            ▼
                    ┌───────────────┐
                    │  SMTP Server  │
                    │  (Mailtrap /  │
                    │  any SMTP)    │
                    └───────────────┘
```

---

## 2. Folder Structure

```
event-management/
├── src/
│   ├── index.js                  ← Entry point: app init, route mounting
│   ├── middleware/
│   │   └── auth.js               ← JWT verification on protected routes
│   ├── routes/
│   │   ├── auth.js               ← POST /register, POST /login
│   │   └── events.js             ← All /events/* routes
│   ├── controllers/
│   │   ├── authController.js     ← register(), login() logic
│   │   └── eventController.js    ← CRUD + registerForEvent() logic
│   ├── services/
│   │   └── emailService.js       ← sendWelcomeEmail(), sendEventConfirmation()
│   └── store/
│       └── inMemoryStore.js      ← Shared users[] and events[] arrays
├── .env                          ← Secrets and config (never committed)
├── .gitignore
└── package.json
```

---

## 3. Layer Responsibilities

| Layer | Files | Responsibility |
|---|---|---|
| Entry Point | `src/index.js` | Boot Express, load env vars, mount routes |
| Routes | `src/routes/*.js` | Map HTTP method + path to controller function |
| Middleware | `src/middleware/auth.js` | Intercept requests, verify JWT, attach `req.user` |
| Controllers | `src/controllers/*.js` | Validate input, apply business rules, call store/services |
| Services | `src/services/emailService.js` | Async email dispatch via Nodemailer |
| Store | `src/store/inMemoryStore.js` | Single source of truth for all runtime data |

---

## 4. Data Models

### User

```
users[]
  └── {
        id             : uuid v4
        name           : string
        email          : string         ← unique
        passwordHash   : string         ← bcrypt (10 rounds)
        role           : 'organizer' | 'attendee'
        registeredEvents : string[]     ← event IDs
      }
```

### Event

```
events[]
  └── {
        id           : uuid v4
        title        : string
        description  : string
        date         : string           ← 'YYYY-MM-DD'
        time         : string           ← 'HH:MM'
        organizerId  : string           ← user ID of creator
        participants : string[]         ← user IDs of registrants
      }
```

---

## 5. Request Lifecycle — Step by Step

### 5.1 User Registration (`POST /register`)

```
Request arrives
      │
      ▼
src/routes/auth.js
  router.post('/register', register)
      │
      ▼
src/controllers/authController.js → register()
  ├── Validate: name, email, password, role present?  → 400 if missing
  ├── Validate: role is 'organizer' or 'attendee'?    → 400 if invalid
  ├── Check: email already exists in users[]?          → 400 if duplicate
  ├── bcrypt.hash(password, 10)                        ← async/await
  ├── Push new user object into users[]
  ├── sendWelcomeEmail().catch(...)                    ← fire-and-forget
  └── return 201 { message, userId }
```

---

### 5.2 User Login (`POST /login`)

```
Request arrives
      │
      ▼
src/routes/auth.js
  router.post('/login', login)
      │
      ▼
src/controllers/authController.js → login()
  ├── Validate: email and password present?            → 400 if missing
  ├── Find user by email in users[]                    → 401 if not found
  ├── bcrypt.compare(password, user.passwordHash)      ← async/await
  │     └── no match                                   → 401
  ├── jwt.sign({ userId, role }, JWT_SECRET, { expiresIn })
  └── return 200 { token }
```

---

### 5.3 Authenticated Event Request (any `/events` route)

```
Request arrives with Authorization: Bearer <token>
      │
      ▼
src/routes/events.js
  router.METHOD('/path', authenticate, controllerFn)
      │
      ▼
src/middleware/auth.js → authenticate()
  ├── Read Authorization header                        → 401 if missing/malformed
  ├── jwt.verify(token, JWT_SECRET)                    → 401 if invalid/expired
  ├── Attach decoded payload to req.user { userId, role }
  └── next()  →  passes control to controller
      │
      ▼
  Controller function executes
```

---

### 5.4 Create Event (`POST /events`)

```
authenticate() passes req.user
      │
      ▼
src/controllers/eventController.js → createEvent()
  ├── Check: req.user.role === 'organizer'?            → 403 if not
  ├── Validate: title, description, date, time present? → 400 if missing
  ├── Build event object { id: uuid, ...fields, organizerId, participants: [] }
  ├── Push into events[]
  └── return 201 { message, event }
```

---

### 5.5 Update Event (`PUT /events/:id`)

```
authenticate() passes req.user
      │
      ▼
src/controllers/eventController.js → updateEvent()
  ├── Find event by req.params.id in events[]          → 404 if missing
  ├── Check: event.organizerId === req.user.userId?    → 403 if not owner
  ├── Apply partial update (only fields present in body)
  └── return 200 { message, event }
```

---

### 5.6 Delete Event (`DELETE /events/:id`)

```
authenticate() passes req.user
      │
      ▼
src/controllers/eventController.js → deleteEvent()
  ├── Find event index by req.params.id                → 404 if missing
  ├── Check: event.organizerId === req.user.userId?    → 403 if not owner
  ├── events.splice(index, 1)
  └── return 200 { message }
```

---

### 5.7 Register for Event (`POST /events/:id/register`)

```
authenticate() passes req.user
      │
      ▼
src/controllers/eventController.js → registerForEvent()
  ├── Find event by req.params.id                      → 404 if missing
  ├── Check: userId already in event.participants?     → 409 if duplicate
  ├── event.participants.push(userId)
  ├── user.registeredEvents.push(event.id)
  ├── sendEventConfirmation().catch(...)               ← fire-and-forget
  └── return 200 { message }
```

---

## 6. JWT Authentication Flow

```
Client                                Server
  │                                     │
  │── POST /register ─────────────────► │ hash password → store user → 201
  │                                     │
  │── POST /login ──────────────────── ►│ verify password
  │                                     │ jwt.sign({ userId, role }, secret)
  │◄─ 200 { token } ─────────────────── │
  │                                     │
  │── GET /events ──────────────────── ►│
  │   Authorization: Bearer <token>      │ jwt.verify(token)
  │                                     │ → attach req.user
  │◄─ 200 [...events] ────────────────── │

JWT Payload: { userId, role, iat, exp }
Token expiry: JWT_EXPIRES_IN (default 24h)
```

---

## 7. Email Notification Architecture

Email calls are **non-blocking** — the HTTP response is sent first; email resolves in the background.

```
Controller
  │
  ├── return res.status(200).json(...)     ← response sent immediately
  │
  └── sendWelcomeEmail() / sendEventConfirmation()
        │  .catch(err => console.error)    ← errors logged, not thrown
        ▼
  src/services/emailService.js
    └── nodemailer transporter.sendMail()
          │
          ▼
      SMTP Server (Mailtrap in dev)
```

| Trigger | Function | Recipient |
|---|---|---|
| `POST /register` | `sendWelcomeEmail(to, name)` | Newly registered user |
| `POST /events/:id/register` | `sendEventConfirmation(to, name, event)` | Attendee who registered |

---

## 8. In-Memory Store — Shared State

Node.js module cache ensures a single shared instance across all files.

```
                     require()
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
  authController  eventController  (any future module)
           │            │
           └────────────┘
                  │
         src/store/inMemoryStore.js
           exports { users[], events[] }
           ← same array reference every time
```

> **Note:** Data resets on server restart — this is intentional for this implementation. A persistent database (e.g. MongoDB, PostgreSQL) would replace this layer in production.

---

## 9. Role-Based Access Control

| Route | Auth | Role Check | Ownership Check |
|---|---|---|---|
| POST /register | No | — | — |
| POST /login | No | — | — |
| GET /events | JWT | any | — |
| GET /events/:id | JWT | any | — |
| POST /events | JWT | organizer | — |
| PUT /events/:id | JWT | — | organizerId === userId |
| DELETE /events/:id | JWT | — | organizerId === userId |
| POST /events/:id/register | JWT | any | — |

---

## 10. Environment Configuration

All secrets and runtime config are injected via `.env` and loaded by `dotenv` before any other module initializes.

```
.env
  PORT             → Express listen port (default 3000)
  JWT_SECRET       → Signing key for jwt.sign / jwt.verify
  JWT_EXPIRES_IN   → Token lifetime (e.g. '24h')
  EMAIL_HOST       → SMTP hostname
  EMAIL_PORT       → SMTP port
  EMAIL_USER       → SMTP auth username
  EMAIL_PASS       → SMTP auth password
  EMAIL_FROM       → Sender address in outgoing emails
```

`.env` is excluded from version control via `.gitignore`.

---

## 11. Build Order (Dependency Chain)

Each step depends on the one before it:

```
Step 1: Project setup, Express running
    ↓
Step 2: In-memory store (users[], events[])
    ↓
Step 3: JWT auth middleware (reads JWT_SECRET from .env)
    ↓
Step 4: POST /register (needs store + emailService)
    ↓
Step 5: POST /login (needs store + bcrypt + JWT)
    ↓
Step 6: Event CRUD (needs store + auth middleware + role checks)
    ↓
Step 7: POST /events/:id/register (needs store + emailService + auth)
    ↓
Step 8: .env configured, .gitignore set
    ↓
Step 9: Final index.js wiring — end-to-end test
```
