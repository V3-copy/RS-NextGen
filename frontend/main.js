
import { io } from 'socket.io-client';
import QRCode from 'qrcode';

// Configuration
const BACKEND_URL = (import.meta.env && typeof import.meta.env.VITE_BACKEND_URL !== 'undefined') 
  ? import.meta.env.VITE_BACKEND_URL 
  : (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
      ? 'http://localhost:3001' 
      : `http://${window.location.hostname}:3001`);
const KIOSK_ID = (import.meta.env && import.meta.env.VITE_KIOSK_ID) 
  ? import.meta.env.VITE_KIOSK_ID 
  : 'web-kiosk-1';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  name: '',
  course: '',
  year: '1',
  whatsappNumber: '',
  archetype: '',
  answers: [],      // collected keyword answers from questions
  base64Image: null
};

// ─── DOM Elements ─────────────────────────────────────────────────────────────
const screens = {
  login:     document.getElementById('screen-login'),
  welcome:   document.getElementById('screen-welcome'),
  form:      document.getElementById('screen-form'),
  archetype: document.getElementById('screen-archetype'),
  questions: document.getElementById('screen-questions'),
  camera:    document.getElementById('screen-camera'),
  success:   document.getElementById('screen-success')
};

// Login
const loginForm      = document.getElementById('login-form');
const inputKioskUser = document.getElementById('kiosk-username');
const inputKioskPass = document.getElementById('kiosk-password');
const loginError     = document.getElementById('login-error');
const btnLogin       = document.getElementById('btn-login');
let kioskToken       = localStorage.getItem('kioskToken');

// Form
const form          = document.getElementById('registration-form');
const inputName     = document.getElementById('name');
const inputCourse   = document.getElementById('course');
const inputYear     = document.getElementById('year');
const inputWhatsApp = document.getElementById('whatsapp');
const btnNext       = document.getElementById('btn-next');

// Archetype
const archetypeCards = document.querySelectorAll('.archetype-card');

// Questions
const questionCard  = document.getElementById('question-card');
const questionEmoji = document.getElementById('question-emoji');
const questionText  = document.getElementById('question-text');
const answerChipsEl = document.getElementById('answer-chips');
const btnSkip       = document.getElementById('btn-skip-question');
const progressDots  = document.querySelectorAll('.dot');

// Camera
const video               = document.getElementById('camera-preview');
const btnCapture          = document.getElementById('btn-capture');
const btnCameraPermission = document.getElementById('btn-camera-permission');
const photoCanvas         = document.getElementById('photo-canvas');

// Success
const statusMsg           = document.getElementById('status-msg');
const successTitle        = document.getElementById('success-title');
const loadingSpinner      = document.getElementById('loading-spinner');
const qrContainer         = document.getElementById('qr-container');
const qrCanvas            = document.getElementById('qrcode-canvas');
const identityArtContainer= document.getElementById('identity-art-container');
const identityArtSpinner  = document.getElementById('identity-art-spinner');
const identityArtImg      = document.getElementById('identity-art-img');
const btnCloseApp         = document.getElementById('btn-close-app');
const kioskTimerCircle    = document.getElementById('kiosk-timer-circle');
const kioskTimerText      = document.getElementById('kiosk-timer-text');
const timerProgress       = document.getElementById('timer-progress');

const scanPromptOverlay   = document.getElementById('scan-prompt-overlay');
const btnPromptYes        = document.getElementById('btn-prompt-yes');
const btnPromptNo         = document.getElementById('btn-prompt-no');
const promptTimerText     = document.getElementById('prompt-timer-text');

// ─── Inactivity ───────────────────────────────────────────────────────────────
let inactivityTimer = null;
const INACTIVITY_TIMEOUT = 45000;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.error('SW:', err));
  });
}

document.body.addEventListener('pointerdown', handleInteraction);
document.body.addEventListener('keydown', handleInteraction);

function handleInteraction() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  const activeScreen = document.querySelector('.screen.active');
  const noTimeoutIds = ['screen-welcome', 'screen-success', 'screen-login'];
  if (activeScreen && !noTimeoutIds.includes(activeScreen.id)) {
    inactivityTimer = setTimeout(resetApp, INACTIVITY_TIMEOUT);
  }
}

// ─── Long Press Reset ────────────────────────────────────────────────────────
let longPressTimer = null;
let pressStartX = 0;
let pressStartY = 0;

