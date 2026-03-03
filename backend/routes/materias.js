const express = require('express');
const router = express.Router();
const materiaController = require('../controllers/materiaController');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// User endpoints (specific routes first to avoid conflicts with dynamic admin routes)
router.get('/minhas', auth, materiaController.getMinhasMaterias);
router.get('/disponiveis', auth, materiaController.getMateriasDisponiveis);
router.get('/plan', auth, materiaController.getStudyPlan);
router.post('/adicionar', auth, materiaController.adicionarMateria);
// Allow users to suggest a new subject and add it to their materias
router.post('/sugerir', auth, materiaController.sugerirMateria);
router.put('/progresso', auth, materiaController.atualizarProgresso);
router.delete('/remover/:subject_id', auth, materiaController.removerMateria);

// Admin CRUD for subjects (place after specific user routes so dynamic ':id' does not mistakenly match)
router.get('/', auth, admin, materiaController.getAllMaterias);
router.post('/', auth, admin, materiaController.createMateria);
router.put('/:id', auth, admin, materiaController.updateMateria);
router.delete('/:id', auth, admin, materiaController.deleteMateria);

module.exports = router;