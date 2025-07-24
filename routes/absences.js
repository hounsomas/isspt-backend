const express = require('express');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken } = require('./auth');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Validation pour la création/modification d'absence
const validateAbsence = [
  body('etudiant_id').isInt().withMessage('ID de l\'étudiant invalide'),
  body('cours_id').isInt().withMessage('ID du cours invalide'),
  body('date_absence').isDate().withMessage('Date d\'absence invalide'),
  body('motif').optional().isString().withMessage('Le motif doit être une chaîne de caractères'),
  body('justifiee').isBoolean().withMessage('Le statut de justification doit être un booléen')
];

// GET - Récupérer toutes les absences
router.get('/', authenticateToken, (req, res) => {
  const { etudiant_id, cours_id, date_debut, date_fin, justifiee, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT a.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
           c.nom as cours_nom, c.code as cours_code
    FROM absences a
    INNER JOIN etudiants e ON a.etudiant_id = e.id
    INNER JOIN cours c ON a.cours_id = c.id
    WHERE 1=1
  `;
  let params = [];

  if (etudiant_id) {
    query += ` AND a.etudiant_id = ?`;
    params.push(etudiant_id);
  }

  if (cours_id) {
    query += ` AND a.cours_id = ?`;
    params.push(cours_id);
  }

  if (date_debut) {
    query += ` AND a.date_absence >= ?`;
    params.push(date_debut);
  }

  if (date_fin) {
    query += ` AND a.date_absence <= ?`;
    params.push(date_fin);
  }

  if (justifiee !== undefined) {
    query += ` AND a.justifiee = ?`;
    params.push(justifiee === 'true' ? 1 : 0);
  }

  query += ` ORDER BY a.date_absence DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, absences) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des absences' });
    }

    // Compter le total pour la pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM absences a
      WHERE 1=1
    `;
    let countParams = [];

    if (etudiant_id) {
      countQuery += ` AND a.etudiant_id = ?`;
      countParams.push(etudiant_id);
    }

    if (cours_id) {
      countQuery += ` AND a.cours_id = ?`;
      countParams.push(cours_id);
    }

    if (date_debut) {
      countQuery += ` AND a.date_absence >= ?`;
      countParams.push(date_debut);
    }

    if (date_fin) {
      countQuery += ` AND a.date_absence <= ?`;
      countParams.push(date_fin);
    }

    if (justifiee !== undefined) {
      countQuery += ` AND a.justifiee = ?`;
      countParams.push(justifiee === 'true' ? 1 : 0);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        absences,
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

// GET - Récupérer une absence par ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT a.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
           c.nom as cours_nom, c.code as cours_code
    FROM absences a
    INNER JOIN etudiants e ON a.etudiant_id = e.id
    INNER JOIN cours c ON a.cours_id = c.id
    WHERE a.id = ?
  `, [id], (err, absence) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération de l\'absence' });
    }

    if (!absence) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }

    res.json({ absence });
  });
});

// POST - Créer une nouvelle absence
router.post('/', authenticateToken, validateAbsence, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    etudiant_id,
    cours_id,
    date_absence,
    motif,
    justifiee
  } = req.body;

  // Vérifier si l'étudiant existe
  db.get('SELECT id FROM etudiants WHERE id = ?', [etudiant_id], (err, etudiant) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!etudiant) {
      return res.status(404).json({ error: 'Étudiant non trouvé' });
    }

    // Vérifier si le cours existe
    db.get('SELECT id FROM cours WHERE id = ?', [cours_id], (err, cours) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (!cours) {
        return res.status(404).json({ error: 'Cours non trouvé' });
      }

      // Vérifier si l'étudiant est inscrit au cours
      db.get('SELECT id FROM inscriptions WHERE etudiant_id = ? AND cours_id = ?', [etudiant_id, cours_id], (err, inscription) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur de base de données' });
        }

        if (!inscription) {
          return res.status(400).json({ error: 'Cet étudiant n\'est pas inscrit à ce cours' });
        }

        // Vérifier si l'absence existe déjà pour cette date
        db.get('SELECT id FROM absences WHERE etudiant_id = ? AND cours_id = ? AND date_absence = ?', 
          [etudiant_id, cours_id, date_absence], (err, existing) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur de base de données' });
          }

          if (existing) {
            return res.status(400).json({ error: 'Une absence existe déjà pour cet étudiant à cette date' });
          }

          // Créer l'absence
          db.run(`
            INSERT INTO absences (
              etudiant_id, cours_id, date_absence, motif, justifiee
            ) VALUES (?, ?, ?, ?, ?)
          `, [etudiant_id, cours_id, date_absence, motif, justifiee ? 1 : 0], function(err) {
            if (err) {
              return res.status(500).json({ error: 'Erreur lors de la création de l\'absence' });
            }

            // Récupérer l'absence créée
            db.get(`
              SELECT a.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
                     c.nom as cours_nom, c.code as cours_code
              FROM absences a
              INNER JOIN etudiants e ON a.etudiant_id = e.id
              INNER JOIN cours c ON a.cours_id = c.id
              WHERE a.id = ?
            `, [this.lastID], (err, absence) => {
              if (err) {
                return res.status(500).json({ error: 'Erreur lors de la récupération de l\'absence' });
              }

              res.status(201).json({
                message: 'Absence créée avec succès',
                absence
              });
            });
          });
        });
      });
    });
  });
});

