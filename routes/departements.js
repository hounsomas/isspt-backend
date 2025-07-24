const express = require('express');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken } = require('./auth');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Validation pour la création/modification de département
const validateDepartement = [
  body('nom').notEmpty().withMessage('Le nom du département est requis'),
  body('description').optional().isString().withMessage('La description doit être une chaîne de caractères')
];

// GET - Récupérer tous les départements
router.get('/', authenticateToken, (req, res) => {
  const { search, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT d.*, 
           COUNT(DISTINCT e.id) as nb_etudiants,
           COUNT(DISTINCT p.id) as nb_professeurs,
           COUNT(DISTINCT c.id) as nb_cours
    FROM departements d
    LEFT JOIN etudiants e ON d.id = e.departement_id
    LEFT JOIN professeurs p ON d.id = p.departement_id
    LEFT JOIN cours c ON d.id = c.departement_id
    WHERE 1=1
  `;
  let params = [];

  if (search) {
    query += ` AND (d.nom LIKE ? OR d.description LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm);
  }

  query += ` GROUP BY d.id ORDER BY d.nom LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, departements) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des départements' });
    }

    // Compter le total pour la pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM departements d
      WHERE 1=1
    `;
    let countParams = [];

    if (search) {
      countQuery += ` AND (d.nom LIKE ? OR d.description LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        departements,
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

// GET - Récupérer un département par ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT d.*, 
           COUNT(DISTINCT e.id) as nb_etudiants,
           COUNT(DISTINCT p.id) as nb_professeurs,
           COUNT(DISTINCT c.id) as nb_cours
    FROM departements d
    LEFT JOIN etudiants e ON d.id = e.departement_id
    LEFT JOIN professeurs p ON d.id = p.departement_id
    LEFT JOIN cours c ON d.id = c.departement_id
    WHERE d.id = ?
    GROUP BY d.id
  `, [id], (err, departement) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération du département' });
    }

    if (!departement) {
      return res.status(404).json({ error: 'Département non trouvé' });
    }

    res.json({ departement });
  });
});

// POST - Créer un nouveau département
router.post('/', authenticateToken, validateDepartement, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { nom, description, directeur_id } = req.body;

  // Vérifier si le nom existe déjà
  db.get('SELECT id FROM departements WHERE nom = ?', [nom], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (existing) {
      return res.status(400).json({ error: 'Ce nom de département existe déjà' });
    }

    // Créer le département
    db.run(`
      INSERT INTO departements (nom, description, directeur_id) 
      VALUES (?, ?, ?)
    `, [nom, description, directeur_id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la création du département' });
      }

      // Récupérer le département créé
      db.get(`
        SELECT d.*, 
               COUNT(DISTINCT e.id) as nb_etudiants,
               COUNT(DISTINCT p.id) as nb_professeurs,
               COUNT(DISTINCT c.id) as nb_cours
        FROM departements d
        LEFT JOIN etudiants e ON d.id = e.departement_id
        LEFT JOIN professeurs p ON d.id = p.departement_id
        LEFT JOIN cours c ON d.id = c.departement_id
        WHERE d.id = ?
        GROUP BY d.id
      `, [this.lastID], (err, departement) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la récupération du département' });
        }

        res.status(201).json({
          message: 'Département créé avec succès',
          departement
        });
      });
    });
  });
});

// PUT - Modifier un département
router.put('/:id', authenticateToken, validateDepartement, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { nom, description, directeur_id } = req.body;

  // Vérifier si le département existe
  db.get('SELECT id FROM departements WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Département non trouvé' });
    }

    // Vérifier si le nom existe déjà (sauf pour ce département)
    db.get('SELECT id FROM departements WHERE nom = ? AND id != ?', [nom, id], (err, existingNom) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (existingNom) {
        return res.status(400).json({ error: 'Ce nom de département existe déjà' });
      }

      // Mettre à jour le département
      db.run(`
        UPDATE departements SET 
          nom = ?, description = ?, directeur_id = ?
        WHERE id = ?
      `, [nom, description, directeur_id, id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la mise à jour du département' });
        }

        // Récupérer le département mis à jour
        db.get(`
          SELECT d.*, 
                 COUNT(DISTINCT e.id) as nb_etudiants,
                 COUNT(DISTINCT p.id) as nb_professeurs,
                 COUNT(DISTINCT c.id) as nb_cours
          FROM departements d
          LEFT JOIN etudiants e ON d.id = e.departement_id
          LEFT JOIN professeurs p ON d.id = p.departement_id
          LEFT JOIN cours c ON d.id = c.departement_id
          WHERE d.id = ?
          GROUP BY d.id
        `, [id], (err, departement) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération du département' });
          }

          res.json({
            message: 'Département mis à jour avec succès',
            departement
          });
        });
      });
    });
  });
});

