const express = require('express');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken } = require('./auth');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Validation pour la création/modification de cours
const validateCours = [
  body('code').notEmpty().withMessage('Le code du cours est requis'),
  body('nom').notEmpty().withMessage('Le nom du cours est requis'),
  body('credits').isInt({ min: 1 }).withMessage('Le nombre de crédits doit être positif'),
  body('heures_cours').isInt({ min: 0 }).withMessage('Le nombre d\'heures de cours doit être positif'),
  body('heures_tp').isInt({ min: 0 }).withMessage('Le nombre d\'heures de TP doit être positif'),
  body('departement_id').isInt().withMessage('ID du département invalide'),
  body('semestre').notEmpty().withMessage('Le semestre est requis'),
  body('annee_academique').notEmpty().withMessage('L\'année académique est requise')
];

// GET - Récupérer tous les cours
router.get('/', authenticateToken, (req, res) => {
  const { search, departement_id, professeur_id, semestre, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT c.*, d.nom as departement_nom, p.nom as professeur_nom, p.prenom as professeur_prenom
    FROM cours c 
    LEFT JOIN departements d ON c.departement_id = d.id 
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE 1=1
  `;
  let params = [];

  if (search) {
    query += ` AND (c.nom LIKE ? OR c.code LIKE ? OR c.description LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (departement_id) {
    query += ` AND c.departement_id = ?`;
    params.push(departement_id);
  }

  if (professeur_id) {
    query += ` AND c.professeur_id = ?`;
    params.push(professeur_id);
  }

  if (semestre) {
    query += ` AND c.semestre = ?`;
    params.push(semestre);
  }

  query += ` ORDER BY c.nom LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, cours) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des cours' });
    }

    // Compter le total pour la pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM cours c 
      WHERE 1=1
    `;
    let countParams = [];

    if (search) {
      countQuery += ` AND (c.nom LIKE ? OR c.code LIKE ? OR c.description LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm);
    }

    if (departement_id) {
      countQuery += ` AND c.departement_id = ?`;
      countParams.push(departement_id);
    }

    if (professeur_id) {
      countQuery += ` AND c.professeur_id = ?`;
      countParams.push(professeur_id);
    }

    if (semestre) {
      countQuery += ` AND c.semestre = ?`;
      countParams.push(semestre);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        cours,
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

// GET - Récupérer un cours par ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT c.*, d.nom as departement_nom, p.nom as professeur_nom, p.prenom as professeur_prenom
    FROM cours c 
    LEFT JOIN departements d ON c.departement_id = d.id 
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE c.id = ?
  `, [id], (err, cours) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération du cours' });
    }

    if (!cours) {
      return res.status(404).json({ error: 'Cours non trouvé' });
    }

    res.json({ cours });
  });
});

