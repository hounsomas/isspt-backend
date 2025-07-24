const express = require('express');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken } = require('./auth');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Validation pour la création/modification de professeur
const validateProfesseur = [
  body('matricule').notEmpty().withMessage('Le matricule est requis'),
  body('nom').notEmpty().withMessage('Le nom est requis'),
  body('prenom').notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('departement_id').isInt().withMessage('ID du département invalide'),
  body('specialite').notEmpty().withMessage('La spécialité est requise'),
  body('grade').notEmpty().withMessage('Le grade est requis')
];

// GET - Récupérer tous les professeurs
router.get('/', authenticateToken, (req, res) => {
  const { search, departement_id, grade, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT p.*, d.nom as departement_nom 
    FROM professeurs p 
    LEFT JOIN departements d ON p.departement_id = d.id 
    WHERE 1=1
  `;
  let params = [];

  if (search) {
    query += ` AND (p.nom LIKE ? OR p.prenom LIKE ? OR p.matricule LIKE ? OR p.email LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (departement_id) {
    query += ` AND p.departement_id = ?`;
    params.push(departement_id);
  }

  if (grade) {
    query += ` AND p.grade = ?`;
    params.push(grade);
  }

  query += ` ORDER BY p.nom, p.prenom LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, professeurs) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des professeurs' });
    }

    // Compter le total pour la pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM professeurs p 
      WHERE 1=1
    `;
    let countParams = [];

    if (search) {
      countQuery += ` AND (p.nom LIKE ? OR p.prenom LIKE ? OR p.matricule LIKE ? OR p.email LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (departement_id) {
      countQuery += ` AND p.departement_id = ?`;
      countParams.push(departement_id);
    }

    if (grade) {
      countQuery += ` AND p.grade = ?`;
      countParams.push(grade);
    }

    db.get(countQuery, countParams, (err, result) => {
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

// GET - Récupérer un professeur par ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT p.*, d.nom as departement_nom 
    FROM professeurs p 
    LEFT JOIN departements d ON p.departement_id = d.id 
    WHERE p.id = ?
  `, [id], (err, professeur) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération du professeur' });
    }

    if (!professeur) {
      return res.status(404).json({ error: 'Professeur non trouvé' });
    }

    res.json({ professeur });
  });
});

// POST - Créer un nouveau professeur
router.post('/', authenticateToken, validateProfesseur, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    matricule,
    nom,
    prenom,
    email,
    telephone,
    specialite,
    grade,
    departement_id
  } = req.body;

  // Vérifier si le matricule existe déjà
  db.get('SELECT id FROM professeurs WHERE matricule = ?', [matricule], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (existing) {
      return res.status(400).json({ error: 'Ce matricule existe déjà' });
    }

    // Vérifier si l'email existe déjà
    db.get('SELECT id FROM professeurs WHERE email = ?', [email], (err, existingEmail) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (existingEmail) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }

      // Créer le professeur
      db.run(`
        INSERT INTO professeurs (
          matricule, nom, prenom, email, telephone, specialite, grade, departement_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [matricule, nom, prenom, email, telephone, specialite, grade, departement_id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la création du professeur' });
        }

        // Récupérer le professeur créé
        db.get(`
          SELECT p.*, d.nom as departement_nom 
          FROM professeurs p 
          LEFT JOIN departements d ON p.departement_id = d.id 
          WHERE p.id = ?
        `, [this.lastID], (err, professeur) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération du professeur' });
          }

          res.status(201).json({
            message: 'Professeur créé avec succès',
            professeur
          });
        });
      });
    });
  });
});

// PUT - Modifier un professeur
router.put('/:id', authenticateToken, validateProfesseur, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const {
    matricule,
    nom,
    prenom,
    email,
    telephone,
    specialite,
    grade,
    departement_id
  } = req.body;

  // Vérifier si le professeur existe
  db.get('SELECT id FROM professeurs WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Professeur non trouvé' });
    }

    // Vérifier si le matricule existe déjà (sauf pour ce professeur)
    db.get('SELECT id FROM professeurs WHERE matricule = ? AND id != ?', [matricule, id], (err, existingMatricule) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (existingMatricule) {
        return res.status(400).json({ error: 'Ce matricule existe déjà' });
      }

      // Vérifier si l'email existe déjà (sauf pour ce professeur)
      db.get('SELECT id FROM professeurs WHERE email = ? AND id != ?', [email, id], (err, existingEmail) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur de base de données' });
        }

        if (existingEmail) {
          return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        }

        // Mettre à jour le professeur
        db.run(`
          UPDATE professeurs SET 
            matricule = ?, nom = ?, prenom = ?, email = ?, telephone = ?, 
            specialite = ?, grade = ?, departement_id = ?
          WHERE id = ?
        `, [matricule, nom, prenom, email, telephone, specialite, grade, departement_id, id], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la mise à jour du professeur' });
          }

          // Récupérer le professeur mis à jour
          db.get(`
            SELECT p.*, d.nom as departement_nom 
            FROM professeurs p 
            LEFT JOIN departements d ON p.departement_id = d.id 
            WHERE p.id = ?
          `, [id], (err, professeur) => {
            if (err) {
              return res.status(500).json({ error: 'Erreur lors de la récupération du professeur' });
            }

            res.json({
              message: 'Professeur mis à jour avec succès',
              professeur
            });
          });
        });
      });
    });
  });
});

// DELETE - Supprimer un professeur
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Vérifier si le professeur existe
  db.get('SELECT id FROM professeurs WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Professeur non trouvé' });
    }

    // Vérifier s'il a des cours assignés
    db.get('SELECT id FROM cours WHERE professeur_id = ?', [id], (err, cours) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (cours) {
        return res.status(400).json({ error: 'Impossible de supprimer ce professeur car il a des cours assignés' });
      }

      // Supprimer le professeur
      db.run('DELETE FROM professeurs WHERE id = ?', [id], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la suppression du professeur' });
        }

        res.json({ message: 'Professeur supprimé avec succès' });
      });
    });
  });
});

// GET - Récupérer les cours d'un professeur
router.get('/:id/cours', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT c.*, d.nom as departement_nom
    FROM cours c
    LEFT JOIN departements d ON c.departement_id = d.id
    WHERE c.professeur_id = ?
    ORDER BY c.nom
  `, [id], (err, cours) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des cours' });
    }

    res.json({ cours });
  });
});

// GET - Statistiques des professeurs
router.get('/stats/overview', authenticateToken, (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM professeurs',
    parDepartement: `
      SELECT d.nom, COUNT(p.id) as count 
      FROM departements d 
      LEFT JOIN professeurs p ON d.id = p.departement_id 
      GROUP BY d.id, d.nom
    `,
    parGrade: 'SELECT grade, COUNT(*) as count FROM professeurs GROUP BY grade',
    parSpecialite: 'SELECT specialite, COUNT(*) as count FROM professeurs GROUP BY specialite'
  };

  const stats = {};

  // Exécuter toutes les requêtes
  db.get(queries.total, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    stats.total = result.count;

    db.all(queries.parDepartement, (err, result) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
      stats.parDepartement = result;

      db.all(queries.parGrade, (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
        stats.parGrade = result;

        db.all(queries.parSpecialite, (err, result) => {
          if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
          stats.parSpecialite = result;

          res.json({ stats });
        });
      });
    });
  });
});

module.exports = router; 