document.body.addEventListener('pointerdown', (e) => {
  // Ignore long press if interacting with buttons, inputs, or overlays
  if (e.target.closest('button, input, select, textarea, #scan-prompt-overlay, #ios-pwa-prompt')) return;

  pressStartX = e.clientX;
  pressStartY = e.clientY;
  longPressTimer = setTimeout(() => {
    const activeScreen = document.querySelector('.screen.active');
    if (activeScreen && activeScreen.id === 'screen-success') {
      showScanPrompt();
    } else {
      resetApp();
    }
  }, 2000);
});

document.body.addEventListener('pointerup', () => clearTimeout(longPressTimer));
document.body.addEventListener('pointercancel', () => clearTimeout(longPressTimer));
document.body.addEventListener('pointerleave', () => clearTimeout(longPressTimer));

document.body.addEventListener('pointermove', (e) => {
  if (longPressTimer) {
    const diffX = Math.abs(e.clientX - pressStartX);
    const diffY = Math.abs(e.clientY - pressStartY);
    // Only cancel if the pointer moved significantly (e.g., scrolling or dragging)
    if (diffX > 15 || diffY > 15) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }
});

// Disable context menu (right-click / long-press default behavior) unless on input/textarea
document.addEventListener('contextmenu', (e) => {
  if (!e.target.closest('input, textarea')) {
    e.preventDefault();
  }
});

// ─── Navigation ───────────────────────────────────────────────────────────────
function switchScreen(screenName) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[screenName].classList.add('active');
  handleInteraction();
}

let successTimerInterval = null;

function startSuccessTimer(seconds) {
  if (successTimerInterval) clearInterval(successTimerInterval);
  if (btnCloseApp) btnCloseApp.classList.remove('hidden');
  if (kioskTimerCircle) kioskTimerCircle.classList.remove('hidden');
  
  let remaining = seconds;
  const total = seconds;
  if (kioskTimerText) kioskTimerText.innerText = remaining;
  if (timerProgress) {
    timerProgress.style.strokeDashoffset = '0';
    timerProgress.style.stroke = '#3b82f6';
  }
  
  successTimerInterval = setInterval(() => {
    remaining--;
    if (kioskTimerText) kioskTimerText.innerText = remaining;
    
    if (timerProgress) {
      const percentage = remaining / total;
      const offset = 283 - (percentage * 283);
      timerProgress.style.strokeDashoffset = offset;
      
      if (percentage < 0.25) {
        timerProgress.style.stroke = '#ef4444';
      } else if (percentage < 0.5) {
        timerProgress.style.stroke = '#eab308';
      }
    }

    if (remaining <= 0) {
      clearInterval(successTimerInterval);
      showScanPrompt();
    }
  }, 1000);
}

let promptTimerInterval = null;
function showScanPrompt() {
  if (scanPromptOverlay) {
    scanPromptOverlay.classList.remove('hidden');
    // slight delay for transition
    setTimeout(() => {
      scanPromptOverlay.classList.remove('opacity-0');
      if (scanPromptOverlay.children[0]) {
        scanPromptOverlay.children[0].classList.remove('scale-95');
      }
    }, 10);
    
    let pTime = 10;
    if (promptTimerText) promptTimerText.innerText = pTime;
    promptTimerInterval = setInterval(() => {
      pTime--;
      if (promptTimerText) promptTimerText.innerText = pTime;
      if (pTime <= 0) {
        clearInterval(promptTimerInterval);
        resetApp();
      }
    }, 1000);
  } else {
    resetApp();
  }
}

function hideScanPrompt() {
  if (scanPromptOverlay) {
    scanPromptOverlay.classList.add('opacity-0');
    if (scanPromptOverlay.children[0]) {
      scanPromptOverlay.children[0].classList.add('scale-95');
    }
    setTimeout(() => scanPromptOverlay.classList.add('hidden'), 300);
  }
  if (promptTimerInterval) clearInterval(promptTimerInterval);
}

if (btnPromptYes) btnPromptYes.addEventListener('click', resetApp);
if (btnPromptNo) btnPromptNo.addEventListener('click', () => {
  hideScanPrompt();
  startSuccessTimer(60);
});

