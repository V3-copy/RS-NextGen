const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Queue, QueueEvents } = require('bullmq');
const Redis = require('ioredis');
const { Client: MinioClient } = require('minio');
const { Server } = require('socket.io');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const { generateSportsCanvas } = require('./utils/canvasGenerator');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

const upload = multer({ storage: multer.memoryStorage() });

// --- INFRASTRUCTURE CONFIG ---
const MONGO_URI = process.env.MONGO_DB || 'mongodb://127.0.0.1:27017/kiosk';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : 0;

const minioClient = new MinioClient({
  endPoint: process.env.MINIO_ENDPOINT || '127.0.0.1',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
});
const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || 'srm-fresher-images';

// --- MONGODB SCHEMAS ---
const userSchema = new mongoose.Schema({
  name: String,
  course: String,
  year: String,
  whatsappNumber: String,
  email: String,
  gender: String,
  archetype: String,
  answers: [String],
  kioskId: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// --- QUEUE SETUP (BULLMQ) ---
const connection = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD, db: REDIS_DB };
const processQueue = new Queue('imageProcessing', { connection });
const redisClient = new Redis(connection);

const queueEvents = new QueueEvents('imageProcessing', { connection });
queueEvents.on('progress', ({ jobId, data }) => {
  if (data && data.roomId && data.event) {
    io.to(data.roomId).emit(data.event, data.data);
  }
});

// Initialize MinIO Bucket
async function initMinio() {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME);
      console.log(`MinIO bucket '${BUCKET_NAME}' created.`);
    } else {
      console.log(`MinIO bucket '${BUCKET_NAME}' exists.`);
    }
  } catch (err) {
    console.error('Error initializing MinIO:', err);
  }
}
initMinio();

// Connect to MongoDB with Active Connection Pool
const mongoOptions = {
  maxPoolSize: process.env.MONGO_MAX_POOL_SIZE ? parseInt(process.env.MONGO_MAX_POOL_SIZE) : 50,
  minPoolSize: process.env.MONGO_MIN_POOL_SIZE ? parseInt(process.env.MONGO_MIN_POOL_SIZE) : 5,
};

