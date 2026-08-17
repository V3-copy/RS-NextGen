import './style.css';
import { io } from 'socket.io-client';
import QRCode from 'qrcode';

// Configuration
// Using localhost for testing, change to local IP for actual device usage
const BACKEND_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? 'http://localhost:3000' 
  : `http://${window.location.hostname}:3000`;
const KIOSK_ID = 'web-kiosk-1';

// State
const state = {
  name: '',
  course: '',
  year: '1',
  whatsappNumber: '',
  archetype: '',
  base64Image: null
};

// DOM Elements
const screens = {
  login: document.getElementById('screen-login'),
  welcome: document.getElementById('screen-welcome'),
  form: document.getElementById('screen-form'),
  archetype: document.getElementById('screen-archetype'),
  camera: document.getElementById('screen-camera'),
  success: document.getElementById('screen-success')
};

// Login Elements
const loginForm = document.getElementById('login-form');
const inputKioskUser = document.getElementById('kiosk-username');
const inputKioskPass = document.getElementById('kiosk-password');
const loginError = document.getElementById('login-error');
const btnLogin = document.getElementById('btn-login');

let kioskToken = localStorage.getItem('kioskToken');

// Form Elements
const form = document.getElementById('registration-form');
const inputName = document.getElementById('name');
const inputCourse = document.getElementById('course');
const inputYear = document.getElementById('year');
const inputWhatsApp = document.getElementById('whatsapp');
const btnNext = document.getElementById('btn-next');

// Archetype Elements
const archetypeCards = document.querySelectorAll('.archetype-card');

// Camera Elements
const video = document.getElementById('camera-preview');
const btnCapture = document.getElementById('btn-capture');
const btnCameraPermission = document.getElementById('btn-camera-permission');
const photoCanvas = document.getElementById('photo-canvas');

// Success Elements
const statusMsg = document.getElementById('status-msg');
const successTitle = document.getElementById('success-title');
const loadingSpinner = document.getElementById('loading-spinner');
const qrContainer = document.getElementById('qr-container');
const qrCanvas = document.getElementById('qrcode-canvas');

// Inactivity Timer
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 45000; // 45 seconds

// Initialize PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.error('ServiceWorker registration failed: ', err);
    });
  });
}

// Global Interaction Listener to reset timer
document.body.addEventListener('pointerdown', handleInteraction);
document.body.addEventListener('keydown', handleInteraction);

function handleInteraction() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  
  // Don't timeout on welcome, success, or login screens
  const activeScreen = document.querySelector('.screen.active');
  if (activeScreen && activeScreen.id !== 'screen-welcome' && activeScreen.id !== 'screen-success' && activeScreen.id !== 'screen-login') {
    inactivityTimer = setTimeout(resetApp, INACTIVITY_TIMEOUT);
  }
}

// Navigation
function switchScreen(screenName) {
  Object.values(screens).forEach(screen => {
    screen.classList.remove('active');
  });
  screens[screenName].classList.add('active');
  handleInteraction();
}

function resetApp() {
  state.name = '';
  state.course = '';
  state.year = '1';
  state.whatsappNumber = '';
  state.archetype = '';
  state.base64Image = null;
  
  if (inputName) inputName.value = '';
  if (inputCourse) inputCourse.value = '';
  if (inputYear) inputYear.value = '1';
  if (inputWhatsApp) inputWhatsApp.value = '';
  validateForm();
  
  stopCamera();
  
  // Reset success UI
  successTitle.innerText = 'Processing...';
  statusMsg.innerText = 'Uploading to server...';
  loadingSpinner.classList.remove('hidden');
  qrContainer.classList.add('hidden');
  
  initAuth();
}

function initAuth() {
  kioskToken = localStorage.getItem('kioskToken');
  if (kioskToken) {
    switchScreen('welcome');
  } else {
    switchScreen('login');
  }
}