if (btnCloseApp) btnCloseApp.addEventListener('click', resetApp);
if (kioskTimerCircle) kioskTimerCircle.addEventListener('click', () => {
  startSuccessTimer(60);
});

function resetApp() {
  if (inactivityTimer) {
    clearTimeout(inactivityTimer);
    inactivityTimer = null;
  }
  state.name           = '';
  state.course         = '';
  state.year           = '1';
  state.whatsappNumber = '';
  state.archetype      = '';
  state.answers        = [];
  state.base64Image    = null;

  if (inputName)     inputName.value = '';
  if (inputCourse)   inputCourse.value = '';
  if (inputYear)     inputYear.value = '1';
  if (inputWhatsApp) inputWhatsApp.value = '';
  validateForm();

  stopCamera();

  // Reset success UI
  successTitle.innerText = 'Processing...';
  statusMsg.innerText    = 'Uploading to server...';
  loadingSpinner.classList.remove('hidden');
  qrContainer.classList.add('hidden');

  // Reset identity art UI
  identityArtContainer.classList.add('hidden');
  identityArtContainer.classList.remove('flex');
  identityArtSpinner.style.display = 'block';
  identityArtImg.classList.add('hidden');
  identityArtImg.src = '';

  if (successTimerInterval) clearInterval(successTimerInterval);
  if (btnCloseApp) btnCloseApp.classList.add('hidden');
  if (kioskTimerCircle) kioskTimerCircle.classList.add('hidden');
  
  hideScanPrompt();

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

// ─── LOGIN ────────────────────────────────────────────────────────────────────
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
        loginError.innerText = 'Network error. Make sure the backend is running.';
        loginError.classList.remove('hidden');
      }
    } finally {
      if (btnLogin) btnLogin.disabled = false;
    }
  });
}

// ─── WELCOME ──────────────────────────────────────────────────────────────────
screens.welcome.addEventListener('click', () => {
  switchScreen('form');
  inputName.focus();
});

// ─── FORM ─────────────────────────────────────────────────────────────────────
function validateForm() {
  const isNameValid   = inputName     ? inputName.value.trim().length > 0 : false;
  const isCourseValid = inputCourse   ? inputCourse.value.trim().length > 0 : false;
  const isPhoneValid  = inputWhatsApp ? inputWhatsApp.value.replace(/\D/g, '').length === 10 : false;
  if (btnNext) btnNext.disabled = !(isNameValid && isCourseValid && isPhoneValid);
}

if (inputName)     inputName.addEventListener('input', validateForm);
if (inputCourse)   inputCourse.addEventListener('change', validateForm);
if (inputYear)     inputYear.addEventListener('change', validateForm);
if (inputWhatsApp) inputWhatsApp.addEventListener('input', validateForm);

if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!btnNext.disabled) {
      state.name           = inputName.value.trim();
      state.course         = inputCourse.value;
      state.year           = inputYear.value;
      state.whatsappNumber = inputWhatsApp.value.replace(/\D/g, '');
      switchScreen('archetype');
    }
  });
}

// ─── ARCHETYPE ────────────────────────────────────────────────────────────────
archetypeCards.forEach(card => {
  card.addEventListener('click', () => {
    state.archetype = card.dataset.type;
    startQuestions();
  });
});

// ─── QUESTIONS ────────────────────────────────────────────────────────────────

