const request = require('supertest');
const app = require('../src/index');
const store = require('../src/store/inMemoryStore');

beforeEach(() => {
  store.users.length = 0;
  store.events.length = 0;
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function registerUser(overrides = {}) {
  const body = { name: 'Alice', email: 'alice@example.com', password: 'secret123', role: 'organizer', ...overrides };
  return request(app).post('/register').send(body);
}

async function loginUser(email = 'alice@example.com', password = 'secret123') {
  const res = await request(app).post('/login').send({ email, password });
  return res.body.token;
}

async function setupOrganizer() {
  await registerUser();
  return loginUser();
}

async function setupAttendee() {
  await registerUser({ name: 'Bob', email: 'bob@example.com', password: 'pass456', role: 'attendee' });
  return loginUser('bob@example.com', 'pass456');
}

async function createEvent(token, overrides = {}) {
  const body = { title: 'Node.js Workshop', description: 'Hands-on session', date: '2026-08-15', time: '10:00', ...overrides };
  return request(app).post('/events').set('Authorization', `Bearer ${token}`).send(body);
}

// ─── POST /register ──────────────────────────────────────────────────────────

describe('POST /register', () => {
  test('registers an organizer and returns 201 with userId', async () => {
    const res = await registerUser();
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ message: expect.any(String), userId: expect.any(String) });
  });

  test('registers an attendee and returns 201', async () => {
    const res = await registerUser({ name: 'Bob', email: 'bob@example.com', password: 'pass456', role: 'attendee' });
    expect(res.status).toBe(201);
    expect(res.body.userId).toBeDefined();
  });

  test('returns 400 when required fields are missing', async () => {
    const res = await request(app).post('/register').send({ name: 'Alice', email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for invalid role', async () => {
    const res = await registerUser({ role: 'admin' });
    expect(res.status).toBe(400);
  });

  test('returns 400 for duplicate email', async () => {
    await registerUser();
    const res = await registerUser();
    expect(res.status).toBe(400);
  });
});

// ─── POST /login ─────────────────────────────────────────────────────────────

describe('POST /login', () => {
  beforeEach(async () => { await registerUser(); });

  test('returns 200 and a JWT token on valid credentials', async () => {
    const res = await request(app).post('/login').send({ email: 'alice@example.com', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test('returns 400 when fields are missing', async () => {
    const res = await request(app).post('/login').send({ email: 'alice@example.com' });
    expect(res.status).toBe(400);
  });

  test('returns 401 for wrong password', async () => {
    const res = await request(app).post('/login').send({ email: 'alice@example.com', password: 'wrongpass' });
    expect(res.status).toBe(401);
  });

  test('returns 401 for unknown email', async () => {
    const res = await request(app).post('/login').send({ email: 'nobody@example.com', password: 'pass' });
    expect(res.status).toBe(401);
  });
});

// ─── Auth middleware ──────────────────────────────────────────────────────────

describe('Auth middleware', () => {
  test('returns 401 when Authorization header is missing', async () => {
    const res = await request(app).get('/events');
    expect(res.status).toBe(401);
  });

  test('returns 401 for malformed Authorization header', async () => {
    const res = await request(app).get('/events').set('Authorization', 'NotBearer token');
    expect(res.status).toBe(401);
  });

  test('returns 401 for a tampered token', async () => {
    const res = await request(app).get('/events').set('Authorization', 'Bearer fakeinvalidtoken');
    expect(res.status).toBe(401);
  });
});

// ─── POST /events ─────────────────────────────────────────────────────────────

describe('POST /events', () => {
  test('organizer can create an event and receives 201', async () => {
    const token = await setupOrganizer();
    const res = await createEvent(token);
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({
      id: expect.any(String),
      title: 'Node.js Workshop',
      description: 'Hands-on session',
      date: '2026-08-15',
      time: '10:00',
      participants: [],
    });
  });

  test('returns 403 when an attendee tries to create an event', async () => {
    const token = await setupAttendee();
    const res = await createEvent(token);
    expect(res.status).toBe(403);
  });

  test('returns 400 when required fields are missing', async () => {
    const token = await setupOrganizer();
    const res = await request(app)
      .post('/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Incomplete' });
    expect(res.status).toBe(400);
  });

  test('returns 401 with no token', async () => {
    const res = await request(app).post('/events').send({ title: 'x', description: 'x', date: '2026-08-15', time: '10:00' });
    expect(res.status).toBe(401);
  });
});

// ─── GET /events ──────────────────────────────────────────────────────────────

describe('GET /events', () => {
  test('returns 200 with an array of events including participantCount', async () => {
    const token = await setupOrganizer();
    await createEvent(token);
    const res = await request(app).get('/events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toHaveProperty('participantCount', 0);
    expect(res.body[0]).not.toHaveProperty('participants');
  });

  test('returns 200 with empty array when no events exist', async () => {
    const token = await setupOrganizer();
    const res = await request(app).get('/events').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test('returns 401 without token', async () => {
    const res = await request(app).get('/events');
    expect(res.status).toBe(401);
  });
});

// ─── GET /events/:id ──────────────────────────────────────────────────────────

describe('GET /events/:id', () => {
  test('returns 200 with full event object including participants array', async () => {
    const token = await setupOrganizer();
    const created = await createEvent(token);
    const id = created.body.event.id;

    const res = await request(app).get(`/events/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('participants');
    expect(res.body.id).toBe(id);
  });

  test('returns 404 for non-existent event', async () => {
    const token = await setupOrganizer();
    const res = await request(app).get('/events/non-existent-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ─── PUT /events/:id ─────────────────────────────────────────────────────────

describe('PUT /events/:id', () => {
  test('organizer can partially update their event', async () => {
    const token = await setupOrganizer();
    const created = await createEvent(token);
    const id = created.body.event.id;

    const res = await request(app)
      .put(`/events/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', time: '11:00' });

    expect(res.status).toBe(200);
    expect(res.body.event.title).toBe('Updated Title');
    expect(res.body.event.time).toBe('11:00');
    expect(res.body.event.description).toBe('Hands-on session');
  });

  test('returns 403 when attendee tries to update', async () => {
    const orgToken = await setupOrganizer();
    const created = await createEvent(orgToken);
    const id = created.body.event.id;
    const attToken = await setupAttendee();

    const res = await request(app)
      .put(`/events/${id}`)
      .set('Authorization', `Bearer ${attToken}`)
      .send({ title: 'Hacked' });
    expect(res.status).toBe(403);
  });

  test('returns 404 for non-existent event', async () => {
    const token = await setupOrganizer();
    const res = await request(app)
      .put('/events/bad-id')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /events/:id ───────────────────────────────────────────────────────

describe('DELETE /events/:id', () => {
  test('organizer can delete their own event', async () => {
    const token = await setupOrganizer();
    const created = await createEvent(token);
    const id = created.body.event.id;

    const res = await request(app).delete(`/events/${id}`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const check = await request(app).get(`/events/${id}`).set('Authorization', `Bearer ${token}`);
    expect(check.status).toBe(404);
  });

  test('returns 403 when attendee tries to delete', async () => {
    const orgToken = await setupOrganizer();
    const created = await createEvent(orgToken);
    const id = created.body.event.id;
    const attToken = await setupAttendee();

    const res = await request(app).delete(`/events/${id}`).set('Authorization', `Bearer ${attToken}`);
    expect(res.status).toBe(403);
  });

  test('returns 404 for non-existent event', async () => {
    const token = await setupOrganizer();
    const res = await request(app).delete('/events/bad-id').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

// ─── POST /events/:id/register ────────────────────────────────────────────────

describe('POST /events/:id/register', () => {
  test('attendee can register for an event and receives 200', async () => {
    const orgToken = await setupOrganizer();
    const created = await createEvent(orgToken);
    const id = created.body.event.id;
    const attToken = await setupAttendee();

    const res = await request(app)
      .post(`/events/${id}/register`)
      .set('Authorization', `Bearer ${attToken}`);
    expect(res.status).toBe(200);
  });

  test('participantCount increments after registration', async () => {
    const orgToken = await setupOrganizer();
    const created = await createEvent(orgToken);
    const id = created.body.event.id;
    const attToken = await setupAttendee();

    await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attToken}`);

    const list = await request(app).get('/events').set('Authorization', `Bearer ${orgToken}`);
    const event = list.body.find(e => e.id === id);
    expect(event.participantCount).toBe(1);
  });

  test('returns 409 on duplicate registration', async () => {
    const orgToken = await setupOrganizer();
    const created = await createEvent(orgToken);
    const id = created.body.event.id;
    const attToken = await setupAttendee();

    await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attToken}`);
    const res = await request(app).post(`/events/${id}/register`).set('Authorization', `Bearer ${attToken}`);
    expect(res.status).toBe(409);
  });

  test('returns 404 for non-existent event', async () => {
    const attToken = await setupAttendee();
    const res = await request(app)
      .post('/events/bad-id/register')
      .set('Authorization', `Bearer ${attToken}`);
    expect(res.status).toBe(404);
  });

  test('organizer can also register for an event', async () => {
    const orgToken = await setupOrganizer();
    const created = await createEvent(orgToken);
    const id = created.body.event.id;

    const res = await request(app)
      .post(`/events/${id}/register`)
      .set('Authorization', `Bearer ${orgToken}`);
    expect(res.status).toBe(200);
  });
});
