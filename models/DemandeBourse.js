const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '../database.sqlite');
const db = new sqlite3.Database(dbPath);

// Création de la table si elle n'existe pas
const createTable = () => {
  db.run(`CREATE TABLE IF NOT EXISTS demandes_bourse (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    prenoms TEXT NOT NULL,
    telephone TEXT NOT NULL,
    email TEXT NOT NULL,
    serieBac TEXT NOT NULL,
    moyenneBac REAL NOT NULL,
    statut TEXT DEFAULT 'En attente',
    dateSoumission TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
};

createTable();

module.exports = db; 