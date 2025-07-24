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

// Route pour obtenir toutes les factures
router.get('/billing', auth, (req, res) => {
  db.all(`
    SELECT b.*, e.nom as studentName, e.prenom as studentFirstName, e.matricule as studentId
    FROM bills b
    JOIN etudiants e ON b.studentId = e.id
    ORDER BY b.issueDate DESC
  `, (err, bills) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(bills || []);
  });
});

// Route pour créer une nouvelle facture
router.post('/billing', auth, (req, res) => {
  const { studentId, amount, description, dueDate } = req.body;
  const invoiceNumber = `FAC-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  
  db.run(`
    INSERT INTO bills (invoiceNumber, studentId, amount, description, dueDate, issueDate, status)
    VALUES (?, ?, ?, ?, ?, date('now'), 'pending')
  `, [invoiceNumber, studentId, amount, description, dueDate], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, invoiceNumber });
  });
});

// Route pour obtenir tous les paiements
router.get('/payments', auth, (req, res) => {
  db.all(`
    SELECT p.*, e.nom as studentName, e.prenom as studentFirstName, e.matricule as studentId, b.invoiceNumber
    FROM payments p
    JOIN etudiants e ON p.studentId = e.id
    JOIN bills b ON p.billId = b.id
    ORDER BY p.date DESC
  `, (err, payments) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(payments || []);
  });
});

// Route pour créer un nouveau paiement
router.post('/payments', auth, (req, res) => {
  const { billId, studentId, amount, method, reference } = req.body;
  const paymentNumber = `PAY-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  
  db.run(`
    INSERT INTO payments (paymentNumber, billId, studentId, amount, method, reference, date, status)
    VALUES (?, ?, ?, ?, ?, ?, date('now'), 'completed')
  `, [paymentNumber, billId, studentId, amount, method, reference], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    
    // Mettre à jour le statut de la facture
    db.run('UPDATE bills SET status = ? WHERE id = ?', ['paid', billId], (updateErr) => {
      if (updateErr) {
        console.error('Erreur lors de la mise à jour du statut de la facture:', updateErr);
      }
    });
    
    res.json({ id: this.lastID, paymentNumber });
  });
});

// Route pour obtenir toutes les dépenses
router.get('/expenses', auth, (req, res) => {
  db.all(`
    SELECT e.*, d.nom as departmentName
    FROM expenses e
    JOIN departements d ON e.departmentId = d.id
    ORDER BY e.date DESC
  `, (err, expenses) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(expenses || []);
  });
});

// Route pour créer une nouvelle dépense
router.post('/expenses', auth, (req, res) => {
  const { description, amount, category, departmentId, supplier } = req.body;
  const expenseNumber = `EXP-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;
  
  db.run(`
    INSERT INTO expenses (expenseNumber, description, amount, category, departmentId, supplier, date, status)
    VALUES (?, ?, ?, ?, ?, ?, date('now'), 'pending')
  `, [expenseNumber, description, amount, category, departmentId, supplier], function(err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json({ id: this.lastID, expenseNumber });
  });
});

// Route pour obtenir les statistiques comptables
router.get('/statistics', auth, (req, res) => {
  db.get(`
    SELECT 
      (SELECT COUNT(*) FROM bills) as totalBills,
      (SELECT COUNT(*) FROM bills WHERE status = 'paid') as paidBills,
      (SELECT COALESCE(SUM(amount), 0) FROM bills WHERE status = 'paid') as totalPaid,
      (SELECT COUNT(*) FROM payments) as totalPayments,
      (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status = 'completed') as totalReceived,
      (SELECT COUNT(*) FROM expenses) as totalExpenses,
      (SELECT COALESCE(SUM(amount), 0) FROM expenses WHERE status = 'approved') as totalExpensesApproved
  `, (err, stats) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(stats || {
      totalBills: 0,
      paidBills: 0,
      totalPaid: 0,
      totalPayments: 0,
      totalReceived: 0,
      totalExpenses: 0,
      totalExpensesApproved: 0
    });
  });
});

module.exports = router; 