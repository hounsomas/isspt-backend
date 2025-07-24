const express = require('express');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken } = require('./auth');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Validation pour la création/modification d'emploi du temps
const validateEmploi = [
  body('cours_id').isInt().withMessage('ID du cours invalide'),
  body('jour').isIn(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']).withMessage('Jour invalide'),
  body('heure_debut').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Format d\'heure invalide (HH:MM)'),
  body('heure_fin').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('Format d\'heure invalide (HH:MM)'),
  body('salle').notEmpty().withMessage('La salle est requise'),
  body('type_seance').isIn(['cours', 'tp', 'td', 'examen']).withMessage('Type de séance invalide')
];

// GET - Récupérer tous les emplois du temps
router.get('/', authenticateToken, (req, res) => {
  const { cours_id, jour, salle, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT et.*, c.nom as cours_nom, c.code as cours_code,
           p.nom as professeur_nom, p.prenom as professeur_prenom
    FROM emplois_temps et
    INNER JOIN cours c ON et.cours_id = c.id
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE 1=1
  `;
  let params = [];

  if (cours_id) {
    query += ` AND et.cours_id = ?`;
    params.push(cours_id);
  }

  if (jour) {
    query += ` AND et.jour = ?`;
    params.push(jour);
  }

  if (salle) {
    query += ` AND et.salle LIKE ?`;
    params.push(`%${salle}%`);
  }

  query += ` ORDER BY et.jour, et.heure_debut LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, emplois) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des emplois du temps' });
    }

    // Compter le total pour la pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM emplois_temps et
      WHERE 1=1
    `;
    let countParams = [];

    if (cours_id) {
      countQuery += ` AND et.cours_id = ?`;
      countParams.push(cours_id);
    }

    if (jour) {
      countQuery += ` AND et.jour = ?`;
      countParams.push(jour);
    }

    if (salle) {
      countQuery += ` AND et.salle LIKE ?`;
      countParams.push(`%${salle}%`);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        emplois,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: result.total,
          pages: Math.ceil(result.total / limit)
        }
      });
    });
  });
});

// GET - Récupérer l'emploi du temps par jour
router.get('/jour/:jour', authenticateToken, (req, res) => {
  const { jour } = req.params;

  db.all(`
    SELECT et.*, c.nom as cours_nom, c.code as cours_code,
           p.nom as professeur_nom, p.prenom as professeur_prenom
    FROM emplois_temps et
    INNER JOIN cours c ON et.cours_id = c.id
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE et.jour = ?
    ORDER BY et.heure_debut
  `, [jour], (err, emplois) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération de l\'emploi du temps' });
    }

    res.json({ emplois });
  });
});

// GET - Récupérer l'emploi du temps d'un cours
router.get('/cours/:cours_id', authenticateToken, (req, res) => {
  const { cours_id } = req.params;

  db.all(`
    SELECT et.*, c.nom as cours_nom, c.code as cours_code,
           p.nom as professeur_nom, p.prenom as professeur_prenom
    FROM emplois_temps et
    INNER JOIN cours c ON et.cours_id = c.id
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE et.cours_id = ?
    ORDER BY et.jour, et.heure_debut
  `, [cours_id], (err, emplois) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération de l\'emploi du temps' });
    }

    res.json({ emplois });
  });
});

// GET - Récupérer un emploi du temps par ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT et.*, c.nom as cours_nom, c.code as cours_code,
           p.nom as professeur_nom, p.prenom as professeur_prenom
    FROM emplois_temps et
    INNER JOIN cours c ON et.cours_id = c.id
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE et.id = ?
  `, [id], (err, emploi) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération de l\'emploi du temps' });
    }

    if (!emploi) {
      return res.status(404).json({ error: 'Emploi du temps non trouvé' });
    }

    res.json({ emploi });
  });
});

