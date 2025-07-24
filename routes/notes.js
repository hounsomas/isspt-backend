const express = require('express');
const { body, validationResult } = require('express-validator');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { authenticateToken } = require('./auth');

const router = express.Router();
const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));

// Validation pour la création/modification de note
const validateNote = [
  body('etudiant_id').isInt().withMessage('ID de l\'étudiant invalide'),
  body('cours_id').isInt().withMessage('ID du cours invalide'),
  body('type_evaluation').notEmpty().withMessage('Le type d\'évaluation est requis'),
  body('note').isFloat({ min: 0, max: 20 }).withMessage('La note doit être entre 0 et 20'),
  body('coefficient').isFloat({ min: 0.1 }).withMessage('Le coefficient doit être positif'),
  body('date_evaluation').isDate().withMessage('Date d\'évaluation invalide')
];

// GET - Récupérer toutes les notes
router.get('/', authenticateToken, (req, res) => {
  const { etudiant_id, cours_id, type_evaluation, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let query = `
    SELECT n.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
           c.nom as cours_nom, c.code as cours_code
    FROM notes n
    INNER JOIN etudiants e ON n.etudiant_id = e.id
    INNER JOIN cours c ON n.cours_id = c.id
    WHERE 1=1
  `;
  let params = [];

  if (etudiant_id) {
    query += ` AND n.etudiant_id = ?`;
    params.push(etudiant_id);
  }

  if (cours_id) {
    query += ` AND n.cours_id = ?`;
    params.push(cours_id);
  }

  if (type_evaluation) {
    query += ` AND n.type_evaluation = ?`;
    params.push(type_evaluation);
  }

  query += ` ORDER BY n.date_evaluation DESC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  db.all(query, params, (err, notes) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération des notes' });
    }

    // Compter le total pour la pagination
    let countQuery = `
      SELECT COUNT(*) as total 
      FROM notes n
      WHERE 1=1
    `;
    let countParams = [];

    if (etudiant_id) {
      countQuery += ` AND n.etudiant_id = ?`;
      countParams.push(etudiant_id);
    }

    if (cours_id) {
      countQuery += ` AND n.cours_id = ?`;
      countParams.push(cours_id);
    }

    if (type_evaluation) {
      countQuery += ` AND n.type_evaluation = ?`;
      countParams.push(type_evaluation);
    }

    db.get(countQuery, countParams, (err, result) => {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors du comptage' });
      }

      res.json({
        notes,
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

// GET - Récupérer une note par ID
router.get('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.get(`
    SELECT n.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
           c.nom as cours_nom, c.code as cours_code
    FROM notes n
    INNER JOIN etudiants e ON n.etudiant_id = e.id
    INNER JOIN cours c ON n.cours_id = c.id
    WHERE n.id = ?
  `, [id], (err, note) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors de la récupération de la note' });
    }

    if (!note) {
      return res.status(404).json({ error: 'Note non trouvée' });
    }

    res.json({ note });
  });
});

// POST - Créer une nouvelle note
router.post('/', authenticateToken, validateNote, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    etudiant_id,
    cours_id,
    type_evaluation,
    note,
    coefficient,
    date_evaluation,
    commentaire
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

        // Créer la note
        db.run(`
          INSERT INTO notes (
            etudiant_id, cours_id, type_evaluation, note, coefficient, date_evaluation, commentaire
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [etudiant_id, cours_id, type_evaluation, note, coefficient, date_evaluation, commentaire], function(err) {
          if (err) {
            return res.status(500).json({ error: 'Erreur lors de la création de la note' });
          }

          // Récupérer la note créée
          db.get(`
            SELECT n.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
                   c.nom as cours_nom, c.code as cours_code
            FROM notes n
            INNER JOIN etudiants e ON n.etudiant_id = e.id
            INNER JOIN cours c ON n.cours_id = c.id
            WHERE n.id = ?
          `, [this.lastID], (err, note) => {
            if (err) {
              return res.status(500).json({ error: 'Erreur lors de la récupération de la note' });
            }

            res.status(201).json({
              message: 'Note créée avec succès',
              note
            });
          });
        });
      });
    });
  });
});

// PUT - Modifier une note
router.put('/:id', authenticateToken, validateNote, (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const {
    etudiant_id,
    cours_id,
    type_evaluation,
    note,
    coefficient,
    date_evaluation,
    commentaire
  } = req.body;

  // Vérifier si la note existe
  db.get('SELECT id FROM notes WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Note non trouvée' });
    }

    // Mettre à jour la note
    db.run(`
      UPDATE notes SET 
        etudiant_id = ?, cours_id = ?, type_evaluation = ?, note = ?, 
        coefficient = ?, date_evaluation = ?, commentaire = ?
      WHERE id = ?
    `, [etudiant_id, cours_id, type_evaluation, note, coefficient, date_evaluation, commentaire, id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la mise à jour de la note' });
      }

      // Récupérer la note mise à jour
      db.get(`
        SELECT n.*, e.nom as etudiant_nom, e.prenom as etudiant_prenom, e.matricule as etudiant_matricule,
               c.nom as cours_nom, c.code as cours_code
        FROM notes n
        INNER JOIN etudiants e ON n.etudiant_id = e.id
        INNER JOIN cours c ON n.cours_id = c.id
        WHERE n.id = ?
      `, [id], (err, note) => {
        if (err) {
          return res.status(500).json({ error: 'Erreur lors de la récupération de la note' });
        }

        res.json({
          message: 'Note mise à jour avec succès',
          note
        });
      });
    });
  });
});