// PUT - Modifier une absence
router.put('/:id', authenticateToken, validateAbsence, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const {
    etudiant_id,
    cours_id,
    date_absence,
    motif,
    justifiee
  } = req.body;

  // Vérifier si l'absence existe
  db.get('SELECT id FROM absences WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }

    // Vérifier si une autre absence existe pour la même date (sauf celle-ci)
    db.get('SELECT id FROM absences WHERE etudiant_id = ? AND cours_id = ? AND date_absence = ? AND id != ?', 
      [etudiant_id, cours_id, date_absence, id], (err, duplicate) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (duplicate) {
        return res.status(400).json({ error: 'Une absence existe déjà pour cet étudiant à cette date' });
      }

      // Mettre à jour l'absence
      db.run(`
        UPDATE absences SET 
          etudiant_id = ?, cours_id = ?, date_absence = ?, motif = ?, justifiee = ?
        WHERE id = ?
      `, [etudiant_id, cours_id, date_absence, motif, justifiee ? 1 : 0, id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'absence' });
        }

        // Récupérer l'absence mise à jour
        db.get(`
          SELECT a.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
                 c.nom as cours_nom, c.code as cours_code
          FROM absences a
          INNER JOIN etudiants e ON a.etudiant_id = e.id
          INNER JOIN cours c ON a.cours_id = c.id
          WHERE a.id = ?
        `, [id], (err, absence) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération de l\'absence' });
          }

          res.json({
            message: 'Absence mise à jour avec succès',
            absence
          });
        });
      });
    });
  });
});

// DELETE - Supprimer une absence
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Vérifier si l'absence existe
  db.get('SELECT id FROM absences WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }

    // Supprimer l'absence
    db.run('DELETE FROM absences WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la suppression de l\'absence' });
      }

      res.json({ message: 'Absence supprimée avec succès' });
    });
  });
});

// PUT - Justifier une absence
router.put('/:id/justifier', authenticateToken, [
  body('justifiee').isBoolean().withMessage('Le statut de justification doit être un booléen'),
  body('motif').optional().isString().withMessage('Le motif doit être une chaîne de caractères')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { justifiee, motif } = req.body;

  // Vérifier si l'absence existe
  db.get('SELECT id FROM absences WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Absence non trouvée' });
    }

    // Mettre à jour la justification
    const updateFields = ['justifiee = ?'];
    const params = [justifiee ? 1 : 0];

    if (motif !== undefined) {
      updateFields.push('motif = ?');
      params.push(motif);
    }

    params.push(id);

    db.run(`UPDATE absences SET ${updateFields.join(', ')} WHERE id = ?`, params, function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la mise à jour de la justification' });
      }

      res.json({ 
        message: `Absence ${justifiee ? 'justifiée' : 'non justifiée'} avec succès` 
      });
    });
  });
});

// GET - Récupérer les absences d'un étudiant
router.get('/etudiant/:etudiant_id', authenticateToken, (req, res) => {
  const { etudiant_id } = req.params;
  const { date_debut, date_fin, justifiee, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT a.*, c.nom as cours_nom, c.code as cours_code
    FROM absences a
    INNER JOIN cours c ON a.cours_id = c.id
    WHERE a.etudiant_id = ?
  `;
  let params = [etudiant_id];

  if (date_debut) {
    query += ` AND a.date_absence >= ?`;
    params.push(date_debut);
  }

  if (date_fin) {
    query += ` AND a.date_absence <= ?`;
    params.push(date_fin);
  }

  if (justifiee !== undefined) {
    query += ` AND a.justifiee = ?`;
    params.push(justifiee === 'true' ? 1 : 0);
  }

  query += ` ORDER BY a.date_absence DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, absences) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des absences' });
    }

    // Compter le total
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM absences a
      WHERE a.etudiant_id = ?
    `;
    let countParams = [etudiant_id];

    if (date_debut) {
      countQuery += ` AND a.date_absence >= ?`;
      countParams.push(date_debut);
    }

    if (date_fin) {
      countQuery += ` AND a.date_absence <= ?`;
      countParams.push(date_fin);
    }

    if (justifiee !== undefined) {
      countQuery += ` AND a.justifiee = ?`;
      countParams.push(justifiee === 'true' ? 1 : 0);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        absences,
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

// GET - Statistiques des absences
router.get('/stats/overview', authenticateToken, (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM absences',
    justifiees: 'SELECT COUNT(*) as count FROM absences WHERE justifiee = 1',
    nonJustifiees: 'SELECT COUNT(*) as count FROM absences WHERE justifiee = 0',
    parMois: `
      SELECT strftime('%Y-%m', date_absence) as mois, COUNT(*) as count
      FROM absences 
      GROUP BY mois 
      ORDER BY mois DESC 
      LIMIT 12
    `,
    parCours: `
      SELECT c.nom as cours_nom, COUNT(a.id) as count
      FROM absences a
      INNER JOIN cours c ON a.cours_id = c.id
      GROUP BY c.id, c.nom
      ORDER BY count DESC
      LIMIT 10
    `
  };

  const stats = {};

  // Exécuter toutes les requêtes
  db.get(queries.total, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    stats.total = result.count;

    db.get(queries.justifiees, (err, result) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
      stats.justifiees = result.count;

      db.get(queries.nonJustifiees, (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
        stats.nonJustifiees = result.count;

        db.all(queries.parMois, (err, result) => {
          if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
          stats.parMois = result;

          db.all(queries.parCours, (err, result) => {
            if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
            stats.parCours = result;

            res.json({ stats });
          });
        });
      });
    });
  });
});

module.exports = router; 