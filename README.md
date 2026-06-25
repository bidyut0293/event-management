# Virtual Event Management Platform — Backend

A RESTful backend system for managing virtual events, user authentication, and participant registrations. Built with Node.js and Express.js using in-memory data structures.

---

## Table of Contents

- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Data Models](#data-models)
- [API Endpoints](#api-endpoints)
- [Authentication Flow](#authentication-flow)
- [Email Notifications](#email-notifications)
- [Setup & Running](#setup--running)
- [Environment Variables](#environment-variables)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Password Hashing | bcrypt |
| Auth Tokens | JSON Web Tokens (JWT) |
| Email | Nodemailer |
| Storage | In-memory (arrays/objects) |

---

## Project Structure

```
event-management/
├── src/
│   ├── index.js              # Entry point, Express app setup
│   ├── middleware/
│   │   └── auth.js           # JWT verification middleware
│   ├── routes/
│   │   ├── auth.js           # /register, /login
│   │   └── events.js         # /events, /events/:id, /events/:id/register
│   ├── controllers/
│   │   ├── authController.js
│   │   └── eventController.js
│   ├── services/
│   │   └── emailService.js   # Nodemailer async email sender
│   └── store/
│       └── inMemoryStore.js  # In-memory users and events arrays
├── .env
├── package.json
└── README.md
```

---

## Data Models

### User

```js
{
  id: "uuid-v4",
  name: "Jane Doe",
  email: "jane@example.com",
  passwordHash: "$2b$10$...",        // bcrypt hash
  role: "organizer" | "attendee",
  registeredEvents: ["event-id-1"]   // event IDs the user registered for
}
```

### Event

```js
{
  id: "uuid-v4",
  title: "React Summit 2026",
  description: "Annual React conference",
  date: "2026-08-15",
  time: "10:00",
  organizerId: "user-uuid",
  participants: ["user-uuid-1", "user-uuid-2"]  // registered attendee IDs
}
```

Both models live in `src/store/inMemoryStore.js` as exported arrays:

```js
const users = [];
const events = [];
module.exports = { users, events };
```

---

## API Endpoints

### Auth

#### `POST /register`

Register a new user.

**Request body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "secret123",
  "role": "attendee"
}
```

**Response `201`:**
```json
{
  "message": "Registration successful. Check your email.",
  "userId": "uuid-v4"
}
```

**Errors:** `400` email already in use, `400` missing fields.

---

#### `POST /login`

Authenticate and receive a JWT.

**Request body:**
```json
{
  "email": "jane@example.com",
  "password": "secret123"
}
```

**Response `200`:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Errors:** `401` invalid credentials.

---

### Events

All event routes require `Authorization: Bearer <token>` header.

#### `GET /events`

List all events.

**Response `200`:**
```json
[
  {
    "id": "uuid",
    "title": "React Summit 2026",
    "date": "2026-08-15",
    "time": "10:00",
    "description": "Annual React conference",
    "participantCount": 42
  }
]
```

---

#### `GET /events/:id`

Get details of a single event including participant count.

**Response `200`:**
```json
{
  "id": "uuid",
  "title": "React Summit 2026",
  "date": "2026-08-15",
  "time": "10:00",
  "description": "Annual React conference",
  "organizerId": "organizer-uuid",
  "participants": ["user-uuid-1", "user-uuid-2"]
}
```

**Errors:** `404` event not found.

---

#### `POST /events`

Create a new event. **Organizer role required.**

**Request body:**
```json
{
  "title": "Vue.js Meetup",
  "description": "Monthly local meetup",
  "date": "2026-09-10",
  "time": "18:30"
}
```

**Response `201`:**
```json
{
  "message": "Event created.",
  "event": { "id": "uuid", "title": "Vue.js Meetup", "..." }
}
```

**Errors:** `403` not an organizer, `400` missing fields.

---

#### `PUT /events/:id`

Update an existing event. **Organizer who created the event only.**

**Request body** (any subset of fields):
```json
{
  "title": "Vue.js Meetup — June Edition",
  "date": "2026-09-12"
}
```

**Response `200`:**
```json
{
  "message": "Event updated.",
  "event": { "..." }
}
```

**Errors:** `403` not the organizer, `404` event not found.

---

#### `DELETE /events/:id`

Delete an event. **Organizer who created the event only.**

**Response `200`:**
```json
{ "message": "Event deleted." }
```

**Errors:** `403` not the organizer, `404` event not found.

---

#### `POST /events/:id/register`

Register the authenticated user for an event.

**Response `200`:**
```json
{ "message": "Successfully registered for the event. A confirmation email has been sent." }
```

**Errors:** `404` event not found, `409` already registered.

On success, a confirmation email is sent asynchronously to the user's registered email address.

---

## Authentication Flow

```
Client                          Server
  |                               |
  |-- POST /register -----------> |
  |                               | hash password (bcrypt, 10 rounds)
  |                               | store user in-memory
  |                               | send welcome email (async)
  |<-- 201 { userId } ----------- |
  |                               |
  |-- POST /login --------------> |
  |                               | find user by email
  |                               | bcrypt.compare(password, hash)
  |                               | sign JWT (payload: userId, role)
  |<-- 200 { token } ------------ |
  |                               |
  |-- GET /events              -> |
  |   Authorization: Bearer <token>
  |                               | verify JWT
  |                               | attach req.user
  |<-- 200 [...events] ---------- |
```

JWT payload:
```json
{ "userId": "uuid", "role": "attendee", "iat": 1719000000, "exp": 1719086400 }
```

Token expiry: **24 hours** (configurable via `JWT_EXPIRES_IN` env var).

---

## Email Notifications

Emails are sent using Nodemailer with async/await. Two triggers:

| Trigger | Email sent |
|---|---|
| `POST /register` | Welcome email with account details |
| `POST /events/:id/register` | Event confirmation with date, time, and title |

Email sending is non-blocking — the API response is returned immediately and the email resolves in the background via `Promise`.

```js
// emailService.js (simplified)
async function sendConfirmationEmail(to, event) {
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Registered: ${event.title}`,
    text: `You're registered for ${event.title} on ${event.date} at ${event.time}.`
  });
  return info;
}
```

---

## Setup & Running

### Prerequisites

- Node.js v18+
- npm

### Install

```bash
npm install
```

### Run in development

```bash
npm run dev
```

### Run in production

```bash
npm start
```

Server starts on `http://localhost:3000` by default.

---

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
JWT_SECRET=your_super_secret_key
JWT_EXPIRES_IN=24h

EMAIL_HOST=smtp.mailtrap.io
EMAIL_PORT=587
EMAIL_USER=your_mailtrap_user
EMAIL_PASS=your_mailtrap_pass
EMAIL_FROM=no-reply@eventplatform.com
```

> For local development, [Mailtrap](https://mailtrap.io) is recommended as a safe SMTP sandbox that captures outgoing emails without delivering them.

---

## Authorization Summary

| Route | Auth required | Role required |
|---|---|---|
| POST /register | No | — |
| POST /login | No | — |
| GET /events | Yes | any |
| GET /events/:id | Yes | any |
| POST /events | Yes | organizer |
| PUT /events/:id | Yes | organizer (owner) |
| DELETE /events/:id | Yes | organizer (owner) |
| POST /events/:id/register | Yes | attendee |