// DELETE - Supprimer un département
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Vérifier si le département existe
  db.get('SELECT id FROM departements WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Département non trouvé' });
    }

    // Vérifier s'il y a des étudiants, professeurs ou cours associés
    db.get(`
      SELECT 
        (SELECT COUNT(*) FROM etudiants WHERE departement_id = ?) as nb_etudiants,
        (SELECT COUNT(*) FROM professeurs WHERE departement_id = ?) as nb_professeurs,
        (SELECT COUNT(*) FROM cours WHERE departement_id = ?) as nb_cours
    `, [id, id, id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (result.nb_etudiants > 0 || result.nb_professeurs > 0 || result.nb_cours > 0) {
        return res.status(400).json({ 
          error: 'Impossible de supprimer ce département car il contient des étudiants, professeurs ou cours',
          details: {
            etudiants: result.nb_etudiants,
            professeurs: result.nb_professeurs,
            cours: result.nb_cours
          }
        });
      }

      // Supprimer le département
      db.run('DELETE FROM departements WHERE id = ?', [id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la suppression du département' });
        }

        res.json({ message: 'Département supprimé avec succès' });
      });
    });
  });
});

// GET - Récupérer les étudiants d'un département
router.get('/:id/etudiants', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  db.all(`
    SELECT e.*, d.nom as departement_nom
    FROM etudiants e
    LEFT JOIN departements d ON e.departement_id = d.id
    WHERE e.departement_id = ?
    ORDER BY e.nom, e.prenom
    LIMIT ? OFFSET ?
  `, [id, parseInt(limit), offset], (err, etudiants) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des étudiants' });
    }

    // Compter le total
    db.get('SELECT COUNT(*) as total FROM etudiants WHERE departement_id = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        etudiants,
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

// GET - Récupérer les professeurs d'un département
router.get('/:id/professeurs', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  db.all(`
    SELECT p.*, d.nom as departement_nom
    FROM professeurs p
    LEFT JOIN departements d ON p.departement_id = d.id
    WHERE p.departement_id = ?
    ORDER BY p.nom, p.prenom
    LIMIT ? OFFSET ?
  `, [id, parseInt(limit), offset], (err, professeurs) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des professeurs' });
    }

    // Compter le total
    db.get('SELECT COUNT(*) as total FROM professeurs WHERE departement_id = ?', [id], (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        professeurs,
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

// GET - Récupérer les cours d'un département
router.get('/:id/cours', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  db.all(`
    SELECT c.*, d.nom as departement_nom, p.nom as professeur_nom, p.prenom as professeur_prenom
    FROM cours c
    LEFT JOIN departements d ON c.departement_id = d.id
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE c.departement_id = ?
    ORDER BY c.nom
    LIMIT ? OFFSET ?
  `, [id, parseInt(limit), offset], (err, cours) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des cours' });
    }

    // Compter le total
    db.get('SELECT COUNT(*) as total FROM cours WHERE departement_id = ?', [id], (err, result) => {
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

// GET - Statistiques des départements
router.get('/stats/overview', authenticateToken, (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM departements',
    repartition: `
      SELECT d.nom,
             COUNT(DISTINCT e.id) as nb_etudiants,
             COUNT(DISTINCT p.id) as nb_professeurs,
             COUNT(DISTINCT c.id) as nb_cours
      FROM departements d
      LEFT JOIN etudiants e ON d.id = e.departement_id
      LEFT JOIN professeurs p ON d.id = p.departement_id
      LEFT JOIN cours c ON d.id = c.departement_id
      GROUP BY d.id, d.nom
      ORDER BY nb_etudiants DESC
    `
  };

  const stats = {};

  // Exécuter toutes les requêtes
  db.get(queries.total, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    stats.total = result.count;

    db.all(queries.repartition, (err, result) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
      stats.repartition = result;

      res.json({ stats });
    });
  });
});

module.exports = router; 