import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

dotenv.config(); // load .env

const app = express();
const PORT = process.env.PORT || 5000;

// Create HTTP server for Socket.IO
const httpServer = createServer(app);

// Middleware - CORS Configuration
// Allow multiple origins for both development and production
const allowedOrigins = [
  'http://localhost:5173',           // Local development
  'http://localhost:3000',           // Alternative local port
  'https://swe-ai-crop.vercel.app',  // Production Vercel deployment
  process.env.CORS_ORIGIN            // Additional origin from env if specified
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, or curl)
    if (!origin) return callback(null, true);

    // Allow all localhost origins for Flutter web testing
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }

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

// ─── Socket.IO Setup ───
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.startsWith('http://localhost:')) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`✓ Socket connected: ${socket.id}`);

  // Join a user-specific room for targeted events
  socket.on('join', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
      console.log(`  Socket ${socket.id} joined room user_${userId}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`  Socket disconnected: ${socket.id}`);
  });
});

// Middleware: attach io instance to every request for routes to emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Database Connection
const mongoURI = process.env.MONGO_URL;

if (!mongoURI) {
  console.error('❌ FATAL ERROR: MONGO_URL is not defined in environment variables.');
  console.error('   Please add MONGO_URL to your .env file or Render dashboard.');
  process.exit(1); // Stop the server from running without a DB
}

mongoose.connect(mongoURI)
  .then(async () => {
    console.log('✓ Connected to MongoDB');
    // Ensure stable guest user exists (US6)
    try {
      const User = mongoose.model('User');
      const guestId = '1aa73030589c2135f668eacb';
      const guestExists = await User.findById(guestId);
      if (!guestExists) {
        await User.create({
          _id: guestId,
          name: 'Guest Farmer',
          phoneNumber: '0000000000',
          role: 'guest'
        });
        console.log('✓ Stable guest user created');
      }
    } catch (err) {
      console.error('Error ensuring guest user:', err.message);
    }
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

// Routes (using dynamic import for ES modules)
import cropAdviceRoutes from './routes/cropAdvice.js';
app.use('/api/crop-advice', cropAdviceRoutes);

app.get('/', (req, res) => {
  res.send('SWE AI Crop Backend - API Running');
});

// Import new routes
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cropRoutes from './routes/cropRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';
import consentRoutes from './routes/consentRoutes.js';
import diagnosisRoutes from './routes/diagnosisRoutes.js';
import communityRoutes from './routes/communityRoutes.js';
import calendarRoutes from './routes/calendarRoutes.js';
import farmTaskRoutes from './routes/farmTaskRoutes.js';
import speechRoutes from './routes/speechRoutes.js';
import logRoutes from './routes/logRoutes.js';
import feedbackRoutes from './routes/feedbackRoutes.js';
import ttsRoutes from './routes/ttsRoutes.js';
import simulatorRoutes from './routes/simulatorRoutes.js';
import podcastRoutes from './routes/podcastRoutes.js';
import taskReminderRoutes from './routes/taskReminderRoutes.js';
import { protect } from './middleware/authMiddleware.js';

// Mount routes
app.use('/api/simulator', simulatorRoutes);
app.use('/api/podcast', podcastRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/user', protect, userRoutes);
app.use('/api/crops', protect, cropRoutes);
app.use('/api/settings', protect, settingsRoutes);
app.use('/api/consent', consentRoutes); // Public endpoint for logging compliance
app.use('/api/diagnosis', protect, diagnosisRoutes);
app.use('/api/community', communityRoutes); // Open access to view posts
app.use('/api/calendar', protect, calendarRoutes);
app.use('/api/farm-tasks', farmTaskRoutes);
app.use('/api/speech', speechRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/task-reminders', taskReminderRoutes);

httpServer.listen(PORT, '0.0.0.0', () => {
  const serverUrl = process.env.NODE_ENV === 'production'
    ? 'https://swe-ai-crop-back.onrender.com'
    : `http://localhost:${PORT}`;

  console.log(`\n✓ Server running at ${serverUrl}`);
  console.log(`✓ API endpoints available at:`);
  console.log(`  - POST ${serverUrl}/api/crop-advice`);
  console.log(`  - POST ${serverUrl}/api/auth/login`);
  console.log(`  - GET  ${serverUrl}/api/test\n`);
});
