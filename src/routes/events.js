const express = require('express');
const { authenticate } = require('../middleware/auth');
const {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  registerForEvent,
} = require('../controllers/eventController');

const router = express.Router();

router.get('/', authenticate, listEvents);
router.get('/:id', authenticate, getEvent);
router.post('/', authenticate, createEvent);
router.put('/:id', authenticate, updateEvent);
router.delete('/:id', authenticate, deleteEvent);
router.post('/:id/register', authenticate, registerForEvent);

module.exports = router;
