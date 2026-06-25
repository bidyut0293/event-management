# API Testing Guide — Virtual Event Management Platform

## Setup

1. Copy `.env` and fill in your values (see `README.md` or `REQUIREMENTS.md` for variables).
2. Install dependencies and start the server:

```bash
npm install
npm run dev
```

Server runs at `http://localhost:3000` by default.

---

## 1. User Registration — `POST /register`

### 1.1 Register an organizer

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret123","role":"organizer"}'
```

**Expected:** `201`
```json
{ "message": "User registered successfully", "userId": "<uuid>" }
```

---

### 1.2 Register an attendee

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com","password":"pass456","role":"attendee"}'
```

**Expected:** `201`
```json
{ "message": "User registered successfully", "userId": "<uuid>" }
```

---

### 1.3 Missing fields → 400

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Charlie","email":"charlie@example.com"}'
```

**Expected:** `400`
```json
{ "message": "name, email, password, and role are required" }
```

---

### 1.4 Invalid role → 400

```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Dave","email":"dave@example.com","password":"pass","role":"admin"}'
```

**Expected:** `400`
```json
{ "message": "role must be organizer or attendee" }
```

---

### 1.5 Duplicate email → 400

Run the same request from 1.1 again.

**Expected:** `400`
```json
{ "message": "Email already registered" }
```

---

## 2. Login — `POST /login`

### 2.1 Valid login

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}'
```

**Expected:** `200`
```json
{ "token": "<jwt>" }
```

> Save this token — it is used as `ORGANIZER_TOKEN` in subsequent requests.

---

### 2.2 Login as attendee

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"pass456"}'
```

**Expected:** `200`
```json
{ "token": "<jwt>" }
```

> Save this as `ATTENDEE_TOKEN`.

---

### 2.3 Wrong password → 401

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"wrongpass"}'
```

**Expected:** `401`
```json
{ "message": "Invalid credentials" }
```

---

### 2.4 Unknown email → 401

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"nobody@example.com","password":"pass"}'
```

**Expected:** `401`
```json
{ "message": "Invalid credentials" }
```

---

### 2.5 Missing fields → 400

```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com"}'
```

**Expected:** `400`
```json
{ "message": "email and password are required" }
```

---

## 3. Create Event — `POST /events`

> Replace `<ORGANIZER_TOKEN>` with the token from step 2.1.

### 3.1 Valid event creation (organizer)

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>" \
  -d '{"title":"Node.js Workshop","description":"Hands-on Node.js session","date":"2026-08-15","time":"10:00"}'
```

**Expected:** `201`
```json
{
  "message": "Event created",
  "event": {
    "id": "<uuid>",
    "title": "Node.js Workshop",
    "description": "Hands-on Node.js session",
    "date": "2026-08-15",
    "time": "10:00",
    "organizerId": "<uuid>",
    "participants": []
  }
}
```

> Save the `event.id` as `EVENT_ID`.

---

### 3.2 Attendee tries to create event → 403

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ATTENDEE_TOKEN>" \
  -d '{"title":"Unauthorized Event","description":"x","date":"2026-08-16","time":"09:00"}'
```

**Expected:** `403`
```json
{ "message": "Only organizers can create events" }
```

---

### 3.3 Missing fields → 400

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>" \
  -d '{"title":"Incomplete Event"}'
```

**Expected:** `400`
```json
{ "message": "title, description, date, and time are required" }
```

---

### 3.4 No token → 401

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -d '{"title":"No Auth","description":"x","date":"2026-08-15","time":"10:00"}'
```

**Expected:** `401`
```json
{ "message": "Authorization header missing or malformed" }
```

---

## 4. Get All Events — `GET /events`

### 4.1 Authenticated request

```bash
curl http://localhost:3000/events \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>"
```

**Expected:** `200` — array of events, each with `participantCount` (not raw `participants` array)
```json
[
  {
    "id": "<uuid>",
    "title": "Node.js Workshop",
    "description": "Hands-on Node.js session",
    "date": "2026-08-15",
    "time": "10:00",
    "organizerId": "<uuid>",
    "participantCount": 0
  }
]
```

---

### 4.2 No token → 401

```bash
curl http://localhost:3000/events
```

**Expected:** `401`

---

## 5. Get Single Event — `GET /events/:id`

### 5.1 Valid event

```bash
curl http://localhost:3000/events/<EVENT_ID> \
  -H "Authorization: Bearer <ATTENDEE_TOKEN>"
