# Requirements — Virtual Event Management Platform

---

## Requirement 1 — Project Setup

- Initialize a Node.js project using `npm init -y`
- Install and configure the following packages:
  - `express` — HTTP server and routing
  - `bcrypt` — password hashing
  - `jsonwebtoken` — JWT sign and verify
  - `uuid` — generate unique IDs for users and events
  - `nodemailer` — send email notifications
  - `dotenv` — load environment variables from `.env`
  - `nodemon` — auto-restart on file change (dev dependency)
- Add `start` and `dev` scripts to `package.json`
- Create `src/index.js` as the entry point with Express app initialized
- Server must start successfully on `PORT` from `.env` (default `3000`)

---

## Requirement 2 — In-Memory Data Storage

- Use in-memory arrays (no database) to store all data
- Create a shared store module at `src/store/inMemoryStore.js` exporting `users` and `events` arrays
- **User** object must store:
  - `id` — uuid string
  - `name` — string
  - `email` — string (unique)
  - `passwordHash` — bcrypt hashed string
  - `role` — `'organizer'` or `'attendee'`
  - `registeredEvents` — array of event IDs
- **Event** object must store:
  - `id` — uuid string
  - `title` — string
  - `description` — string
  - `date` — string in `YYYY-MM-DD` format
  - `time` — string in `HH:MM` format
  - `organizerId` — user ID of the creator
  - `participants` — array of user IDs

---

## Requirement 3 — User Authentication

### 3.1 Registration — `POST /register`

- Accept `name`, `email`, `password`, `role` in request body
- Validate all fields are present; return `400` if any are missing
- Validate `role` is either `'organizer'` or `'attendee'`; return `400` otherwise
- Reject duplicate emails with `400`
- Hash the password using `bcrypt` with 10 salt rounds
- Store the new user object in the in-memory `users` array
- Send a welcome email asynchronously (fire-and-forget, do not block response)
- Return `201` with `{ message, userId }` on success

### 3.2 Login — `POST /login`

- Accept `email` and `password` in request body
- Return `400` if either field is missing
- Find user by email; return `401` if not found
- Compare password with stored hash using `bcrypt.compare`; return `401` if mismatch
- Sign a JWT with payload `{ userId, role }` using `JWT_SECRET` from `.env`
- Set token expiry from `JWT_EXPIRES_IN` env variable (default `24h`)
- Return `200` with `{ token }` on success

### 3.3 Auth Middleware

- Create `src/middleware/auth.js` to protect routes
- Read the `Authorization` header and extract the Bearer token
- Return `401` if header is missing or malformed
- Verify the token using `jwt.verify`; return `401` if invalid or expired
- Attach decoded payload as `req.user` and call `next()`
- Apply this middleware to all event routes

---

## Requirement 4 — Event Management (CRUD)

All routes require a valid JWT token.

### 4.1 Create Event — `POST /events`

- Require `role === 'organizer'`; return `403` otherwise
- Accept `title`, `description`, `date`, `time` in request body
- Return `400` if any field is missing
- Create a new event object with a uuid and `organizerId` set to the logged-in user's ID
- Push event to the in-memory `events` array
- Return `201` with the created event object

### 4.2 Get All Events — `GET /events`

- Available to any authenticated user
- Return `200` with an array of all events
- Each item includes: `id`, `title`, `date`, `time`, `description`, `participantCount`

### 4.3 Get Single Event — `GET /events/:id`

- Available to any authenticated user
- Find event by `id`; return `404` if not found
- Return `200` with full event object including `participants` array

### 4.4 Update Event — `PUT /events/:id`

- Require the logged-in user to be the organizer who created the event
- Return `404` if event does not exist
- Return `403` if the logged-in user is not the event owner
- Allow partial updates — only update fields provided in request body
- Return `200` with the updated event object

### 4.5 Delete Event — `DELETE /events/:id`

- Require the logged-in user to be the organizer who created the event
- Return `404` if event does not exist
- Return `403` if the logged-in user is not the event owner
- Remove the event from the `events` array using `splice`
- Return `200` with a success message

---

## Requirement 5 — Participant Management

### 5.1 Register for Event — `POST /events/:id/register`

- Require a valid JWT token (any role can register)
- Find event by `id`; return `404` if not found
- Check if the user is already in `event.participants`; return `409` if already registered
- Push the user's ID into `event.participants`
- Push the event's ID into the user's `registeredEvents` array
- Send a confirmation email asynchronously (fire-and-forget)
- Return `200` with a success message

---

## Requirement 6 — Email Notifications

- Create `src/services/emailService.js` using Nodemailer
- Configure a reusable transporter from `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS` in `.env`
- Implement two async functions:
  - `sendWelcomeEmail(to, name)` — triggered on `POST /register`
  - `sendEventConfirmation(to, name, event)` — triggered on `POST /events/:id/register`
- Both functions must use `async/await` internally
- Both must be called with `.catch()` so email failures do not crash the server
- Neither should block the HTTP response (fire-and-forget pattern)

---

## Requirement 7 — RESTful API Endpoints

| Method | Endpoint | Auth Required | Allowed Role |
|---|---|---|---|
| POST | `/register` | No | — |
| POST | `/login` | No | — |
| GET | `/events` | Yes | any |
| GET | `/events/:id` | Yes | any |
| POST | `/events` | Yes | organizer |
| PUT | `/events/:id` | Yes | organizer (owner only) |
| DELETE | `/events/:id` | Yes | organizer (owner only) |
| POST | `/events/:id/register` | Yes | any authenticated user |

---

## Requirement 8 — Environment Configuration

- All secrets and config must be stored in a `.env` file
- Required variables:

  | Variable | Description |
  |---|---|
  | `PORT` | Server port (default `3000`) |
  | `JWT_SECRET` | Secret key for signing JWTs |
  | `JWT_EXPIRES_IN` | Token expiry duration (e.g. `24h`) |
  | `EMAIL_HOST` | SMTP host |
  | `EMAIL_PORT` | SMTP port |
  | `EMAIL_USER` | SMTP username |
  | `EMAIL_PASS` | SMTP password |
  | `EMAIL_FROM` | Sender email address |

- `.env` must be listed in `.gitignore`
- `node_modules/` must also be listed in `.gitignore`

---

## Requirement 9 — Asynchronous Operations

- All password operations (`bcrypt.hash`, `bcrypt.compare`) must use `async/await`
- JWT signing is synchronous — no special handling needed
- All email functions must be declared with `async` and use `await` on `transporter.sendMail`
- Email calls from controllers must be non-blocking using `.catch()` instead of `await`
- Route handler functions that call async operations must be declared `async`

---

## Build Checklist

- [ ] R1 — Project initialized, server runs on correct port
- [ ] R2 — In-memory store with correct user and event shapes
- [ ] R3 — `/register` and `/login` working, JWT returned on login
- [ ] R3 — Auth middleware protecting all event routes
- [ ] R4 — All 5 event CRUD endpoints working with role/ownership checks
- [ ] R5 — Event registration endpoint with duplicate-check and participant update
- [ ] R6 — Welcome and confirmation emails firing asynchronously
- [ ] R7 — All 8 endpoints returning correct status codes
- [ ] R8 — `.env` configured, secrets not hardcoded, `.gitignore` set
- [ ] R9 — All async operations use `async/await` and Promises correctly
