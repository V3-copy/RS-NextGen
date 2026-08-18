const fs = require('fs');
require('dotenv').config();

const KIOSK_PASSWORD = process.env.KIOSK_PASSWORD || 'secret-kiosk-pass';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const API_URL = `${BACKEND_URL}/api/register`;

const firstNames = ['Aarav', 'Vihaan', 'Aditya', 'Rohan', 'Ishaan', 'Diya', 'Ananya', 'Kavya', 'Sanya', 'Riya'];
const lastNames = ['Sharma', 'Verma', 'Iyer', 'Menon', 'Nair', 'Patel', 'Kumar', 'Singh'];
const courses = ['CSE', 'ECE', 'MECH', 'CIVIL', 'IT', 'AI/DS'];
const archetypes = ['Tech Visionary', 'Problem Solver', 'Innovator', 'Aspiring Entrepreneur'];

async function seedData() {
  console.log('Fetching a dummy image...');
  const imgRes = await fetch('https://picsum.photos/400');
  const imgBlob = await imgRes.blob();
  
  console.log(`Starting upload of 10 dummy users to ${API_URL}...`);

  for (let i = 1; i <= 10; i++) {
    const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]} ${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
    const course = courses[Math.floor(Math.random() * courses.length)];
    const archetype = archetypes[Math.floor(Math.random() * archetypes.length)];
    const gender = Math.random() > 0.5 ? 'Male' : 'Female';
    const whatsapp = `+919876543${Math.floor(Math.random() * 900).toString().padStart(3, '0')}`;
    const email = `test${i}@example.com`;

    const formData = new FormData();
    formData.append('name', name);
    formData.append('course', course);
    formData.append('year', '2');
    formData.append('whatsappNumber', whatsapp);
    formData.append('email', email);
    formData.append('gender', gender);
    formData.append('archetype', archetype);
    formData.append('kioskToken', KIOSK_PASSWORD);
    formData.append('kioskId', 'seed-script-123');
    formData.append('image', imgBlob, 'photo.jpg');

    try {
      console.log(`Submitting user ${i}/10: ${name}...`);
      const res = await fetch(API_URL, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        console.log(`  Success! ID: ${data.userId}`);
      } else {
        console.error(`  Failed:`, data);
      }
    } catch (err) {
      console.error(`  Network Error:`, err.message);
    }
    
    // Delay to let the backend process the image and canvas generator smoothly
    await new Promise(r => setTimeout(r, 1500));
  }
  
  console.log('Seeding complete! Check the driftwall in the UI.');
}

seedData();
