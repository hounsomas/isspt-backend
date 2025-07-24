const express = require('express');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken } = require('./auth');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Validation pour la création/modification d'étudiant
const validateEtudiant = [
  body('matricule').notEmpty().withMessage('Le matricule est requis'),
  body('nom').notEmpty().withMessage('Le nom est requis'),
  body('prenom').notEmpty().withMessage('Le prénom est requis'),
  body('email').isEmail().withMessage('Email invalide'),
  body('departement_id').isInt().withMessage('ID du département invalide'),
  body('niveau').notEmpty().withMessage('Le niveau est requis'),
  body('annee_etude').isInt({ min: 1, max: 5 }).withMessage('Année d\'étude invalide')
];

// GET - Récupérer tous les étudiants
router.get('/', authenticateToken, (req, res) => {
  const { search, departement_id, niveau, page = 1, limit = 10 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT e.*, d.nom as departement_nom 
    FROM etudiants e 
    LEFT JOIN departements d ON e.departement_id = d.id 
    WHERE 1=1
  `;
  let params = [];

  if (search) {
    query += ` AND (e.nom LIKE ? OR e.prenom LIKE ? OR e.matricule LIKE ? OR e.email LIKE ?)`;
    const searchTerm = `%${search}%`;
    params.push(searchTerm, searchTerm, searchTerm, searchTerm);
  }

  if (departement_id) {
    query += ` AND e.departement_id = ?`;
    params.push(departement_id);
  }

  if (niveau) {
    query += ` AND e.niveau = ?`;
    params.push(niveau);
  }

  query += ` ORDER BY e.nom, e.prenom LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, etudiants) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des étudiants' });
    }

    // Compter le total pour la pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM etudiants e 
      WHERE 1=1
    `;
    let countParams = [];

    if (search) {
      countQuery += ` AND (e.nom LIKE ? OR e.prenom LIKE ? OR e.matricule LIKE ? OR e.email LIKE ?)`;
      const searchTerm = `%${search}%`;
      countParams.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (departement_id) {
      countQuery += ` AND e.departement_id = ?`;
      countParams.push(departement_id);
    }

    if (niveau) {
      countQuery += ` AND e.niveau = ?`;
      countParams.push(niveau);
    }

    db.get(countQuery, countParams, (err, result) => {
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

// GET - Récupérer un étudiant par ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT e.*, d.nom as departement_nom 
    FROM etudiants e 
    LEFT JOIN departements d ON e.departement_id = d.id 
    WHERE e.id = ?
  `, [id], (err, etudiant) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération de l\'étudiant' });
    }

    if (!etudiant) {
      return res.status(404).json({ error: 'Étudiant non trouvé' });
    }

    res.json({ etudiant });
  });
});