mongoose.connect(MONGO_URI, mongoOptions)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- WEBSOCKETS ---
const APP_VERSION = process.env.APP_VERSION || '1.0.4';

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current version to the client for auto-updates
  socket.emit('version_check', { version: APP_VERSION });
  
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// --- API ENDPOINTS ---
app.post('/api/kiosk/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.KIOSK_USERNAME && password === process.env.KIOSK_PASSWORD) {
    res.json({ success: true, token: password });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post('/api/register', upload.single('image'), async (req, res) => {
  const { name, course, year, whatsappNumber, email, gender, archetype, answers, kioskToken, kioskId = 'web-kiosk-unknown' } = req.body;
  
  if (kioskToken !== process.env.KIOSK_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized kiosk' });
  }
  
  if (!name || !whatsappNumber || !req.file) {
    return res.status(400).json({ error: 'Missing required fields or image' });
  }

  let parsedAnswers = [];
  try {
    parsedAnswers = answers ? JSON.parse(answers) : [];
  } catch(e) {
    console.error('Error parsing answers:', e);
  }

  try {
    // Save raw image to MinIO
    const buffer = req.file.buffer;
    const fileName = `raw_${crypto.randomBytes(8).toString('hex')}.jpg`;
    
    await minioClient.putObject(BUCKET_NAME, fileName, buffer, buffer.length, {
      'Content-Type': 'image/jpeg'
    });

    // 1. Save to MongoDB
    const user = new User({ name, course, year, whatsappNumber, email, gender, archetype, answers: parsedAnswers, kioskId, imageUrl: fileName });
    await user.save();
    
    // 2. The roomId for this specific user session
    const roomId = `room_${kioskId}_${user._id}`;
    
    // 3. Add to BullMQ for background processing
    await processQueue.add('compositeAndSend', {
      userId: user._id,
      name,
      course,
      archetype,
      whatsappNumber,
      roomId,
      fileName
    });

    res.json({ success: true, userId: user._id, roomId });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- RECENT IMAGES ENDPOINT (DRIFTWALL) ---
app.get('/api/kiosk/recent-images', async (req, res) => {
  const kioskToken = req.headers['x-kiosk-token'];
  if (kioskToken !== process.env.KIOSK_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized kiosk' });
  }

  try {
    const recentUsers = await User.find({ imageUrl: { $exists: true, $ne: null } })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('_id name course archetype');

    const images = recentUsers.map(user => ({
      id: user._id,
      name: user.name,
      course: user.course,
      archetype: user.archetype,
      url: `/api/download-raw/${user._id}`
    }));

    res.json({ success: true, count: images.length, images });
  } catch (error) {
    console.error('Error fetching recent images:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- CANVAS PREVIEW ENDPOINT ---
app.post('/api/generate-canvas', upload.single('image'), async (req, res) => {
  try {
    const { name, year, archetype, answers } = req.body;
    let userImageBuffer = req.file ? req.file.buffer : null;
    
    let parsedAnswers = [];
    try {
      parsedAnswers = answers ? JSON.parse(answers) : [];
    } catch(e) {}
    
    const bodyForCanvas = { name, year, archetype, answers: parsedAnswers };
    
    const canvas = await generateSportsCanvas(bodyForCanvas, userImageBuffer);
    res.json({ success: true, canvasDataUrl: canvas.toDataURL('image/png') });
  } catch (err) {
    console.error('[Canvas] Preview error:', err);
    res.status(500).json({ error: 'Generation failed', detail: err.message });
  }
});

// --- DEV ONLY PREVIEW ROUTE ---
if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production') {
  app.get('/api/dev/preview', async (req, res) => {
    try {
      const dummyData = {
        name: req.query.name || 'John Doe',
        course: req.query.course || 'B.Tech Computer Science',
        year: req.query.year || '1',
        archetype: req.query.archetype || 'Innovator',
        gender: req.query.gender || 'other',
        answers: ['Dummy Answer', 'Dummy Sponsor']
      };
      
      const canvas = await generateSportsCanvas(dummyData, null);
      const buffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
      res.setHeader('Content-Type', 'image/jpeg');
      res.send(buffer);
    } catch (err) {
      console.error('[DevPreview] Error:', err);
      res.status(500).send('Error generating dev preview');
    }
  });
}


// --- DOWNLOAD RAW ENDPOINT ---
app.get('/api/download-raw/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);
    if (!user || !user.imageUrl) return res.status(404).send('Not found');

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Stream directly from MinIO
    const dataStream = await minioClient.getObject(BUCKET_NAME, user.imageUrl);
    dataStream.pipe(res);
    
    dataStream.on('error', (e) => {
      console.error('MinIO stream error:', e);
      if (!res.headersSent) res.status(500).send('Error reading raw image');
    });
  } catch (err) {
    console.error('Download raw error:', err);
    res.status(500).send('Error generating file');
  }
});

// --- DOWNLOAD ENDPOINT ---
app.get('/api/download/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `generated_image_${userId}`;
    
    res.setHeader('Content-Disposition', 'attachment; filename="SRM_Identity.jpg"');
    res.setHeader('Content-Type', 'image/jpeg');

    const cachedImage = await redisClient.getBuffer(cacheKey);
    if (cachedImage) {
      console.log(`[Cache Hit] Serving generated image for user ${userId}`);
      return res.send(cachedImage);
    }

    console.log(`[Cache Miss] Generating image for user ${userId}`);
    
    const user = await User.findById(userId);
    if (!user || !user.imageUrl) return res.status(404).send('Not found');

    // Fetch raw photo from MinIO
    let rawBuffer;
    try {
      const dataStream = await minioClient.getObject(BUCKET_NAME, user.imageUrl);
      rawBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        dataStream.on('data', c => chunks.push(c));
        dataStream.on('end', () => resolve(Buffer.concat(chunks)));
        dataStream.on('error', reject);
      });
    } catch (e) {
      console.error('MinIO Error:', e);
      return res.status(500).send('Error reading raw image');
    }

    const canvas = await generateSportsCanvas(user, rawBuffer);
    const finalBuffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
    
    await redisClient.set(cacheKey, finalBuffer, 'EX', 600); // 10 min cache
    res.send(finalBuffer);

  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Error generating file');
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