// Archetype-aware question banks
const QUESTIONS = {
  'Explorer': [
    {
      emoji: '🌍',
      text: 'What drives you to explore new things?',
      chips: ['Curiosity', 'Adventure', 'Discovery', 'Freedom'],
      colors: ['#6C63FF', '#FF6584', '#43E97B', '#F9CA24']
    },
    {
      emoji: '🚀',
      text: 'Pick your superpower:',
      chips: ['Time Travel', 'Teleport', 'Mind-Read', 'Fly'],
      colors: ['#845ef7', '#f76707', '#2f9e44', '#1971c2']
    },
    {
      emoji: '⚡',
      text: 'Your vibe in one word:',
      chips: ['Bold', 'Curious', 'Restless', 'Wild'],
      colors: ['#e64980', '#f59f00', '#37b24d', '#4c6ef5']
    }
  ],
  'Problem Solver': [
    {
      emoji: '🧠',
      text: 'How do you tackle a tough problem?',
      chips: ['Break it down', 'Research hard', 'Ask for help', 'Sleep on it'],
      colors: ['#00D2FF', '#3A7BD5', '#F9CA24', '#f76707']
    },
    {
      emoji: '💡',
      text: "Your best thinking happens when you're...",
      chips: ['Alone', 'In flow', 'Under pressure', 'With friends'],
      colors: ['#4c6ef5', '#845ef7', '#2f9e44', '#e64980']
    },
    {
      emoji: '🎯',
      text: "What's your secret weapon?",
      chips: ['Logic', 'Pattern', 'Intuition', 'Data'],
      colors: ['#1971c2', '#f59f00', '#37b24d', '#e03131']
    }
  ],
  'Innovator': [
    {
      emoji: '🔥',
      text: 'What fuels your creativity?',
      chips: ['Music', 'Nature', 'Tech', 'Chaos'],
      colors: ['#F7971E', '#FFD200', '#e52d27', '#845ef7']
    },
    {
      emoji: '🛠️',
      text: "You'd rather build:",
      chips: ['An app', 'A startup', 'A robot', 'A movement'],
      colors: ['#4c6ef5', '#f59f00', '#37b24d', '#e64980']
    },
    {
      emoji: '✨',
      text: 'Your energy is best described as:',
      chips: ['Intense', 'Electric', 'Disruptive', 'Creative'],
      colors: ['#f76707', '#1971c2', '#2f9e44', '#d6336c']
    }
  ],
  'Aspiring Entrepreneur': [
    {
      emoji: '💼',
      text: 'Your first business would be:',
      chips: ['SaaS Product', 'Food brand', 'Creative agency', 'Social impact'],
      colors: ['#11998E', '#38EF7D', '#FC5C7D', '#F9CA24']
    },
    {
      emoji: '🏆',
      text: 'What does success look like to you?',
      chips: ['Freedom', 'Impact', 'Wealth', 'Legacy'],
      colors: ['#4c6ef5', '#f59f00', '#e03131', '#845ef7']
    },
    {
      emoji: '⚡',
      text: 'Your hustle anthem is:',
      chips: ['Work smarter', 'Build in public', 'Stay hungry', 'Move fast'],
      colors: ['#37b24d', '#f76707', '#1971c2', '#d6336c']
    }
  ]
};

let currentQuestionIdx = 0;
let questions = [];

function startQuestions() {
  state.answers      = [];
  currentQuestionIdx = 0;
  questions          = QUESTIONS[state.archetype] || QUESTIONS['Explorer'];

  progressDots.forEach((dot, i) => {
    dot.classList.toggle('active', i === 0);
  });

  switchScreen('questions');
  renderQuestion(0);
}

function renderQuestion(idx) {
  if (idx >= questions.length) {
    // All questions done — go straight to camera
    switchScreen('camera');
    initCamera();
    return;
  }

  const q = questions[idx];

  if (idx > 0) {
    questionCard.classList.add('slide-out');
    setTimeout(() => {
      questionCard.classList.remove('slide-out');
      _fillQuestion(q, idx);
    }, 300);
  } else {
    _fillQuestion(q, idx);
  }
}

function _fillQuestion(q, idx) {
  questionEmoji.textContent = q.emoji;
  questionText.textContent  = q.text;

  progressDots.forEach((dot, i) => {
    dot.classList.toggle('active', i === idx);
  });

  answerChipsEl.innerHTML = '';
  q.chips.forEach((chip, ci) => {
    const btn = document.createElement('button');
    btn.className   = 'answer-chip';
    btn.textContent = chip;
    btn.style.setProperty('--chip-color', q.colors[ci % q.colors.length]);
    btn.style.animationDelay = `${0.05 + ci * 0.07}s`;
    btn.addEventListener('click', () => selectAnswer(chip, btn));
    answerChipsEl.appendChild(btn);
  });
}

function selectAnswer(answer, chipEl) {
  chipEl.classList.add('selected');
  state.answers.push(answer);
  setTimeout(() => {
    currentQuestionIdx++;
    renderQuestion(currentQuestionIdx);
  }, 350);
}

if (btnSkip) {
  btnSkip.addEventListener('click', () => {
    currentQuestionIdx++;
    renderQuestion(currentQuestionIdx);
  });
}

// ─── CAMERA ───────────────────────────────────────────────────────────────────
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

if (btnCameraPermission) btnCameraPermission.addEventListener('click', initCamera);

