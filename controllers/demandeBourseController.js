const db = require('../models/DemandeBourse');

// Récupérer toutes les demandes
exports.getAllDemandes = (req, res) => {
  db.all('SELECT * FROM demandes_bourse ORDER BY dateSoumission DESC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
};

// Récupérer une demande par ID
exports.getDemandeById = (req, res) => {
  db.get('SELECT * FROM demandes_bourse WHERE id = ?', [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Demande non trouvée' });
    res.json(row);
  });
};

// Créer une nouvelle demande
exports.createDemande = (req, res) => {
  const { nom, prenoms, telephone, email, serieBac, moyenneBac } = req.body;
  if (!nom || !prenoms || !telephone || !email || !serieBac || moyenneBac === undefined) {
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  }
  db.run(
    `INSERT INTO demandes_bourse (nom, prenoms, telephone, email, serieBac, moyenneBac) VALUES (?, ?, ?, ?, ?, ?)`,
    [nom, prenoms, telephone, email, serieBac, moyenneBac],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM demandes_bourse WHERE id = ?', [this.lastID], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.status(201).json(row);
      });
    }
  );
};

// Mettre à jour le statut d'une demande
exports.updateStatutDemande = (req, res) => {
  const { statut } = req.body;
  if (!statut) return res.status(400).json({ error: 'Statut requis' });
  db.run(
    'UPDATE demandes_bourse SET statut = ? WHERE id = ?',
    [statut, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Demande non trouvée' });
      db.get('SELECT * FROM demandes_bourse WHERE id = ?', [req.params.id], (err2, row) => {
        if (err2) return res.status(500).json({ error: err2.message });
        res.json(row);
      });
    }
  );
};

// Supprimer une demande
exports.deleteDemande = (req, res) => {
  db.run('DELETE FROM demandes_bourse WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Demande non trouvée' });
    res.json({ success: true });
  });
}; 