// POST - Créer un nouveau cours
router.post('/', authenticateToken, validateCours, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    code,
    nom,
    description,
    credits,
    heures_cours,
    heures_tp,
    departement_id,
    professeur_id,
    semestre,
    annee_academique
  } = req.body;

  // Vérifier si le code existe déjà
  db.get('SELECT id FROM cours WHERE code = ?', [code], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (existing) {
      return res.status(400).json({ error: 'Ce code de cours existe déjà' });
    }

    // Créer le cours
    db.run(`
      INSERT INTO cours (
        code, nom, description, credits, heures_cours, heures_tp, 
        departement_id, professeur_id, semestre, annee_academique
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [code, nom, description, credits, heures_cours, heures_tp, departement_id, professeur_id, semestre, annee_academique], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la création du cours' });
      }

      // Récupérer le cours créé
      db.get(`
        SELECT c.*, d.nom as departement_nom, p.nom as professeur_nom, p.prenom as professeur_prenom
        FROM cours c 
        LEFT JOIN departements d ON c.departement_id = d.id 
        LEFT JOIN professeurs p ON c.professeur_id = p.id
        WHERE c.id = ?
      `, [this.lastID], (err, cours) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la récupération du cours' });
        }

        res.status(201).json({
          message: 'Cours créé avec succès',
          cours
        });
      });
    });
  });
});

// PUT - Modifier un cours
router.put('/:id', authenticateToken, validateCours, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const {
    code,
    nom,
    description,
    credits,
    heures_cours,
    heures_tp,
    departement_id,
    professeur_id,
    semestre,
    annee_academique
  } = req.body;

  // Vérifier si le cours existe
  db.get('SELECT id FROM cours WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Cours non trouvé' });
    }

    // Vérifier si le code existe déjà (sauf pour ce cours)
    db.get('SELECT id FROM cours WHERE code = ? AND id != ?', [code, id], (err, existingCode) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (existingCode) {
        return res.status(400).json({ error: 'Ce code de cours existe déjà' });
      }

      // Mettre à jour le cours
      db.run(`
        UPDATE cours SET 
          code = ?, nom = ?, description = ?, credits = ?, heures_cours = ?, 
          heures_tp = ?, departement_id = ?, professeur_id = ?, semestre = ?, annee_academique = ?
        WHERE id = ?
      `, [code, nom, description, credits, heures_cours, heures_tp, departement_id, professeur_id, semestre, annee_academique, id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la mise à jour du cours' });
        }

        // Récupérer le cours mis à jour
        db.get(`
          SELECT c.*, d.nom as departement_nom, p.nom as professeur_nom, p.prenom as professeur_prenom
          FROM cours c 
          LEFT JOIN departements d ON c.departement_id = d.id 
          LEFT JOIN professeurs p ON c.professeur_id = p.id
          WHERE c.id = ?
        `, [id], (err, cours) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération du cours' });
          }

          res.json({
            message: 'Cours mis à jour avec succès',
            cours
          });
        });
      });
    });
  });
});

// DELETE - Supprimer un cours
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Vérifier si le cours existe
  db.get('SELECT id FROM cours WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Cours non trouvé' });
    }

    // Vérifier s'il y a des inscriptions
    db.get('SELECT id FROM inscriptions WHERE cours_id = ?', [id], (err, inscriptions) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (inscriptions) {
        return res.status(400).json({ error: 'Impossible de supprimer ce cours car il a des inscriptions' });
      }

      // Supprimer le cours
      db.run('DELETE FROM cours WHERE id = ?', [id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la suppression du cours' });
        }

        res.json({ message: 'Cours supprimé avec succès' });
      });
    });
  });
});

// POST - Inscrire un étudiant à un cours
router.post('/:id/inscriptions', authenticateToken, [
  body('etudiant_id').isInt().withMessage('ID de l\'étudiant invalide')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id: cours_id } = req.params;
  const { etudiant_id } = req.body;

  // Vérifier si le cours existe
  db.get('SELECT id FROM cours WHERE id = ?', [cours_id], (err, cours) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!cours) {
      return res.status(404).json({ error: 'Cours non trouvé' });
    }

    // Vérifier si l'étudiant existe
    db.get('SELECT id FROM etudiants WHERE id = ?', [etudiant_id], (err, etudiant) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (!etudiant) {
        return res.status(404).json({ error: 'Étudiant non trouvé' });
      }

      // Vérifier si l'inscription existe déjà
      db.get('SELECT id FROM inscriptions WHERE etudiant_id = ? AND cours_id = ?', [etudiant_id, cours_id], (err, inscription) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur de base de données' });
        }

        if (inscription) {
          return res.status(400).json({ error: 'Cet étudiant est déjà inscrit à ce cours' });
        }

        // Créer l'inscription
        db.run('INSERT INTO inscriptions (etudiant_id, cours_id) VALUES (?, ?)', [etudiant_id, cours_id], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de l\'inscription' });
          }

          res.status(201).json({ message: 'Étudiant inscrit avec succès' });
        });
      });
    });
  });
});

// DELETE - Désinscrire un étudiant d'un cours
router.delete('/:id/inscriptions/:etudiant_id', authenticateToken, (req, res) => {
  const { id: cours_id, etudiant_id } = req.params;

  db.run('DELETE FROM inscriptions WHERE etudiant_id = ? AND cours_id = ?', [etudiant_id, cours_id], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la désinscription' });
    }

    if (this.changes === 0) {
      return res.status(404).json({ error: 'Inscription non trouvée' });
    }

    res.json({ message: 'Étudiant désinscrit avec succès' });
  });
});

// GET - Récupérer les étudiants inscrits à un cours
router.get('/:id/etudiants', authenticateToken, (req, res) => {
  const { id: cours_id } = req.params;

  db.all(`
    SELECT e.*, i.date_inscription, i.statut
    FROM etudiants e
    INNER JOIN inscriptions i ON e.id = i.etudiant_id
    WHERE i.cours_id = ?
    ORDER BY e.nom, e.prenom
  `, [cours_id], (err, etudiants) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des étudiants' });
    }

    res.json({ etudiants });
  });
});

// GET - Statistiques des cours
router.get('/stats/overview', authenticateToken, (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM cours',
    parDepartement: `
      SELECT d.nom, COUNT(c.id) as count 
      FROM departements d 
      LEFT JOIN cours c ON d.id = c.departement_id 
      GROUP BY d.id, d.nom
    `,
    parSemestre: 'SELECT semestre, COUNT(*) as count FROM cours GROUP BY semestre',
    parAnnee: 'SELECT annee_academique, COUNT(*) as count FROM cours GROUP BY annee_academique'
  };

  const stats = {};

  // Exécuter toutes les requêtes
  db.get(queries.total, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    stats.total = result.count;

    db.all(queries.parDepartement, (err, result) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
      stats.parDepartement = result;

      db.all(queries.parSemestre, (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
        stats.parSemestre = result;

        db.all(queries.parAnnee, (err, result) => {
          if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
          stats.parAnnee = result;

          res.json({ stats });
        });
      });
    });
  });
});

module.exports = router; 