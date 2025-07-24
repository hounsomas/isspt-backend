// Nouveau commit pour forcer le déploiement Render
// Trigger Render deploy - ajout d'un commentaire pour forcer le build
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware de sécurité et performance
app.use(helmet());
app.use(compression());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : ['http://localhost:3000'],
  credentials: true
}));

// Middleware pour parser le JSON
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Routes API
app.use('/api/auth', require('./routes/auth').router);
app.use('/api/etudiants', require('./routes/etudiants'));
app.use('/api/professeurs', require('./routes/professeurs'));
app.use('/api/cours', require('./routes/cours'));
app.use('/api/notes', require('./routes/notes'));
app.use('/api/emplois', require('./routes/emplois'));
app.use('/api/absences', require('./routes/absences'));
app.use('/api/departements', require('./routes/departements'));
app.use('/api/comptabilite', require('./routes/accounting'));
app.use('/api/personnel', require('./routes/personnel'));
app.use('/api/bourses', require('./routes/bourses'));

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Serveur de gestion universitaire opérationnel',
    timestamp: new Date().toISOString()
  });
});

// Gestion des erreurs 404
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route API non trouvée' });
});

// En production, servir les fichiers statiques du frontend
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
  });
}

// Middleware de gestion d'erreurs global
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Erreur interne du serveur',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Une erreur est survenue'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur de gestion universitaire démarré sur le port ${PORT}`);
  console.log(`📊 Mode: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
}); 