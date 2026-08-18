const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fs = require('fs');
const path = require('path');
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

/**
 * Generates a dynamic "Player of the Tournament" style sports graphic
 * 
 * @param {Object} data - The dynamic text data
 * @param {Buffer} userImageBuffer - Buffer of the player/user image
 */
async function generateSportsCanvas(data = {}, userImageBuffer = null) {
  // Setup dimensions (Portrait social media ratio)
  const W = 1080;
  const H = 1350;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Fallback defaults for dynamic data mapped to DB user object
  const titleLine1 = data.name || 'Student Name';
  const titleLine2 = '- Welcome to -';
  const titleLine3 = 'R Shivakumar Foundation';
  
  const matchDetails = `ARCHETYPE\n${(data.archetype || 'Explorer').toUpperCase()}`;
  
  // Date replacing the percentage stat
  const today = new Date();
  const statValue = today.getDate().toString().padStart(2, '0'); 
  const monthStr = today.toLocaleString('default', { month: 'short' }).toUpperCase();
  const statLabel = `JOINED\n${monthStr} ${today.getFullYear()}`;
  
  const courseStr = data.course || 'SRM University';
  const footerMessage = `Congratulations on\nstarting your journey at\n${courseStr}!`;
  const eventName = parseInt(data.year) === 1 ? 'SRM\nFRESHERS\nDAY\n2026' : 'SRM\nBACK TO\nCAMPUS\n2026';
  
  const safeAnswers = data.answers || [];
  // Try to use a second answer as sponsor if available, else generic
  let sponsorName = 'SRM\nUNIV';
  if (safeAnswers[1]) {
    const parts = safeAnswers[1].toUpperCase().split(' ');
    sponsorName = parts.length > 1 ? `${parts[0]}\n${parts[1]}` : safeAnswers[1].toUpperCase();
  }

  // 1. BACKGROUND (Gender-based Gradient)
  const userGender = data.gender ? data.gender.toLowerCase() : 'other';
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  
  if (userGender === 'male') {
    // Dark with blue for males
    bgGradient.addColorStop(0, '#020617');
    bgGradient.addColorStop(0.5, '#1e3a8a');
    bgGradient.addColorStop(1, '#0f172a');
  } else if (userGender === 'female') {
    // Pink with dark for females
    bgGradient.addColorStop(0, '#2e1026');
    bgGradient.addColorStop(0.5, '#831843');
    bgGradient.addColorStop(1, '#2e1026');
  } else {
    // Dark + random color accents (Purple/Teal) for others
    bgGradient.addColorStop(0, '#171717');
    bgGradient.addColorStop(0.5, '#4c1d95');
    bgGradient.addColorStop(1, '#0f766e');
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);

  // 2. STADIUM LIGHTS / RAYS EFFECT
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2, -200); // Ray origin 
    ctx.lineTo((i * 300) - 400, H); 
    ctx.lineTo((i * 300) - 200, H); 
    ctx.fill();
  }
  
  // Flash photography dots in background
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.8; 
    const r = Math.random() * 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.6})`;
    ctx.fill();
  }

  // Try to load a logo image from backend/public/logo.png
  let logoImg = null;
  try {
    const logoPath = path.join(__dirname, '../public/logo.png');
    if (fs.existsSync(logoPath)) {
      logoImg = await loadImage(logoPath);
    }
  } catch (e) {
    console.error('Failed to load logo image:', e.message);
  }

  if (logoImg) {
    const logoMaxHeight = 120; // Larger logo
    const logoScale = logoMaxHeight / logoImg.height;
    const logoW = logoImg.width * logoScale;
    const logoH = logoImg.height * logoScale;
    
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.6)'; // Contrast glow
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 5;
    ctx.drawImage(logoImg, 40, 40, logoW, logoH);
    ctx.restore();
  }

  let badgeImg = null;
  try {
    const badgePath = path.join(__dirname, '../public/badge.png');
    if (fs.existsSync(badgePath)) {
      badgeImg = await loadImage(badgePath);
    }
  } catch (e) {
    console.error('Failed to load badge image:', e.message);
  }

  // 3. HEADER TITLES
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 100px "Inter", sans-serif';
  ctx.fillText(titleLine1, W / 2, 110);

  // "- Welcome to -"
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font = '700 45px "Inter", sans-serif';
  ctx.fillText(titleLine2, W / 2, 230);

  // "R Shivakumar Foundation"
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.font = '900 65px "Inter", "Arial Black", sans-serif';
  ctx.fillText(titleLine3, W / 2, 290);
  
  // Reset shadow for remaining elements
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // 4. TOP RIGHT SPONSOR LOGO
  ctx.textAlign = 'right';
  ctx.font = '900 24px "Inter", sans-serif';
  ctx.fillStyle = '#ffffff';
  const sponsorLines = sponsorName.split('\n');
  sponsorLines.forEach((line, i) => {
    ctx.fillText(line, W - 40, 50 + (i * 28));
  });
  
  // Abstract Sponsor Graphic Icon
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(W - 190, 50);
  ctx.lineTo(W - 160, 50);
  ctx.lineTo(W - 175, 75);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(W - 155, 65);
  ctx.lineTo(W - 145, 50);
  ctx.lineTo(W - 135, 95);
  ctx.fill();

  // 5. CENTER IMAGE FRAME (Glassmorphic)
  const frameX = 140;
  const frameY = 400;
  const frameW = 800;
  const frameH = 750;
  const frameR = 40;

  // Draw Glassmorphic border/shadow base
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 15;
  roundRect(ctx, frameX, frameY, frameW, frameH, frameR);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; // Glass fill
  ctx.fill();
  
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)'; // Glass border
  ctx.stroke();
  ctx.restore();

  // Create Inner clipping area for Image
  const innerX = frameX + 2;
  const innerY = frameY + 2;
  const innerW = frameW - 4;
  const innerH = frameH - 4;
  const innerR = frameR - 2;

  ctx.save();
  roundRect(ctx, innerX, innerY, innerW, innerH, innerR);
  ctx.clip();

  // Inner background gradient (Visible if image is a transparent cutout)
  const innerGrad = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
  innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)'); 
  innerGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.fillStyle = innerGrad;
  ctx.fillRect(innerX, innerY, innerW, innerH);

  // Draw the actual user image centered (Object-fit: cover logic)
  if (userImageBuffer) {
    try {
      const img = await loadImage(userImageBuffer);
      const scale = Math.max(innerW / img.width, innerH / img.height);
      const imgW = img.width * scale;
      const imgH = img.height * scale;
      const imgX = innerX + (innerW - imgW) / 2;
      const imgY = innerY + (innerH - imgH) / 2;
      ctx.drawImage(img, imgX, imgY, imgW, imgH);
    } catch (e) {
      console.error('Failed to draw user photo onto canvas', e);
    }
  }
  ctx.restore(); // Exit clip region so text draws clearly on top

  // Draw Badge overlapping the bottom right of the frame
  if (badgeImg) {
    const badgeScale = 320 / badgeImg.width; // Larger badge
    const badgeW = badgeImg.width * badgeScale;
    const badgeH = badgeImg.height * badgeScale;
    const badgeX = innerX + innerW - badgeW / 2; // overlapping right edge
    const badgeY = innerY + innerH - badgeH / 2 - 20; // overlapping bottom edge
    
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 25;
    ctx.shadowOffsetY = 10;
    ctx.drawImage(badgeImg, badgeX, badgeY, badgeW, badgeH);
    ctx.restore();
  }

  // 6. INNER FRAME TEXT & STATS (Drawn over the image)
  // Text Shadow to ensure legibility over any photo
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = '#ffffff';

  // Left Side: Match Details
  ctx.textAlign = 'left';
  ctx.font = '800 32px "Inter", "Arial Black", sans-serif';
  const matchLines = matchDetails.split('\n');
  matchLines.forEach((line, i) => {
    ctx.fillText(line, innerX + 30, innerY + 30 + (i * 38));
  });

  // Right Side: Big Stat Value
  ctx.textAlign = 'right';
  ctx.font = '900 120px "Inter", "Arial Black", sans-serif';
  ctx.fillText(statValue, innerX + innerW - 30, innerY + 15);

  // Right Side: Stat Label
  ctx.font = '800 24px "Inter", "Arial Black", sans-serif';
  const statLabelLines = statLabel.split('\n');
  statLabelLines.forEach((line, i) => {
    ctx.fillText(line, innerX + innerW - 30, innerY + 135 + (i * 26));
  });
  
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0; // Turn off shadows for bottom elements

  // 7. BOTTOM LEFT ASSETS
  // Decorative lines "/////"
  ctx.fillStyle = '#111111';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(80 + i * 22, 1120);
    ctx.lineTo(95 + i * 22, 1120);
    ctx.lineTo(85 + i * 22, 1150);
    ctx.lineTo(70 + i * 22, 1150);
    ctx.fill();
  }

  // Footer Message
  ctx.textAlign = 'left';
  ctx.font = '800 30px "Inter", sans-serif';
  const footerLines = footerMessage.split('\n');
  
  // Left colored vertical bar
  ctx.fillStyle = '#4c1559'; // Deep purple/violet
  ctx.fillRect(70, 1180, 8, footerLines.length * 36);

  ctx.fillStyle = '#181818'; // Dark text
  footerLines.forEach((line, i) => {
    ctx.fillText(line, 95, 1183 + (i * 36));
  });

  // 8. Event Name Block (Bottom Right, below the badge)
  ctx.textAlign = 'right';
  ctx.fillStyle = '#5c2a7a'; // Distinct Purple
  ctx.font = '900 28px "Inter", "Arial Black", sans-serif';
  // Format as a single line to save vertical space below the badge
  const formattedEvent = eventName.replace(/\n/g, ' '); 
  ctx.fillText(formattedEvent, W - 70, 1280);

  // Decorative Crosses "XXXX" (Below the text)
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth = 3.5;
  const startX = W - 220; 
  const crossY = 1315;
  for (let i = 0; i < 4; i++) {
    const cx = startX + (i * 38);
    ctx.beginPath();
    ctx.moveTo(cx, crossY);
    ctx.lineTo(cx + 18, crossY + 18);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx + 18, crossY);
    ctx.lineTo(cx, crossY + 18);
    ctx.stroke();
  }

  return canvas;
}

module.exports = { generateSportsCanvas };