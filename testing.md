# API Testing Guide — Virtual Event Management

**Live URL:** `https://event-management-it33.onrender.com`  
**Local URL:** `http://localhost:3000`

---

## Run Automated Tests

```bash
npm test
```

All 32 tests should pass covering registration, login, auth middleware, and all event CRUD + registration flows.

---

## Manual Testing (Step-by-Step)

Follow these steps in order — each step uses data from the previous one.

---

### Step 1 — Register an Organizer

**POST** `/register`

```bash
curl -X POST https://event-management-it33.onrender.com/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com","password":"secret123","role":"organizer"}'
```

**Expected response — 201**
```json
{
  "message": "User registered successfully",
  "userId": "<uuid>"
}
```

---

### Step 2 — Register an Attendee

**POST** `/register`

```bash
curl -X POST https://event-management-it33.onrender.com/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Bob","email":"bob@example.com","password":"pass456","role":"attendee"}'
```

**Expected response — 201**
```json
{
  "message": "User registered successfully",
  "userId": "<uuid>"
}
```

---

### Step 3 — Login as Organizer

**POST** `/login`

```bash
curl -X POST https://event-management-it33.onrender.com/login \
  -H "Content-Type: application/json" \
  -d '{"email":"alice@example.com","password":"secret123"}'
```

**Expected response — 200**
```json
{
  "token": "<jwt-token>"
}
```

> Copy this token — you will use it as `ORG_TOKEN` in the steps below.

---

### Step 4 — Login as Attendee

**POST** `/login`

```bash
curl -X POST https://event-management-it33.onrender.com/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bob@example.com","password":"pass456"}'
```

**Expected response — 200**
```json
{
  "token": "<jwt-token>"
}
```

> Copy this token — you will use it as `ATT_TOKEN` in the steps below.

---

### Step 5 — Create an Event (Organizer only)

**POST** `/events`

```bash
curl -X POST https://event-management-it33.onrender.com/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ORG_TOKEN>" \
  -d '{"title":"Node.js Workshop","description":"Hands-on session","date":"2026-08-15","time":"10:00"}'
```

**Expected response — 201**
```json
{
  "message": "Event created",
  "event": {
    "id": "<event-id>",
    "title": "Node.js Workshop",
    "description": "Hands-on session",
    "date": "2026-08-15",
    "time": "10:00",
    "participants": []
  }
}
```

> Copy the `id` value — you will use it as `EVENT_ID` below.

---

### Step 6 — List All Events

**GET** `/events`

```bash
curl https://event-management-it33.onrender.com/events \
  -H "Authorization: Bearer <ORG_TOKEN>"
```

**Expected response — 200**
```json
[
  {
    "id": "<event-id>",
    "title": "Node.js Workshop",
    "participantCount": 0
  }
]
```

> Note: `participants` array is hidden in list view; only `participantCount` is shown.

---

### Step 7 — Get Single Event Details

**GET** `/events/:id`

```bash
curl https://event-management-it33.onrender.com/events/<EVENT_ID> \
  -H "Authorization: Bearer <ORG_TOKEN>"
```

**Expected response — 200**
```json
{
  "id": "<event-id>",
  "title": "Node.js Workshop",
  "description": "Hands-on session",
  "date": "2026-08-15",
  "time": "10:00",
  "participants": []
}
```

---

### Step 8 — Update an Event (Organizer only)

**PUT** `/events/:id`

```bash
curl -X PUT https://event-management-it33.onrender.com/events/<EVENT_ID> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <ORG_TOKEN>" \
  -d '{"title":"Updated Workshop","time":"11:00"}'
```

**Expected response — 200**
```json
{
  "message": "Event updated",
  "event": {
    "title": "Updated Workshop",
    "time": "11:00",
    "description": "Hands-on session"
  }
}
```

---

### Step 9 — Register for an Event (Attendee)

**POST** `/events/:id/register`

```bash
curl -X POST https://event-management-it33.onrender.com/events/<EVENT_ID>/register \
  -H "Authorization: Bearer <ATT_TOKEN>"
```

**Expected response — 200**
```json
{
  "message": "Successfully registered for event"
}
```

After this, re-run Step 6 and confirm `participantCount` is now `1`.

---

### Step 10 — Delete an Event (Organizer only)

**DELETE** `/events/:id`

```bash
curl -X DELETE https://event-management-it33.onrender.com/events/<EVENT_ID> \
  -H "Authorization: Bearer <ORG_TOKEN>"
```

**Expected response — 200**
```json
{
  "message": "Event deleted"
}
```

---

## Error / Edge Case Testing

| Scenario | Request | Expected |
|----------|---------|----------|
| Missing fields on register | POST `/register` without `password` | `400 Bad Request` |
| Invalid role on register | `"role": "admin"` | `400 Bad Request` |
| Duplicate email | Register same email twice | `400 Bad Request` |
| Wrong password on login | Incorrect password | `401 Unauthorized` |
| No token on protected route | GET `/events` without header | `401 Unauthorized` |
| Tampered token | `Authorization: Bearer faketoken` | `401 Unauthorized` |
| Attendee creates event | POST `/events` with `ATT_TOKEN` | `403 Forbidden` |
| Attendee deletes event | DELETE `/events/:id` with `ATT_TOKEN` | `403 Forbidden` |
| Duplicate event registration | Register for same event twice | `409 Conflict` |
| Non-existent event | GET `/events/bad-id` | `404 Not Found` |

---

## Test Results (Latest Run)

```
Test Suites: 1 passed, 1 total
Tests:       32 passed, 32 total
Time:        ~8s
```
