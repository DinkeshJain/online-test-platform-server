const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const cron = require('node-cron');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const app = express();

// Import models for cron job
const Test = require('./models/Test');

// Middleware
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174', 
    'http://localhost:5175',
    'https://anuadmin.bah.in',
    'https://anuevaluator.bah.in',
    'https://anustudent.bah.in'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin);
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-auth-token');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/tests', require('./routes/tests'));
app.use('/api/submissions', require('./routes/submissions'));
app.use('/api/bulk', require('./routes/bulkUpload'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/evaluators', require('./routes/evaluators'));

// MongoDB connection
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/online-test-app')
.then(() => {
  console.log('MongoDB connected');
  
  // Start cron job after database connection
  // Cron job to check and deactivate expired tests every 5 minutes (less aggressive)
  cron.schedule('*/5 * * * *', async () => {
    try {
      const now = new Date();
      const expiredTests = await Test.updateMany(
        {
          isActive: true,
          activeTo: { $ne: null, $lt: now }
        },
        {
          $set: { isActive: false }
        }
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

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'Online Test Platform API' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
