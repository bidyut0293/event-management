const { v4: uuidv4 } = require('uuid');
const { events, users } = require('../store/inMemoryStore');
const { sendEventConfirmation } = require('../services/emailService');

function listEvents(req, res) {
  const result = events.map(({ participants, ...rest }) => ({
    ...rest,
    participantCount: participants.length,
  }));
  return res.status(200).json(result);
}

function getEvent(req, res) {
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  return res.status(200).json(event);
}

function createEvent(req, res) {
  if (req.user.role !== 'organizer') {
    return res.status(403).json({ message: 'Only organizers can create events' });
  }

  const { title, description, date, time } = req.body;
  if (!title || !description || !date || !time) {
    return res.status(400).json({ message: 'title, description, date, and time are required' });
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
  return res.status(201).json({ message: 'Event created', event });
}

function updateEvent(req, res) {
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });
  if (event.organizerId !== req.user.userId) {
    return res.status(403).json({ message: 'Not authorized to update this event' });
  }

  const { title, description, date, time } = req.body;
  if (title !== undefined) event.title = title;
  if (description !== undefined) event.description = description;
  if (date !== undefined) event.date = date;
  if (time !== undefined) event.time = time;

  return res.status(200).json({ message: 'Event updated', event });
}

function deleteEvent(req, res) {
  const index = events.findIndex(e => e.id === req.params.id);
  if (index === -1) return res.status(404).json({ message: 'Event not found' });
  if (events[index].organizerId !== req.user.userId) {
    return res.status(403).json({ message: 'Not authorized to delete this event' });
  }

  events.splice(index, 1);
  return res.status(200).json({ message: 'Event deleted' });
}

async function registerForEvent(req, res) {
  const event = events.find(e => e.id === req.params.id);
  if (!event) return res.status(404).json({ message: 'Event not found' });

  const { userId } = req.user;
  if (event.participants.includes(userId)) {
    return res.status(409).json({ message: 'Already registered for this event' });
  }

  event.participants.push(userId);

  const user = users.find(u => u.id === userId);
  if (user) {
    user.registeredEvents.push(event.id);
    sendEventConfirmation(user.email, user.name, event)
      .catch(err => console.error('Confirmation email error:', err));
  }

  return res.status(200).json({ message: 'Successfully registered for event' });
}

module.exports = { listEvents, getEvent, createEvent, updateEvent, deleteEvent, registerForEvent };
