import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config(); // load .env

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - CORS Configuration
// Allow multiple origins for both development and production
const allowedOrigins = [
  'http://localhost:5173',           // Local development
  'http://localhost:3000',           // Alternative local port
  'https://swe-ai-crop.vercel.app',  // Production Vercel deployment
  process.env.CORS_ORIGIN            // Additional origin from env if specified
].filter(Boolean); // Remove any undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log(`CORS blocked request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Use env variable for MongoDB connection
const mongoURI = process.env.MONGO_URL;

mongoose.connect(mongoURI)
  .then(() => console.log('✓ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Routes (using dynamic import for ES modules)
import cropAdviceRoutes from './routes/cropAdvice.js';
app.use('/api', cropAdviceRoutes);

app.get('/', (req, res) => {
  res.send('SWE AI Crop Backend - API Running');
});

app.listen(PORT, () => {
  const serverUrl = process.env.NODE_ENV === 'production'
    ? 'https://swe-ai-crop-back.onrender.com'
    : `http://localhost:${PORT}`;

  console.log(`\n✓ Server running at ${serverUrl}`);
  console.log(`✓ API endpoints available at:`);
  console.log(`  - POST ${serverUrl}/api/crop-advice`);
  console.log(`  - GET  ${serverUrl}/api/test\n`);
});
