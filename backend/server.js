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
  answers: [String],
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
  const { name, course, year, whatsappNumber, archetype, answers, kioskId, base64Image, kioskToken } = req.body;
  
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
    const user = new User({ name, course, year, whatsappNumber, archetype, answers, kioskId, imageUrl: fileName });
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

// Helper: draw rounded rectangle path
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Helper: draw a star shape
function drawStar(ctx, cx, cy, spikes, outerR, innerR) {
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(cx, cy - outerR);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(cx + Math.cos(rot) * outerR, cy + Math.sin(rot) * outerR);
    rot += step;
    ctx.lineTo(cx + Math.cos(rot) * innerR, cy + Math.sin(rot) * innerR);
    rot += step;
  }
  ctx.lineTo(cx, cy - outerR);
  ctx.closePath();
}

// Helper: seeded random for deterministic generation
function strToSeed(str) {
  let h = 0xdeadbeef;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 2654435761);
  return ((h ^ h >>> 16) >>> 0);
}

function seededRandom(seed) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
}

// --- SHARED CANVAS GENERATION FUNCTION ---
async function generateBeautifulCanvas({ name = 'Student', year = '1', archetype = 'Explorer', course = 'SRM University' }, answers = [], userImageBuffer = null) {
  const yearNum = parseInt(year) || 1;
  const rand = seededRandom(strToSeed(name + archetype));

  const W = 1080, H = 1080;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const palettes = {
    'Explorer':              { primary: '#6C63FF', secondary: '#FF6584', accent: '#43E97B', bg1: '#0d0d2b', bg2: '#1a1a4e' },
    'Problem Solver':        { primary: '#00D2FF', secondary: '#3A7BD5', accent: '#F9CA24', bg1: '#020c1b', bg2: '#0a2d4a' },
    'Innovator':             { primary: '#F7971E', secondary: '#FFD200', accent: '#e52d27', bg1: '#1a0a00', bg2: '#3d1f00' },
    'Aspiring Entrepreneur': { primary: '#11998E', secondary: '#38EF7D', accent: '#FC5C7D', bg1: '#001a15', bg2: '#003329' },
  };
  const pal = palettes[archetype] || palettes['Explorer'];

  // BACKGROUND
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, pal.bg1);
  bgGrad.addColorStop(1, pal.bg2);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // NOISE OVERLAY
  for (let i = 0; i < 800; i++) {
    const nx = rand() * W, ny = rand() * H, nr = rand() * 1.5 + 0.3;
    ctx.beginPath();
    ctx.arc(nx, ny, nr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.08})`;
    ctx.fill();
  }

  // DRAW THE USER PHOTO FIRST (IN THE CENTER)
  if (userImageBuffer) {
    try {
      const img = await loadImage(userImageBuffer);
      ctx.save();
      const circleRadius = 320;
      const centerX = W / 2;
      const centerY = H / 2 - 40;
      
      // Glow behind photo
      ctx.shadowColor = pal.primary;
      ctx.shadowBlur = 80;
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0; 

      // Border for photo
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius + 8, 0, Math.PI * 2);
      ctx.fillStyle = pal.accent;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius + 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      // Clip and draw image
      ctx.beginPath();
      ctx.arc(centerX, centerY, circleRadius, 0, Math.PI * 2);
      ctx.clip();
      
      const scale = Math.max((circleRadius * 2) / img.width, (circleRadius * 2) / img.height);
      const imgWidth = img.width * scale;
      const imgHeight = img.height * scale;
      const imgX = centerX - imgWidth / 2;
      const imgY = centerY - imgHeight / 2;
      
      ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
      ctx.restore();
      
      // Overlay a slight gradient on the bottom of the photo to blend text
      const photoGrad = ctx.createLinearGradient(0, centerY, 0, centerY + circleRadius + 20);
      photoGrad.addColorStop(0, 'rgba(0,0,0,0)');
      photoGrad.addColorStop(1, pal.bg2 + 'cc');
      ctx.fillStyle = photoGrad;
      ctx.fillRect(0, centerY, W, H / 2);
    } catch (e) {
      console.error('Failed to draw user photo onto canvas', e);
    }
  }

  // YEAR 1 OR SENIOR ART OVERLAYS
  if (yearNum === 1) {
    const orbColors = [pal.primary, pal.secondary, pal.accent];
    [ { x: 180, y: 200, r: 280 }, { x: 860, y: 700, r: 320 }, { x: 540, y: 900, r: 180 } ].forEach((o, i) => {
      const og = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      og.addColorStop(0, orbColors[i % orbColors.length] + '44');
      og.addColorStop(1, 'transparent');
      ctx.fillStyle = og;
      ctx.fillRect(0, 0, W, H);
    });

    ctx.save();
    ctx.font = 'bold 220px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 15;
    ctx.strokeText('FRESHER', W / 2, H / 2 + 180);
    
    const fresherGrad = ctx.createLinearGradient(0, H / 2, 0, H / 2 + 200);
    fresherGrad.addColorStop(0, '#ffffff');
    fresherGrad.addColorStop(0.5, pal.accent);
    fresherGrad.addColorStop(1, pal.primary);
    ctx.fillStyle = fresherGrad;
    ctx.fillText('FRESHER', W / 2, H / 2 + 180);
    ctx.restore();
    
    const starColors = [pal.primary, pal.secondary, pal.accent, '#fff'];
    for (let i = 0; i < 18; i++) {
      const sx = rand() * W, sy = rand() * H, sSize = rand() * 22 + 10;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(rand() * Math.PI * 2);
      drawStar(ctx, 0, 0, 5, sSize, sSize * 0.4);
      ctx.fillStyle = starColors[Math.floor(rand() * starColors.length)] + 'cc';
      ctx.fill(); ctx.restore();
    }
  } else {
    const yearLabels = { 2: 'SOPHOMORE', 3: 'JUNIOR', 4: 'SENIOR' };
    const yearLabel = yearLabels[yearNum] || `YEAR ${yearNum}`;

    ctx.save();
    ctx.font = 'bold 150px "Outfit", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    ctx.strokeStyle = '#000000aa';
    ctx.lineWidth = 12;
    ctx.strokeText(yearLabel, W / 2, H / 2 + 160);

    const ylGrad = ctx.createLinearGradient(0, H / 2, 0, H / 2 + 200);
    ylGrad.addColorStop(0, '#ffffff');
    ylGrad.addColorStop(1, pal.accent);
    ctx.fillStyle = ylGrad;
    ctx.fillText(yearLabel, W / 2, H / 2 + 160);
    ctx.restore();

    for (let t = 0; t < 12; t++) {
      const tx = rand() * W, ty = rand() * H, ts = rand() * 50 + 20;
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(rand() * Math.PI * 2);
      ctx.beginPath(); ctx.moveTo(0, -ts); ctx.lineTo(ts * 0.866, ts * 0.5); ctx.lineTo(-ts * 0.866, ts * 0.5);
      ctx.closePath();
      ctx.strokeStyle = [pal.primary, pal.secondary, pal.accent][Math.floor(rand() * 3)] + 'aa';
      ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
    }
  }

  // ARCHETYPE BADGE
  const archBadgeW = 340, archBadgeH = 58, archBadgeX = W / 2 - archBadgeW / 2, archBadgeY = 48;
  ctx.save();
  roundRect(ctx, archBadgeX, archBadgeY, archBadgeW, archBadgeH, 29);
  ctx.fillStyle = pal.primary + 'cc'; ctx.fill();
  roundRect(ctx, archBadgeX, archBadgeY, archBadgeW, archBadgeH, 29);
  ctx.strokeStyle = pal.accent + 'aa'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 26px "Inter", sans-serif';
  ctx.textAlign = 'center'; ctx.fillStyle = '#ffffff';
  ctx.fillText(`✦ ${archetype.toUpperCase()} ✦`, W / 2, archBadgeY + 37);
  ctx.restore();

  // KEYWORD CHIPS
  const keywords = (answers || []).filter(Boolean).slice(0, 6);
  const chipColors = [pal.primary, pal.secondary, pal.accent, '#a78bfa', '#34d399', '#fb923c'];
  const avoidCenterX = W / 2, avoidCenterY = H / 2, avoidR = 350; 

  const positions = [];
  keywords.forEach((kw, ki) => {
    const cw = Math.min(kw.length * 18 + 48, 300), ch = 50;
    let cx2 = 0, cy2 = 0, placed = false;
    for (let att = 0; att < 120 && !placed; att++) {
      const tx = 60 + rand() * (W - cw - 120);
      const ty = 140 + rand() * (H - ch - 220);
      const distC = Math.sqrt((tx + cw / 2 - avoidCenterX) ** 2 + (ty + ch / 2 - avoidCenterY) ** 2);
      if (distC < avoidR) continue;
      const overlaps = positions.some(p => tx < p.x + p.w + 20 && tx + cw + 20 > p.x && ty < p.y + p.h + 20 && ty + ch + 20 > p.y);
      if (!overlaps) { cx2 = tx; cy2 = ty; placed = true; }
    }
    if (!placed) { cx2 = 80 + (ki % 3) * 300; cy2 = H - 200 - Math.floor(ki / 3) * 70; }
    positions.push({ x: cx2, y: cy2, w: cw, h: ch });

    ctx.save();
    ctx.translate(cx2 + cw / 2, cy2 + ch / 2);
    ctx.rotate((rand() - 0.5) * 0.18);
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, ch / 2);
    ctx.fillStyle = chipColors[ki % chipColors.length] + 'dd'; ctx.fill();
    roundRect(ctx, -cw / 2, -ch / 2, cw, ch, ch / 2);
    ctx.strokeStyle = '#ffffff88'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = 'bold 22px "Inter", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff'; ctx.fillText(kw, 0, 0);
    ctx.restore();
  });

  // BOTTOM NAME BAR
  ctx.save();
  const barH = 90;
  roundRect(ctx, 40, H - barH - 40, W - 80, barH, 18);
  ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fill();
  roundRect(ctx, 40, H - barH - 40, W - 80, barH, 18);
  ctx.strokeStyle = pal.primary + '88'; ctx.lineWidth = 2; ctx.stroke();
  ctx.font = 'bold 38px "Outfit", sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff'; ctx.fillText((name || 'Student').toUpperCase(), 80, H - barH / 2 - 40 + barH / 2);
  ctx.font = 'bold 24px "Inter", sans-serif'; ctx.textAlign = 'right'; ctx.fillStyle = pal.accent + 'ee';
  ctx.fillText(course || 'SRM UNIVERSITY', W - 80, H - barH / 2 - 40 + barH / 2);
  ctx.restore();

  return canvas;
}

// --- CANVAS PREVIEW ENDPOINT ---
app.post('/api/generate-canvas', async (req, res) => {
  try {
    const { name, year, archetype, answers, base64Image } = req.body;
    let userImageBuffer = null;
    if (base64Image) {
      const b64Data = base64Image.replace(/^data:image\/[a-z]+;base64,/, "");
      userImageBuffer = Buffer.from(b64Data, 'base64');
    }
    
    const canvas = await generateBeautifulCanvas({ name, year, archetype }, answers, userImageBuffer);
    res.json({ success: true, canvasDataUrl: canvas.toDataURL('image/png') });
  } catch (err) {
    console.error('[Canvas] Preview error:', err);
    res.status(500).json({ error: 'Generation failed', detail: err.message });
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

    const canvas = await generateBeautifulCanvas(user, user.answers, rawBuffer);
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