```

**Expected:** `200` — full event object including `participants` array

---

### 5.2 Non-existent event → 404

```bash
curl http://localhost:3000/events/non-existent-id \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>"
```

**Expected:** `404`
```json
{ "message": "Event not found" }
```

---

## 6. Update Event — `PUT /events/:id`

### 6.1 Partial update by owner (organizer)

```bash
curl -X PUT http://localhost:3000/events/<EVENT_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>" \
  -d '{"title":"Node.js Workshop — Updated","time":"11:00"}'
```

**Expected:** `200`
```json
{
  "message": "Event updated",
  "event": { "title": "Node.js Workshop — Updated", "time": "11:00", "..." : "..." }
}
```

---

### 6.2 Attendee tries to update → 403

```bash
curl -X PUT http://localhost:3000/events/<EVENT_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ATTENDEE_TOKEN>" \
  -d '{"title":"Hacked"}'
```

**Expected:** `403`
```json
{ "message": "Not authorized to update this event" }
```

---

### 6.3 Non-existent event → 404

```bash
curl -X PUT http://localhost:3000/events/bad-id \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>" \
  -d '{"title":"x"}'
```

**Expected:** `404`

---

## 7. Delete Event — `DELETE /events/:id`

### 7.1 Create a second event to delete

```bash
curl -X POST http://localhost:3000/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>" \
  -d '{"title":"Temp Event","description":"To be deleted","date":"2026-09-01","time":"09:00"}'
```

> Save the returned `event.id` as `DELETE_EVENT_ID`.

---

### 7.2 Delete by owner

```bash
curl -X DELETE http://localhost:3000/events/<DELETE_EVENT_ID> \
  -H "Authorization: Bearer <ORGANIZER_TOKEN>"
```

**Expected:** `200`
```json
{ "message": "Event deleted" }
```

---

### 7.3 Delete already-deleted event → 404

Run the same delete request again.

**Expected:** `404`
```json
{ "message": "Event not found" }
```

---

### 7.4 Attendee tries to delete → 403

```bash
curl -X DELETE http://localhost:3000/events/<EVENT_ID> \
  -H "Authorization: Bearer <ATTENDEE_TOKEN>"
```

**Expected:** `403`

---

## 8. Register for Event — `POST /events/:id/register`

### 8.1 Attendee registers for event

```bash
curl -X POST http://localhost:3000/events/<EVENT_ID>/register \
  -H "Authorization: Bearer <ATTENDEE_TOKEN>"
```

**Expected:** `200`
```json
{ "message": "Successfully registered for event" }
```

---

### 8.2 Duplicate registration → 409

Run the same request again.

**Expected:** `409`
```json
{ "message": "Already registered for this event" }
```

---

### 8.3 Verify participantCount increased

```bash
curl http://localhost:3000/events \
  -H "Authorization: Bearer <ATTENDEE_TOKEN>"
```

**Expected:** `participantCount` for `EVENT_ID` is now `1`.

---

### 8.4 Non-existent event → 404

```bash
curl -X POST http://localhost:3000/events/bad-id/register \
  -H "Authorization: Bearer <ATTENDEE_TOKEN>"
```

**Expected:** `404`

---

## 9. Auth Middleware Edge Cases

### 9.1 Malformed Authorization header → 401

```bash
curl http://localhost:3000/events \
  -H "Authorization: InvalidToken"
```

**Expected:** `401`
```json
{ "message": "Authorization header missing or malformed" }
```

---

### 9.2 Tampered token → 401

```bash
curl http://localhost:3000/events \
  -H "Authorization: Bearer invalidtoken123"
```

**Expected:** `401`
```json
{ "message": "Invalid or expired token" }
```

---

## Quick Reference — Status Codes

| Scenario | Status |
|---|---|
| Success (created) | 201 |
| Success (ok) | 200 |
| Missing / invalid input | 400 |
| Unauthenticated (no/bad token) | 401 |
| Unauthorized (wrong role/owner) | 403 |
| Resource not found | 404 |
| Duplicate registration | 409 |