function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
}

if (btnCapture) {
  btnCapture.addEventListener('click', () => {
    if (!stream) return;
    photoCanvas.width  = video.videoWidth;
    photoCanvas.height = video.videoHeight;
    const ctx = photoCanvas.getContext('2d');
    ctx.translate(photoCanvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, photoCanvas.width, photoCanvas.height);
    const dataUrl = photoCanvas.toDataURL('image/jpeg', 0.7);
    state.base64Image = dataUrl;
    stopCamera();
    switchScreen('success');
    submitData();
  });
}

// ─── IDENTITY ART GENERATOR (called after QR is ready) ───────────────────────
async function generateAndShowArt() {
  // Show art container with spinner
  identityArtContainer.classList.remove('hidden');
  identityArtContainer.classList.add('flex');
  identityArtSpinner.style.display = 'block';
  identityArtImg.classList.add('hidden');

  try {
    const res = await fetch(`${BACKEND_URL}/api/generate-canvas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:      state.name,
        year:      state.year,
        archetype: state.archetype,
        answers:   state.answers,
        base64Image: state.base64Image
      })
    });
    const data = await res.json();
    if (data.success) {
      identityArtSpinner.style.display = 'none';
      identityArtImg.src = data.canvasDataUrl;
      identityArtImg.classList.remove('hidden');
    } else {
      // Art failed, keep spinner hidden but show QR code anyway
      identityArtSpinner.style.display = 'none';
    }
  } catch (err) {
    console.error('Art generation error:', err);
    identityArtSpinner.style.display = 'none';
  }
}

// ─── SUBMIT & WEBSOCKETS ──────────────────────────────────────────────────────
async function submitData() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:            state.name,
        course:          state.course,
        year:            state.year,
        whatsappNumber:  state.whatsappNumber,
        archetype:       state.archetype,
        answers:         state.answers,
        kioskId:         KIOSK_ID,
        kioskToken:      kioskToken,
        base64Image:     state.base64Image
      })
    });

    if (response.status === 401) {
      localStorage.removeItem('kioskToken');
      initAuth();
      throw new Error('Unauthorized kiosk');
    }

    if (!response.ok) throw new Error('Network response was not ok');

    const resData = await response.json();

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
        startSuccessTimer(5);
      } else if (data.status === 'error') {
        successTitle.innerText = 'Error';
        loadingSpinner.classList.add('hidden');
        socket.disconnect();
        startSuccessTimer(5);
      }
    });

    socket.on('whatsapp_failed', (data) => {
      statusMsg.innerText    = data.message;
      successTitle.innerText = 'Your Badge is Ready!';
      loadingSpinner.classList.add('hidden');

      // Show QR container first
      qrContainer.classList.remove('hidden');
      qrContainer.classList.add('flex');

      // Generate and show identity art above QR
      generateAndShowArt();

      // Render QR code
      QRCode.toCanvas(qrCanvas, data.downloadUrl, { width: 200, margin: 2 }, function (error) {
        if (error) console.error(error);
      });

      socket.disconnect();
      startSuccessTimer(60);
    });

  } catch (err) {
    console.error('Submission failed:', err);
    statusMsg.innerText    = 'Network error. Please try again.';
    successTitle.innerText = 'Connection Failed';
    loadingSpinner.classList.add('hidden');
    startSuccessTimer(5);
  }
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────
resetApp();

// ─── PWA iOS Install Prompt ───────────────────────────────────────────────────
const isIos = () => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};
const isInStandaloneMode = () => ('standalone' in window.navigator) && window.navigator.standalone;

if (isIos() && !isInStandaloneMode()) {
  const pwaPrompt = document.getElementById('ios-pwa-prompt');
  const closePwaPrompt = document.getElementById('btn-close-pwa-prompt');
  if (pwaPrompt) {
    pwaPrompt.classList.remove('hidden');
    // small delay to allow display block to take effect before animating
    setTimeout(() => pwaPrompt.classList.remove('translate-y-full', 'opacity-0'), 100);
    
    if (closePwaPrompt) {
      closePwaPrompt.addEventListener('click', () => {
        pwaPrompt.classList.add('translate-y-full', 'opacity-0');
        setTimeout(() => pwaPrompt.classList.add('hidden'), 300);
      });
    }
  }
}
