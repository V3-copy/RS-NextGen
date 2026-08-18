const { Worker } = require('bullmq');
const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_DB || 'mongodb://127.0.0.1:27017/kiosk';
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_DB = process.env.REDIS_DB ? parseInt(process.env.REDIS_DB) : 0;

// Connect to MongoDB with Active Connection Pool
const mongoOptions = {
  maxPoolSize: process.env.MONGO_MAX_POOL_SIZE ? parseInt(process.env.MONGO_MAX_POOL_SIZE) : 50,
  minPoolSize: process.env.MONGO_MIN_POOL_SIZE ? parseInt(process.env.MONGO_MIN_POOL_SIZE) : 5,
};

mongoose.connect(MONGO_URI, mongoOptions)
  .then(() => console.log('[Worker] MongoDB connected'))
  .catch(err => console.error('[Worker] MongoDB connection error:', err));

const connection = { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD, db: REDIS_DB };

const worker = new Worker('imageProcessing', async (job) => {
  const { userId, whatsappNumber, roomId } = job.data;
  
  console.log(`[Worker] Processing job for user ${userId}`);
  
  try {
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
    const downloadUrl = `${backendUrl}/api/download/${userId}`;
    
    // Step 2: WhatsApp Sending
    await job.updateProgress({ roomId, event: 'status', data: { status: 'sending_whatsapp', message: 'Dispatching via WhatsApp...' }});
    
    // MOCK: Simulate WhatsApp API Call
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    const whatsappApiConfigured = false; // MOCK FLAG
    
    if (whatsappApiConfigured) {
      console.log(`[WhatsApp] Sent image link to ${whatsappNumber}`);
      await job.updateProgress({ roomId, event: 'status', data: { status: 'success', message: 'Sent! Check your WhatsApp.' }});
      return { success: true };
    } else {
      console.log(`[WhatsApp] API not configured. Triggering QR Fallback.`);
      await job.updateProgress({ roomId, event: 'whatsapp_failed', data: { 
        downloadUrl: downloadUrl,
        message: 'Scan the QR code to download your badge!'
      }});
      return { success: false, fallback: true };
    }
    
  } catch (err) {
    console.error(`[Worker] Job failed:`, err);
    await job.updateProgress({ roomId, event: 'status', data: { status: 'error', message: 'Something went wrong.' }});
    throw err;
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job.id} failed with err: ${err.message}`);
});

console.log('[Worker] Started and listening for jobs...');
