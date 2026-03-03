const express = require('express');
const router = express.Router();
const cronogramaController = require('../controllers/cronogramaController');
const auth = require('../middleware/auth');

// GET /api/cronograma?from=ISO&to=ISO
router.get('/', auth, cronogramaController.listEvents);
// POST /api/cronograma
router.post('/', auth, cronogramaController.createEvent);
// PUT /api/cronograma/:id
router.put('/:id', auth, cronogramaController.updateEvent);
// DELETE /api/cronograma/:id
router.delete('/:id', auth, cronogramaController.deleteEvent);

module.exports = router;
