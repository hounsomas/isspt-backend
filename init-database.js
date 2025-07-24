const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

// Créer la base de données
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath);

console.log('🗄️  Initialisation de la base de données...');

// Créer les tables
db.serialize(() => {
  // Table des utilisateurs (pour l'authentification)
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'professeur', 'etudiant')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Table des départements
  db.run(`CREATE TABLE IF NOT EXISTS departements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nom TEXT NOT NULL,
    description TEXT,
    directeur_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Table des étudiants
  db.run(`CREATE TABLE IF NOT EXISTS etudiants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telephone TEXT,
    date_naissance DATE,
    adresse TEXT,
    departement_id INTEGER,
    niveau TEXT,
    annee_etude INTEGER,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departement_id) REFERENCES departements (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Table des professeurs
  db.run(`CREATE TABLE IF NOT EXISTS professeurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    telephone TEXT,
    specialite TEXT,
    grade TEXT,
    departement_id INTEGER,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departement_id) REFERENCES departements (id),
    FOREIGN KEY (user_id) REFERENCES users (id)
  )`);

  // Table des cours
  db.run(`CREATE TABLE IF NOT EXISTS cours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    description TEXT,
    credits INTEGER,
    heures_cours INTEGER,
    heures_tp INTEGER,
    departement_id INTEGER,
    professeur_id INTEGER,
    semestre TEXT,
    annee_academique TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departement_id) REFERENCES departements (id),
    FOREIGN KEY (professeur_id) REFERENCES professeurs (id)
  )`);

  // Table des inscriptions aux cours
  db.run(`CREATE TABLE IF NOT EXISTS inscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER,
    cours_id INTEGER,
    date_inscription DATETIME DEFAULT CURRENT_TIMESTAMP,
    statut TEXT DEFAULT 'active',
    FOREIGN KEY (etudiant_id) REFERENCES etudiants (id),
    FOREIGN KEY (cours_id) REFERENCES cours (id),
    UNIQUE(etudiant_id, cours_id)
  )`);

  // Table des notes
  db.run(`CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER,
    cours_id INTEGER,
    type_evaluation TEXT NOT NULL,
    note REAL NOT NULL CHECK(note >= 0 AND note <= 20),
    coefficient REAL DEFAULT 1.0,
    date_evaluation DATE,
    commentaire TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (etudiant_id) REFERENCES etudiants (id),
    FOREIGN KEY (cours_id) REFERENCES cours (id)
  )`);

  // Table des emplois du temps
  db.run(`CREATE TABLE IF NOT EXISTS emplois_temps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cours_id INTEGER,
    jour TEXT NOT NULL,
    heure_debut TIME NOT NULL,
    heure_fin TIME NOT NULL,
    salle TEXT,
    type_seance TEXT DEFAULT 'cours',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cours_id) REFERENCES cours (id)
  )`);

  // Table des absences
  db.run(`CREATE TABLE IF NOT EXISTS absences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    etudiant_id INTEGER,
    cours_id INTEGER,
    date_absence DATE NOT NULL,
    motif TEXT,
    justifiee BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (etudiant_id) REFERENCES etudiants (id),
    FOREIGN KEY (cours_id) REFERENCES cours (id)
  )`);

  // Tables pour la comptabilité
  db.run(`CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoiceNumber TEXT UNIQUE NOT NULL,
    studentId INTEGER,
    amount REAL NOT NULL,
    description TEXT,
    dueDate DATE,
    issueDate DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (studentId) REFERENCES etudiants (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paymentNumber TEXT UNIQUE NOT NULL,
    billId INTEGER,
    studentId INTEGER,
    amount REAL NOT NULL,
    method TEXT,
    reference TEXT,
    date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'completed',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (billId) REFERENCES bills (id),
    FOREIGN KEY (studentId) REFERENCES etudiants (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    expenseNumber TEXT UNIQUE NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category TEXT,
    departmentId INTEGER,
    supplier TEXT,
    date DATE DEFAULT CURRENT_DATE,
    status TEXT DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departmentId) REFERENCES departements (id)
  )`);

  // Tables pour le personnel
  db.run(`CREATE TABLE IF NOT EXISTS teaching_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId TEXT UNIQUE NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    departmentId INTEGER,
    position TEXT,
    specialization TEXT,
    hireDate DATE,
    education TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departmentId) REFERENCES departements (id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS admin_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId TEXT UNIQUE NOT NULL,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    departmentId INTEGER,
    position TEXT,
    hireDate DATE,
    responsibilities TEXT,
    education TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (departmentId) REFERENCES departements (id)
  )`);

  console.log('✅ Tables créées avec succès');

  // Insérer des données de test
  const insertTestData = () => {
    // Créer un utilisateur admin
    const adminPassword = bcrypt.hashSync('admin123', 10);
    db.run(`INSERT OR IGNORE INTO users (email, password, role) VALUES (?, ?, ?)`, 
      ['admin@universite.fr', adminPassword, 'admin']);

    // Insérer des départements
    db.run(`INSERT OR IGNORE INTO departements (nom, description) VALUES (?, ?)`, 
      ['Informatique', 'Département des sciences informatiques']);
    db.run(`INSERT OR IGNORE INTO departements (nom, description) VALUES (?, ?)`, 
      ['Mathématiques', 'Département des mathématiques']);
    db.run(`INSERT OR IGNORE INTO departements (nom, description) VALUES (?, ?)`, 
      ['Physique', 'Département de physique']);

    console.log('✅ Données de test insérées');
  };

  insertTestData();
});

db.close((err) => {
  if (err) {
    console.error('❌ Erreur lors de la fermeture de la base de données:', err.message);
  } else {
    console.log('✅ Base de données initialisée avec succès');
    console.log('📁 Fichier de base de données:', dbPath);
  }
}); 