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
const archiver = require('archiver');
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

const departmentSchema = new mongoose.Schema({
  name: String
});
const Department = mongoose.model('Department', departmentSchema);

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

let cachedDepartments = [];

async function loadDepartments() {
  try {
    const deps = await Department.find();
    cachedDepartments = deps.map(d => d.name);
    console.log(`Loaded ${cachedDepartments.length} departments.`);
    io.emit('departments_update', cachedDepartments);
  } catch (err) {
    console.error('Error loading departments:', err);
  }
}

mongoose.connect(MONGO_URI, mongoOptions)
  .then(() => {
    console.log('MongoDB connected');
    loadDepartments();
  })
  .catch(err => console.error('MongoDB connection error:', err));

// --- WEBSOCKETS ---
const APP_VERSION = process.env.APP_VERSION || '1.1.2';

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current version to the client for auto-updates
  socket.emit('version_check', { version: APP_VERSION });
  
  // Send current departments list
  socket.emit('departments_update', cachedDepartments);

  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// --- ADMIN AUTH & MIDDLEWARE ---
app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    // Basic simple token using base64 for demonstration (or just return password as token)
    const token = Buffer.from(`${username}:${password}`).toString('base64');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
  const token = authHeader.split(' ')[1];
  const expectedToken = Buffer.from(`${process.env.ADMIN_USERNAME}:${process.env.ADMIN_PASSWORD}`).toString('base64');
  if (token !== expectedToken) return res.status(403).json({ error: 'Forbidden' });
  next();
};

async function getMetricsData() {
  const totalUsers = await User.countDocuments();
  const totalKiosks = io.engine.clientsCount;
  const deptCounts = await User.aggregate([{ $group: { _id: "$course", count: { $sum: 1 } } }]);
  const genderCounts = await User.aggregate([{ $group: { _id: "$gender", count: { $sum: 1 } } }]);
  return { totalUsers, totalKiosks, departments: deptCounts, genders: genderCounts };
}

async function broadcastMetrics() {
  try {
    const data = await getMetricsData();
    io.emit('metrics_update', data);
  } catch (e) {
    console.error('Failed to broadcast metrics', e);
  }
}

// --- ADMIN ROUTES ---
app.get('/admin-panel', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/api/departments', verifyAdmin, (req, res) => {
  res.json({ success: true, departments: cachedDepartments });
});

app.post('/api/departments', verifyAdmin, async (req, res) => {
  try {
    const { departments } = req.body;
    if (!Array.isArray(departments)) return res.status(400).json({ error: 'Expected array of strings' });
    
    await Department.deleteMany({});
    if (departments.length > 0) {
      const docs = departments.map(d => ({ name: d }));
      await Department.insertMany(docs);
    }
    
    cachedDepartments = departments;
    io.emit('departments_update', cachedDepartments);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating departments:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- DASHBOARD METRICS ---
app.get('/api/admin/metrics', verifyAdmin, async (req, res) => {
  try {
    const data = await getMetricsData();
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('Metrics error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- PAGINATED USERS ---
app.get('/api/admin/users', verifyAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || '-createdAt';
    const department = req.query.department;
    const gender = req.query.gender;

    let query = {};
    if (department) query.course = department;
    if (gender) query.gender = gender;

    const users = await User.find(query)
      .sort(sortBy)
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-answers'); // Exclude answers to save bandwidth if not needed, or keep them

    const total = await User.countDocuments(query);
    res.json({
      success: true,
      users,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('Users fetch error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- BACKUP ZIP GENERATOR ---
function createBackupZip(outputStream) {
  return new Promise(async (resolve, reject) => {
    try {
      const users = await User.find();
      let csv = 'ID,Name,Course,Year,WhatsApp,Email,Gender,Archetype,Date,ImagePath\n';
      users.forEach(u => {
        const img = u.imageUrl ? `images/${u.imageUrl}` : '';
        csv += `"${u._id}","${u.name}","${u.course}","${u.year}","${u.whatsappNumber}","${u.email || ''}","${u.gender}","${u.archetype}","${u.createdAt}","${img}"\n`;
      });

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', err => reject(err));
      
      outputStream.on('close', () => resolve());
      outputStream.on('finish', () => resolve());

      archive.pipe(outputStream);
      archive.append(csv, { name: 'users.csv' });

      for (const u of users) {
        if (u.imageUrl) {
          try {
            const imgStream = await minioClient.getObject(BUCKET_NAME, u.imageUrl);
            archive.append(imgStream, { name: `images/${u.imageUrl}` });
          } catch (minioErr) {
            console.error(`Failed to fetch image ${u.imageUrl} for zip:`, minioErr);
          }
        }
      }
      archive.finalize();
    } catch (err) {
      reject(err);
    }
  });
}

// --- BACKUP DATA (ZIP + CSV) ---
app.get('/api/admin/backup', verifyAdmin, async (req, res) => {
  try {
    res.attachment('srm_backup.zip');
    await createBackupZip(res);
  } catch (err) {
    console.error('Backup error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Internal server error' });
  }
});

// --- RESET DATABASE ---
app.delete('/api/admin/reset', verifyAdmin, async (req, res) => {
  try {
    const backupsDir = path.join(__dirname, 'backups');
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir);
    }
    const backupFile = path.join(backupsDir, `srm_backup_${Math.floor(Date.now() / 1000)}.zip`);
    const stream = fs.createWriteStream(backupFile);
    
    await createBackupZip(stream);
    console.log(`Pre-reset backup created at ${backupFile}`);

    await User.deleteMany({});
    broadcastMetrics();
    res.json({ success: true, message: 'Database cleared, backup created on server.' });
  } catch (err) {
    console.error('Reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- ADMIN BADGE PREVIEW ---
app.get('/api/admin/preview-badge/:userId', verifyAdmin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user || !user.imageUrl) return res.status(404).send('User or photo not found');

    const dataStream = await minioClient.getObject(BUCKET_NAME, user.imageUrl);
    const rawBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      dataStream.on('data', c => chunks.push(c));
      dataStream.on('end', () => resolve(Buffer.concat(chunks)));
      dataStream.on('error', reject);
    });

    const canvas = await generateSportsCanvas(user, rawBuffer);
    const finalBuffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });

    res.set('Content-Type', 'image/jpeg');
    res.send(finalBuffer);
  } catch (err) {
    console.error('Preview error:', err);
    res.status(500).send('Error generating preview');
  }
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
  } catch (e) {
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
    
    // Broadcast updated metrics
    broadcastMetrics();

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
    const { name, course, year, gender, archetype, answers } = req.body;
    let userImageBuffer = req.file ? req.file.buffer : null;

    let parsedAnswers = [];
    try {
      parsedAnswers = answers ? JSON.parse(answers) : [];
    } catch (e) { }

    const bodyForCanvas = { name, course, year, gender, archetype, answers: parsedAnswers };

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