// POST - Créer un nouvel étudiant
router.post('/', authenticateToken, validateEtudiant, (req, res) => {
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
    date_naissance,
    adresse,
    departement_id,
    niveau,
    annee_etude
  } = req.body;

  // Vérifier si le matricule existe déjà
  db.get('SELECT id FROM etudiants WHERE matricule = ?', [matricule], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (existing) {
      return res.status(400).json({ error: 'Ce matricule existe déjà' });
    }

    // Vérifier si l'email existe déjà
    db.get('SELECT id FROM etudiants WHERE email = ?', [email], (err, existingEmail) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (existingEmail) {
        return res.status(400).json({ error: 'Cet email est déjà utilisé' });
      }

      // Créer l'étudiant
      db.run(`
        INSERT INTO etudiants (
          matricule, nom, prenom, email, telephone, date_naissance, 
          adresse, departement_id, niveau, annee_etude
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [matricule, nom, prenom, email, telephone, date_naissance, adresse, departement_id, niveau, annee_etude], function(err) {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la création de l\'étudiant' });
        }

        // Récupérer l'étudiant créé
        db.get(`
          SELECT e.*, d.nom as departement_nom 
          FROM etudiants e 
          LEFT JOIN departements d ON e.departement_id = d.id 
          WHERE e.id = ?
        `, [this.lastID], (err, etudiant) => {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la récupération de l\'étudiant' });
          }

          res.status(201).json({
            message: 'Étudiant créé avec succès',
            etudiant
          });
        });
      });
    });
  });
});

// PUT - Modifier un étudiant
router.put('/:id', authenticateToken, validateEtudiant, (req, res) => {
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
    date_naissance,
    adresse,
    departement_id,
    niveau,
    annee_etude
  } = req.body;

  // Vérifier si l'étudiant existe
  db.get('SELECT id FROM etudiants WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Étudiant non trouvé' });
    }

    // Vérifier si le matricule existe déjà (sauf pour cet étudiant)
    db.get('SELECT id FROM etudiants WHERE matricule = ? AND id != ?', [matricule, id], (err, existingMatricule) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur de base de données' });
      }

      if (existingMatricule) {
        return res.status(400).json({ error: 'Ce matricule existe déjà' });
      }

      // Vérifier si l'email existe déjà (sauf pour cet étudiant)
      db.get('SELECT id FROM etudiants WHERE email = ? AND id != ?', [email, id], (err, existingEmail) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur de base de données' });
        }

        if (existingEmail) {
          return res.status(400).json({ error: 'Cet email est déjà utilisé' });
        }

        // Mettre à jour l'étudiant
        db.run(`
          UPDATE etudiants SET 
            matricule = ?, nom = ?, prenom = ?, email = ?, telephone = ?, 
            date_naissance = ?, adresse = ?, departement_id = ?, niveau = ?, annee_etude = ?
          WHERE id = ?
        `, [matricule, nom, prenom, email, telephone, date_naissance, adresse, departement_id, niveau, annee_etude, id], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'étudiant' });
          }

          // Récupérer l'étudiant mis à jour
          db.get(`
            SELECT e.*, d.nom as departement_nom 
            FROM etudiants e 
            LEFT JOIN departements d ON e.departement_id = d.id 
            WHERE e.id = ?
          `, [id], (err, etudiant) => {
            if (err) {
              return res.status(500).json({ error: 'Erreur lors de la récupération de l\'étudiant' });
            }

            res.json({
              message: 'Étudiant mis à jour avec succès',
              etudiant
            });
          });
        });
      });
    });
  });
});

// DELETE - Supprimer un étudiant
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Vérifier si l'étudiant existe
  db.get('SELECT id FROM etudiants WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Étudiant non trouvé' });
    }

    // Supprimer l'étudiant
    db.run('DELETE FROM etudiants WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la suppression de l\'étudiant' });
      }

      res.json({ message: 'Étudiant supprimé avec succès' });
    });
  });
});

// GET - Récupérer les cours d'un étudiant
router.get('/:id/cours', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT c.*, p.nom as professeur_nom, p.prenom as professeur_prenom,
           i.date_inscription, i.statut
    FROM cours c
    INNER JOIN inscriptions i ON c.id = i.cours_id
    LEFT JOIN professeurs p ON c.professeur_id = p.id
    WHERE i.etudiant_id = ?
    ORDER BY c.nom
  `, [id], (err, cours) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des cours' });
    }

    res.json({ cours });
  });
});

// GET - Récupérer les notes d'un étudiant
router.get('/:id/notes', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.all(`
    SELECT n.*, c.nom as cours_nom, c.code as cours_code
    FROM notes n
    INNER JOIN cours c ON n.cours_id = c.id
    WHERE n.etudiant_id = ?
    ORDER BY n.date_evaluation DESC
  `, [id], (err, notes) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des notes' });
    }

    res.json({ notes });
  });
});

// GET - Statistiques des étudiants
router.get('/stats/overview', authenticateToken, (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM etudiants',
    parDepartement: `
      SELECT d.nom, COUNT(e.id) as count 
      FROM departements d 
      LEFT JOIN etudiants e ON d.id = e.departement_id 
      GROUP BY d.id, d.nom
    `,
    parNiveau: 'SELECT niveau, COUNT(*) as count FROM etudiants GROUP BY niveau',
    parAnnee: 'SELECT annee_etude, COUNT(*) as count FROM etudiants GROUP BY annee_etude'
  };

  const stats = {};

  // Exécuter toutes les requêtes
  db.get(queries.total, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    stats.total = result.count;

    db.all(queries.parDepartement, (err, result) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
      stats.parDepartement = result;

      db.all(queries.parNiveau, (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
        stats.parNiveau = result;

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