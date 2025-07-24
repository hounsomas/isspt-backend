const express = require('express');
const router = express.Router();
const controller = require('../controllers/demandeBourseController');

// Lister toutes les demandes
router.get('/', controller.getAllDemandes);
// Récupérer une demande par ID
router.get('/:id', controller.getDemandeById);
// Créer une nouvelle demande
router.post('/', controller.createDemande);
// Mettre à jour le statut d'une demande
router.patch('/:id/statut', controller.updateStatutDemande);
// Supprimer une demande
router.delete('/:id', controller.deleteDemande);

module.exports = router; 