// DELETE - Supprimer une note
router.delete('/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  // Vérifier si la note existe
  db.get('SELECT id FROM notes WHERE id = ?', [id], (err, existing) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur de base de données' });
    }

    if (!existing) {
      return res.status(404).json({ error: 'Note non trouvée' });
    }

    // Supprimer la note
    db.run('DELETE FROM notes WHERE id = ?', [id], function(err) {
      if (err) {
        return res.status(500).json({ error: 'Erreur lors de la suppression de la note' });
      }

      res.json({ message: 'Note supprimée avec succès' });
    });
  });
});

// GET - Calculer la moyenne d'un étudiant pour un cours
router.get('/moyenne/:etudiant_id/:cours_id', authenticateToken, (req, res) => {
  const { etudiant_id, cours_id } = req.params;

  db.all(`
    SELECT note, coefficient, type_evaluation
    FROM notes
    WHERE etudiant_id = ? AND cours_id = ?
    ORDER BY date_evaluation DESC
  `, [etudiant_id, cours_id], (err, notes) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors du calcul de la moyenne' });
    }

    if (notes.length === 0) {
      return res.json({ 
        moyenne: null, 
        notes: [],
        message: 'Aucune note trouvée pour cet étudiant dans ce cours' 
      });
    }

    // Calculer la moyenne pondérée
    let totalPondere = 0;
    let totalCoefficients = 0;

    notes.forEach(note => {
      totalPondere += note.note * note.coefficient;
      totalCoefficients += note.coefficient;
    });

    const moyenne = totalCoefficients > 0 ? totalPondere / totalCoefficients : 0;

    res.json({
      moyenne: Math.round(moyenne * 100) / 100,
      notes,
      totalCoefficients
    });
  });
});

// GET - Calculer la moyenne générale d'un étudiant
router.get('/moyenne-generale/:etudiant_id', authenticateToken, (req, res) => {
  const { etudiant_id } = req.params;

  db.all(`
    SELECT c.nom as cours_nom, c.code as cours_code, c.credits,
           AVG(n.note * n.coefficient) / AVG(n.coefficient) as moyenne_cours
    FROM notes n
    INNER JOIN cours c ON n.cours_id = c.id
    WHERE n.etudiant_id = ?
    GROUP BY c.id, c.nom, c.code, c.credits
    HAVING COUNT(n.id) > 0
  `, [etudiant_id], (err, moyennes) => {
    if (err) {
      return res.status(500).json({ error: 'Erreur lors du calcul de la moyenne générale' });
    }

    if (moyennes.length === 0) {
      return res.json({ 
        moyenneGenerale: null, 
        moyennes: [],
        message: 'Aucune note trouvée pour cet étudiant' 
      });
    }

    // Calculer la moyenne générale pondérée par les crédits
    let totalPondere = 0;
    let totalCredits = 0;

    moyennes.forEach(moyenne => {
      const moyenneCours = Math.round(moyenne.moyenne_cours * 100) / 100;
      totalPondere += moyenneCours * moyenne.credits;
      totalCredits += moyenne.credits;
    });

    const moyenneGenerale = totalCredits > 0 ? totalPondere / totalCredits : 0;

    res.json({
      moyenneGenerale: Math.round(moyenneGenerale * 100) / 100,
      moyennes: moyennes.map(m => ({
        ...m,
        moyenne_cours: Math.round(m.moyenne_cours * 100) / 100
      })),
      totalCredits
    });
  });
});

// GET - Statistiques des notes
router.get('/stats/overview', authenticateToken, (req, res) => {
  const queries = {
    total: 'SELECT COUNT(*) as count FROM notes',
    moyenneGenerale: 'SELECT AVG(note) as moyenne FROM notes',
    parType: 'SELECT type_evaluation, COUNT(*) as count, AVG(note) as moyenne FROM notes GROUP BY type_evaluation',
    repartition: `
      SELECT 
        CASE 
          WHEN note >= 16 THEN 'Très bien'
          WHEN note >= 14 THEN 'Bien'
          WHEN note >= 12 THEN 'Assez bien'
          WHEN note >= 10 THEN 'Passable'
          ELSE 'Insuffisant'
        END as niveau,
        COUNT(*) as count
      FROM notes 
      GROUP BY niveau
    `
  };

  const stats = {};

  // Exécuter toutes les requêtes
  db.get(queries.total, (err, result) => {
    if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
    stats.total = result.count;

    db.get(queries.moyenneGenerale, (err, result) => {
      if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
      stats.moyenneGenerale = Math.round(result.moyenne * 100) / 100;

      db.all(queries.parType, (err, result) => {
        if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
        stats.parType = result.map(r => ({
          ...r,
          moyenne: Math.round(r.moyenne * 100) / 100
        }));

        db.all(queries.repartition, (err, result) => {
          if (err) return res.status(500).json({ error: 'Erreur lors du calcul des statistiques' });
          stats.repartition = result;

          res.json({ stats });
        });
      });
    });
  });
});

module.exports = router; 