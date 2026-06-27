require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({
    name: 'Virtual Event Management API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: {
        'POST /register': 'Register a new user (organizer or attendee)',
        'POST /login': 'Login and receive a JWT token',
      },
      events: {
        'GET /events': 'List all events (auth required)',
        'POST /events': 'Create an event (organizer only)',
        'GET /events/:id': 'Get event details (auth required)',
        'PUT /events/:id': 'Update an event (organizer only)',
        'DELETE /events/:id': 'Delete an event (organizer only)',
        'POST /events/:id/register': 'Register for an event (auth required)',
      },
    },
  });
});

app.use('/', authRoutes);
app.use('/events', eventRoutes);

module.exports = app;

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}
