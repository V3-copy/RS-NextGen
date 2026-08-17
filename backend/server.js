const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { Queue, QueueEvents } = require('bullmq');
const Redis = require('ioredis');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { Client: MinioClient } = require('minio');
const { Server } = require('socket.io');
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// --- INFRASTRUCTURE CONFIG ---
const MONGO_URI = process.env.MONGO_DB || 'mongodb://127.0.0.1:27017/kiosk';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;

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
  archetype: String,
  kioskId: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// --- QUEUE SETUP (BULLMQ) ---
const connection = { host: REDIS_HOST, port: REDIS_PORT };
const processQueue = new Queue('imageProcessing', { connection });
const redisClient = new Redis({ host: REDIS_HOST, port: REDIS_PORT });

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

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// --- WEBSOCKETS ---
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
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

app.post('/api/register', async (req, res) => {
  const { name, course, year, whatsappNumber, archetype, kioskId, base64Image, kioskToken } = req.body;
  
  if (kioskToken !== process.env.KIOSK_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized kiosk' });
  }
  
  if (!name || !whatsappNumber || !base64Image) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Save raw image to MinIO
    const base64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');
    const fileName = `raw_${crypto.randomBytes(8).toString('hex')}.jpg`;
    
    await minioClient.putObject(BUCKET_NAME, fileName, buffer, buffer.length, {
      'Content-Type': 'image/jpeg'
    });

    // 1. Save to MongoDB
    const user = new User({ name, course, year, whatsappNumber, archetype, kioskId, imageUrl: fileName });
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

app.get('/api/download/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `generated_image_${userId}`;
    
    res.setHeader('Content-Disposition', 'attachment; filename="SRM_Identity.jpg"');
    res.setHeader('Content-Type', 'image/jpeg');

    // Check Redis cache
    const cachedImage = await redisClient.getBuffer(cacheKey);
    if (cachedImage) {
      console.log(`[Cache Hit] Serving generated image for user ${userId}`);
      return res.send(cachedImage);
    }

    console.log(`[Cache Miss] Generating image for user ${userId}`);
    
    // Fetch user
    const user = await User.findById(userId);
    if (!user || !user.imageUrl) {
      return res.status(404).send('User or image not found');
    }

    // Fetch raw image from MinIO
    let rawImageBuffer;
    try {
      const dataStream = await minioClient.getObject(BUCKET_NAME, user.imageUrl);
      rawImageBuffer = await new Promise((resolve, reject) => {
        const chunks = [];
        dataStream.on('data', chunk => chunks.push(chunk));
        dataStream.on('end', () => resolve(Buffer.concat(chunks)));
        dataStream.on('error', reject);
      });
    } catch (err) {
      console.error('Error fetching raw image from MinIO:', err);
      return res.status(500).send('Error reading raw image');
    }

    // Generate Composite Image with @napi-rs/canvas
    const width = 1080;
    const height = 1080;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 1. Draw solid background placeholder
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, width, height);
    
    // Draw some template text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 60px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('SRM Identity', width / 2, 120);
    ctx.font = '40px Arial';
    ctx.fillText(user.name || 'Student', width / 2, 200);
    ctx.fillText(user.course || 'Course', width / 2, 260);

    // 2. Draw user raw image in a circle
    const rawImage = await loadImage(rawImageBuffer);
    const circleRadius = 250;
    const centerX = width / 2;
    const centerY = height / 2 + 100;
    
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    
    // Calculate scaling to cover the circle
    const scale = Math.max((circleRadius * 2) / rawImage.width, (circleRadius * 2) / rawImage.height);
    const imgWidth = rawImage.width * scale;
    const imgHeight = rawImage.height * scale;
    const imgX = centerX - imgWidth / 2;
    const imgY = centerY - imgHeight / 2;
    
    ctx.drawImage(rawImage, imgX, imgY, imgWidth, imgHeight);
    ctx.restore();

    // 3. Draw a border around the circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2, true);
    ctx.lineWidth = 15;
    ctx.strokeStyle = '#4CAF50'; // Green border
    ctx.stroke();

    const finalBuffer = canvas.toBuffer('image/jpeg');
    
    // Cache the buffer in Redis for 10 minutes (600 seconds)
    await redisClient.set(cacheKey, finalBuffer, 'EX', 600);
    
    res.send(finalBuffer);

  } catch (err) {
    console.error('Download/Generation error:', err);
    res.status(500).send('Error generating file');
  }
});



server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
