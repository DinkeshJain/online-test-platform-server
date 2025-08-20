const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const Test = require('./models/Test');

app.use(cors({
  origin: [
    // Local development
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    
    // Production HTTPS domains
    'https://anuadmin.bah.in',
    'https://anuevaluator.bah.in',
    'https://anustudent.bah.in',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-auth-token',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Access-Control-Request-Method',
    'Access-Control-Request-Headers'
  ],
  exposedHeaders: ['x-auth-token'],
  optionsSuccessStatus: 200 // For legacy browser support
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Enhanced OPTIONS handler for CORS preflight requests
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175',
    'https://anuadmin.bah.in', 'https://anuevaluator.bah.in', 'https://anustudent.bah.in',
  ];
  
  if (allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token, X-Requested-With, Accept, Origin, Access-Control-Request-Method, Access-Control-Request-Headers');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400'); // 24 hours
  res.sendStatus(200);
});

app.use('/uploads', express.static('uploads'));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/tests', require('./routes/tests'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/bulk', require('./routes/bulkUpload'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/evaluators', require('./routes/evaluators'));
app.use('/api/maintenance', require('./routes/maintenance'));
app.use('/api/exam-progress', require('./routes/examProgress'));
app.use('/api/results', require('./routes/results'));


mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected');

    cron.schedule('*/5 * * * *', async () => {
      try {
        const now = new Date();
        const expiredTests = await Test.updateMany(
          { isActive: true, activeTo: { $ne: null, $lt: now } },
          { $set: { isActive: false } }
        );
        if (expiredTests.modifiedCount > 0) {
          console.log(`Deactivated ${expiredTests.modifiedCount} expired tests at ${now.toISOString()}`);
        }
      } catch (error) {
        console.error('Error in test deactivation cron job:', error);
      }
    });
  })
  .catch(err => console.log('MongoDB connection error:', err));

app.get('/', (req, res) => {
  res.json({ message: 'Online Test Platform API' });
});

// In your Express server (e.g., server/index.js)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});