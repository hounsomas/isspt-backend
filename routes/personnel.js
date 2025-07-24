const express = require('express');
const router = express.Router();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const jwt = require('jsonwebtoken');

const db = new sqlite3.Database(path.join(__dirname, '../database.sqlite'));
const JWT_SECRET = process.env.JWT_SECRET || 'votre-secret-jwt-super-securise';

// Middleware d'authentification
const auth = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token d\'accès requis' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token invalide' });
    }
    req.user = user;
    next();
  });
};

// Route pour obtenir tout le personnel enseignant
router.get('/teaching', auth, (req, res) => {
  db.all(`
    SELECT t.*, d.nom as departmentName
    FROM teaching_staff t
    JOIN departements d ON t.departmentId = d.id
    ORDER BY t.lastName, t.firstName
  `, (err, teachers) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(teachers || []);
  });
});

// Route pour créer un nouvel enseignant
router.post('/teaching', auth, (req, res) => {
  const { 
    firstName, lastName, email, phone, departmentId, position, 
    specialization, hireDate, education 
  } = req.body;
  
  const employeeId = `ENS-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  
  db.run(`
    INSERT INTO teaching_staff (
      employeeId, firstName, lastName, email, phone, departmentId, 
      position, specialization, hireDate, education, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `, [employeeId, firstName, lastName, email, phone, departmentId, 
      position, specialization, hireDate, education], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, employeeId });
  });
});

// Route pour mettre à jour un enseignant
router.put('/teaching/:id', auth, (req, res) => {
  const { 
    firstName, lastName, email, phone, departmentId, position, 
    specialization, education 
  } = req.body;
  
  db.run(`
    UPDATE teaching_staff 
    SET firstName = ?, lastName = ?, email = ?, phone = ?, departmentId = ?,
        position = ?, specialization = ?, education = ?
    WHERE id = ?
  `, [firstName, lastName, email, phone, departmentId, 
      position, specialization, education, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Enseignant mis à jour avec succès' });
  });
});

// Route pour obtenir tout le personnel administratif
router.get('/admin', auth, (req, res) => {
  db.all(`
    SELECT a.*, d.nom as departmentName
    FROM admin_staff a
    JOIN departements d ON a.departmentId = d.id
    ORDER BY a.lastName, a.firstName
  `, (err, adminStaff) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(adminStaff || []);
  });
});

// Route pour créer un nouveau membre du personnel administratif
router.post('/admin', auth, (req, res) => {
  const { 
    firstName, lastName, email, phone, departmentId, position, 
    hireDate, responsibilities, education 
  } = req.body;
  
  const employeeId = `ADM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  
  db.run(`
    INSERT INTO admin_staff (
      employeeId, firstName, lastName, email, phone, departmentId, 
      position, hireDate, responsibilities, education, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
  `, [employeeId, firstName, lastName, email, phone, departmentId, 
      position, hireDate, responsibilities, education], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, employeeId });
  });
});

// Route pour mettre à jour un membre du personnel administratif
router.put('/admin/:id', auth, (req, res) => {
  const { 
    firstName, lastName, email, phone, departmentId, position, 
    responsibilities, education 
  } = req.body;
  
  db.run(`
    UPDATE admin_staff 
    SET firstName = ?, lastName = ?, email = ?, phone = ?, departmentId = ?,
        position = ?, responsibilities = ?, education = ?
    WHERE id = ?
  `, [firstName, lastName, email, phone, departmentId, 
      position, responsibilities, education, req.params.id], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ message: 'Personnel administratif mis à jour avec succès' });
  });
});

// Route pour obtenir les statistiques du personnel
router.get('/statistics', auth, (req, res) => {
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM teaching_staff WHERE status = 'active') as activeTeachers,
      (SELECT COUNT(*) FROM admin_staff WHERE status = 'active') as activeAdmin,
      (SELECT COUNT(*) FROM teaching_staff) as totalTeachers,
      (SELECT COUNT(*) FROM admin_staff) as totalAdmin,
      (SELECT COUNT(DISTINCT departmentId) FROM teaching_staff) as teachingDepartments,
      (SELECT COUNT(DISTINCT departmentId) FROM admin_staff) as adminDepartments
  `, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(stats || {
      activeTeachers: 0,
      activeAdmin: 0,
      totalTeachers: 0,
      totalAdmin: 0,
      teachingDepartments: 0,
      adminDepartments: 0
    });
  });
});

// Route pour obtenir les départements
router.get('/departments', auth, (req, res) => {
  db.all('SELECT * FROM departements ORDER BY nom', (err, departments) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(departments || []);
  });
});

module.exports = router; 