// POST - Créer un nouvel emploi du temps
router.post('/', authenticateToken, validateEmploi, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    cours_id,
    jour,
    heure_debut,
    heure_fin,
    salle,
    type_seance
  } = req.body;

  // Vérifier si le cours existe
  db.get('SELECT id FROM cours WHERE id = ?', [cours_id], (err, cours) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!cours) {
      return res.status(404).json({ error: 'Cours non trouvé' });
    }

    // Vérifier les conflits d'horaires pour la salle
    db.get(`
      SELECT id FROM emplois_temps 
      WHERE salle = ? AND jour = ? AND 
            ((heure_debut <= ? AND heure_fin > ?) OR 
             (heure_debut < ? AND heure_fin >= ?) OR
             (heure_debut >= ? AND heure_fin <= ?))
    `, [salle, jour, heure_debut, heure_debut, heure_fin, heure_fin, heure_debut, heure_fin], (err, conflit) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (conflit) {
        return res.status(400).json({ error: 'Conflit d\'horaires pour cette salle' });
      }

      // Créer l'emploi du temps
      db.run(`
        INSERT INTO emplois_temps (
          cours_id, jour, heure_debut, heure_fin, salle, type_seance
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, [cours_id, jour, heure_debut, heure_fin, salle, type_seance], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la création de l\'emploi du temps' });
        }

        // Récupérer l'emploi du temps créé
        db.get(`
          SELECT et.*, c.nom as cours_nom, c.code as cours_code,
                 p.nom as professeur_nom, p.prenom as professeur_prenom
          FROM emplois_temps et
          INNER JOIN cours c ON et.cours_id = c.id
          LEFT JOIN professeurs p ON c.professeur_id = p.id
          WHERE et.id = ?
        `, [this.lastID], (err, emploi) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération de l\'emploi du temps' });
          }

          res.status(201).json({
            message: 'Emploi du temps créé avec succès',
            emploi
          });
        });
      });
    });
  });
});

// PUT - Modifier un emploi du temps
router.put('/:id', authenticateToken, validateEmploi, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const {
    cours_id,
    jour,
    heure_debut,
    heure_fin,
    salle,
    type_seance
  } = req.body;

  // Vérifier si l'emploi du temps existe
  db.get('SELECT id FROM emplois_temps WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Emploi du temps non trouvé' });
    }

    // Vérifier les conflits d'horaires pour la salle (sauf pour cet emploi)
    db.get(`
      SELECT id FROM emplois_temps 
      WHERE salle = ? AND jour = ? AND id != ? AND
            ((heure_debut <= ? AND heure_fin > ?) OR 
             (heure_debut < ? AND heure_fin >= ?) OR
             (heure_debut >= ? AND heure_fin <= ?))
    `, [salle, jour, id, heure_debut, heure_debut, heure_fin, heure_fin, heure_debut, heure_fin], (err, conflit) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (conflit) {
        return res.status(400).json({ error: 'Conflit d\'horaires pour cette salle' });
      }

      // Mettre à jour l'emploi du temps
      db.run(`
        UPDATE emplois_temps SET 
          cours_id = ?, jour = ?, heure_debut = ?, heure_fin = ?, 
          salle = ?, type_seance = ?
        WHERE id = ?
      `, [cours_id, jour, heure_debut, heure_fin, salle, type_seance, id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'emploi du temps' });
        }

        // Récupérer l'emploi du temps mis à jour
        db.get(`
          SELECT et.*, c.nom as cours_nom, c.code as cours_code,
                 p.nom as professeur_nom, p.prenom as professeur_prenom
          FROM emplois_temps et
          INNER JOIN cours c ON et.cours_id = c.id
          LEFT JOIN professeurs p ON c.professeur_id = p.id
          WHERE et.id = ?
        `, [id], (err, emploi) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération de l\'emploi du temps' });
          }

          res.json({
            message: 'Emploi du temps mis à jour avec succès',
            emploi
          });
        });
      });
    });
  });
});

// DELETE - Supprimer un emploi du temps
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Vérifier si l'emploi du temps existe
  db.get('SELECT id FROM emplois_temps WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Emploi du temps non trouvé' });
    }

    // Supprimer l'emploi du temps
    db.run('DELETE FROM emplois_temps WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la suppression de l\'emploi du temps' });
      }

      res.json({ message: 'Emploi du temps supprimé avec succès' });
    });
  });
});

// GET - Vérifier les conflits d'horaires
router.get('/conflits/verifier', authenticateToken, (req, res) => {
  const { salle, jour, heure_debut, heure_fin, emploi_id } = req.query;

  let query = `
    SELECT et.*, c.nom as cours_nom, c.code as cours_code
    FROM emplois_temps et
    INNER JOIN cours c ON et.cours_id = c.id
    WHERE salle = ? AND jour = ? AND 
          ((heure_debut <= ? AND heure_fin > ?) OR 
           (heure_debut < ? AND heure_fin >= ?) OR
           (heure_debut >= ? AND heure_fin <= ?))
  `;
  let params = [salle, jour, heure_debut, heure_debut, heure_fin, heure_fin, heure_debut, heure_fin];

  if (emploi_id) {
    query += ` AND et.id != ?`;
    params.push(emploi_id);
  }

  db.all(query, params, (err, conflits) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la vérification des conflits' });
    }

    res.json({ 
      conflits,
      hasConflits: conflits.length > 0
    });
  });
});

// GET - Statistiques des emplois du temps
router.get('/stats/overview', authenticateToken, (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM emplois_temps',
    parJour: 'SELECT jour, COUNT(*) as count FROM emplois_temps GROUP BY jour ORDER BY jour',
    parType: 'SELECT type_seance, COUNT(*) as count FROM emplois_temps GROUP BY type_seance',
    parSalle: 'SELECT salle, COUNT(*) as count FROM emplois_temps GROUP BY salle ORDER BY count DESC'
  };

  const stats = {};

  // Exécuter toutes les requêtes
  db.get(queries.total, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    stats.total = result.count;

    db.all(queries.parJour, (err, result) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
      stats.parJour = result;

      db.all(queries.parType, (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
        stats.parType = result;

        db.all(queries.parSalle, (err, result) => {
          if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
          stats.parSalle = result;

          res.json({ stats });
        });
      });
    });
  });
});

module.exports = router; 