// --- SCREEN: LOGIN ---
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (btnLogin) btnLogin.disabled = true;
    if (loginError) loginError.classList.add('hidden');
    
    try {
      const res = await fetch(`${BACKEND_URL}/api/kiosk/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: inputKioskUser.value, password: inputKioskPass.value })
      });
      
      const data = await res.json();
      if (res.ok && data.success) {
        kioskToken = data.token;
        localStorage.setItem('kioskToken', kioskToken);
        inputKioskPass.value = '';
        switchScreen('welcome');
      } else {
        if (loginError) {
          loginError.innerText = data.error || 'Invalid credentials';
          loginError.classList.remove('hidden');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      if (loginError) {
        loginError.innerText = "Network error. Make sure the backend is running.";
        loginError.classList.remove('hidden');
      }
    } finally {
      if (btnLogin) btnLogin.disabled = false;
    }
  });
}

// --- SCREEN: WELCOME ---
screens.welcome.addEventListener('click', () => {
  switchScreen('form');
  inputName.focus();
});

// --- SCREEN: FORM ---
function validateForm() {
  const isNameValid = inputName ? inputName.value.trim().length > 0 : false;
  const isCourseValid = inputCourse ? inputCourse.value.trim().length > 0 : false;
  const isPhoneValid = inputWhatsApp ? inputWhatsApp.value.replace(/\D/g, '').length === 10 : false;
  
  if (btnNext) btnNext.disabled = !(isNameValid && isCourseValid && isPhoneValid);
}

if (inputName) inputName.addEventListener('input', validateForm);
if (inputCourse) inputCourse.addEventListener('change', validateForm);
if (inputYear) inputYear.addEventListener('change', validateForm);
if (inputWhatsApp) inputWhatsApp.addEventListener('input', validateForm);

if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!btnNext.disabled) {
      state.name = inputName.value.trim();
      state.course = inputCourse.value;
      state.year = inputYear.value;
      state.whatsappNumber = inputWhatsApp.value.replace(/\D/g, '');
      switchScreen('archetype');
    }
  });
}

// --- SCREEN: ARCHETYPE ---
archetypeCards.forEach(card => {
  card.addEventListener('click', () => {
    state.archetype = card.dataset.type;
    switchScreen('camera');
    initCamera();
  });
});

// --- SCREEN: CAMERA ---
let stream = null;

async function initCamera() {
  try {
    btnCameraPermission.classList.add('hidden');
    stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, 
      audio: false 
    });
    video.srcObject = stream;
    btnCapture.classList.remove('hidden');
  } catch (err) {
    console.error('Camera access denied:', err);
    btnCapture.classList.add('hidden');
    btnCameraPermission.classList.remove('hidden');
  }
}

btnCameraPermission.addEventListener('click', initCamera);

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

btnCapture.addEventListener('click', () => {
  if (!stream) return;
  
  photoCanvas.width = video.videoWidth;
  photoCanvas.height = video.videoHeight;
  const ctx = photoCanvas.getContext('2d');
  
  // Mirror the canvas since front camera is usually mirrored
  ctx.translate(photoCanvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, photoCanvas.width, photoCanvas.height);
  
  // Get Base64
  const dataUrl = photoCanvas.toDataURL('image/jpeg', 0.7);
  state.base64Image = dataUrl; // includes 'data:image/jpeg;base64,...'
  
  stopCamera();
  switchScreen('success');
  submitData();
});

// --- SUBMIT & WEBSOCKETS ---
async function submitData() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.name,
        course: state.course,
        year: state.year,
        whatsappNumber: state.whatsappNumber,
        archetype: state.archetype,
        kioskId: KIOSK_ID,
        kioskToken: kioskToken,
        base64Image: state.base64Image
      })
    });
    
    if (response.status === 401) {
      localStorage.removeItem('kioskToken');
      initAuth();
      throw new Error('Unauthorized kiosk');
    }
    
    if (!response.ok) throw new Error('Network response was not ok');
    
    const resData = await response.json();
    
    // Connect to WebSocket using the roomId
    const socket = io(BACKEND_URL);
    
    socket.on('connect', () => {
      socket.emit('join_room', resData.roomId);
    });
    
    socket.on('status', (data) => {
      statusMsg.innerText = data.message;
      if (data.status === 'success') {
        successTitle.innerText = 'Success!';
        loadingSpinner.classList.add('hidden');
        socket.disconnect();
        setTimeout(resetApp, 5000);
      } else if (data.status === 'error') {
        successTitle.innerText = 'Error';
        loadingSpinner.classList.add('hidden');
        socket.disconnect();
        setTimeout(resetApp, 5000);
      }
    });

    socket.on('whatsapp_failed', (data) => {
      statusMsg.innerText = data.message;
      successTitle.innerText = 'Your Badge is Ready!';
      loadingSpinner.classList.add('hidden');
      
      // Render QR Code
      qrContainer.classList.remove('hidden');
      qrContainer.classList.add('flex');
      QRCode.toCanvas(qrCanvas, data.downloadUrl, { width: 200, margin: 2 }, function (error) {
        if (error) console.error(error);
      });
      
      socket.disconnect();
      setTimeout(resetApp, 15000);
    });
    
  } catch (err) {
    console.error('Submission failed:', err);
    statusMsg.innerText = 'Network error. Please try again.';
    successTitle.innerText = 'Connection Failed';
    loadingSpinner.classList.add('hidden');
    setTimeout(resetApp, 5000);
  }
}

// Start with welcome screen
resetApp();
