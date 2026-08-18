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
  let sponsorName = 'SRM\nUNIV';
  if (safeAnswers[1]) {
    const parts = safeAnswers[1].toUpperCase().split(' ');
    sponsorName = parts.length > 1 ? `${parts[0]}\n${parts[1]}` : safeAnswers[1].toUpperCase();
  }

  // 1. BACKGROUND (Modern Realistic Spotlight Grading)
  const userGender = data.gender ? data.gender.toLowerCase() : 'other';
  
  // Using a radial gradient from the top-center to simulate a real stadium spotlight fading into shadow
  const bgGradient = ctx.createRadialGradient(W / 2, -100, 0, W / 2, H / 3, Math.max(W, H));
  
  if (userGender === 'male') {
    // Rich deep sapphire/navy spotlight
    bgGradient.addColorStop(0, '#1e40af'); // bright spotlight source
    bgGradient.addColorStop(0.4, '#0f172a'); // mid shadow
    bgGradient.addColorStop(1, '#020617'); // pure dark edges
  } else if (userGender === 'female') {
    // Rich crimson/magenta spotlight
    bgGradient.addColorStop(0, '#9d174d'); 
    bgGradient.addColorStop(0.4, '#4a044e'); 
    bgGradient.addColorStop(1, '#170213'); 
  } else {
    // Vibrant violet/teal spotlight mix
    bgGradient.addColorStop(0, '#6d28d9'); 
    bgGradient.addColorStop(0.5, '#0f766e'); 
    bgGradient.addColorStop(1, '#09090b'); 
  }
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, W, H);

  // 2. STADIUM LIGHTS / RAYS EFFECT (Volumetric lighting)
  // Rays now fade realistically into the background instead of being solid color blocks
  const rayGradient = ctx.createLinearGradient(W / 2, -200, W / 2, H * 0.8);
  rayGradient.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
  rayGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = rayGradient;
  
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.moveTo(W / 2, -200); // Ray origin 
    ctx.lineTo((i * 300) - 400, H); 
    ctx.lineTo((i * 300) - 200, H); 
    ctx.fill();
  }
  
  // Flash photography dots (Modern Bokeh effect)
  for (let i = 0; i < 200; i++) {
    const x = Math.random() * W;
    const y = Math.random() * H * 0.8; 
    const r = Math.random() * 3.5 + 0.5; // Slightly varied radius for depth
    const alpha = Math.random() * 0.6 + 0.1;

    // Radial gradient creates a glowing, out-of-focus camera lens effect
    const bokehGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
    bokehGrad.addColorStop(0, `rgba(255, 255, 255, ${alpha})`);
    bokehGrad.addColorStop(0.4, `rgba(255, 255, 255, ${alpha * 0.5})`);
    bokehGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = bokehGrad;
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
    const logoMaxHeight = 120; 
    const logoScale = logoMaxHeight / logoImg.height;
    const logoW = logoImg.width * logoScale;
    const logoH = logoImg.height * logoScale;
    
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 255, 0.4)'; // Slightly softer, more realistic glow
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
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)'; // Deepened shadow to match rich background
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;

  // Name (Dynamic Font Size)
  ctx.fillStyle = '#ffffff';
  let nameFontSize = 100;
  ctx.font = `800 ${nameFontSize}px "Inter", sans-serif`;
  // Restrict width to avoid overlapping top-left logo and top-right text
  while (ctx.measureText(titleLine1).width > (W - 450) && nameFontSize > 30) {
    nameFontSize -= 5;
    ctx.font = `800 ${nameFontSize}px "Inter", sans-serif`;
  }
  ctx.save();
  ctx.textBaseline = 'bottom';
  ctx.fillText(titleLine1, W / 2, 210);
  ctx.restore();

  // "- Welcome to -"
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font = '700 45px "Inter", sans-serif';
  ctx.fillText(titleLine2, W / 2, 230);

  // "R Shivakumar Foundation"
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 5;
  ctx.font = '900 65px "Inter", "Arial Black", sans-serif';
  ctx.fillText(titleLine3, W / 2, 290);
  
  // Reset shadow for remaining elements
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Top Right: Keywords from Answers
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.font = '800 24px "Inter", sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
  if (safeAnswers && safeAnswers.length > 0) {
    const keywords = safeAnswers.map(ans => ans.split(' ')[0].toUpperCase()).join(' • ');
    ctx.fillText(keywords, W - 40, 40);
  }
  ctx.restore();

  // 5. CENTER IMAGE FRAME (Premium Glassmorphic Edge)
  const frameX = 140;
  const frameY = 400;
  const frameW = 800;
  const frameH = 750;
  const frameR = 40;

  // Draw Glassmorphic border/shadow base
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)'; // Darker ambient occlusion shadow
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 20;
  roundRect(ctx, frameX, frameY, frameW, frameH, frameR);
  
  // Subtly graduated glass fill to simulate volumetric depth
  const glassFillGrad = ctx.createLinearGradient(frameX, frameY, frameX, frameY + frameH);
  glassFillGrad.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
  glassFillGrad.addColorStop(1, 'rgba(255, 255, 255, 0.05)');
  ctx.fillStyle = glassFillGrad;
  ctx.fill();
  
  // Premium diagonal specular highlight stroke
  ctx.lineWidth = 4;
  const glassStrokeGrad = ctx.createLinearGradient(frameX, frameY, frameX + frameW, frameY + frameH);
  glassStrokeGrad.addColorStop(0, 'rgba(255, 255, 255, 0.6)'); // Top left light catch
  glassStrokeGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.05)'); // Middle transparent
  glassStrokeGrad.addColorStop(1, 'rgba(255, 255, 255, 0.3)'); // Bottom right light reflection
  ctx.strokeStyle = glassStrokeGrad; 
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
  innerGrad.addColorStop(0, 'rgba(255, 255, 255, 0.25)'); 
  innerGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
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
    const badgeScale = 320 / badgeImg.width; 
    const badgeW = badgeImg.width * badgeScale;
    const badgeH = badgeImg.height * badgeScale;
    const badgeX = innerX + innerW - badgeW / 2; 
    const badgeY = innerY + innerH - badgeH / 2 - 20; 
    
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'; // Stronger drop shadow for pop
    ctx.shadowBlur = 30;
    ctx.shadowOffsetY = 15;
    ctx.drawImage(badgeImg, badgeX, badgeY, badgeW, badgeH);
    ctx.restore();
  }

  // 6. INNER FRAME TEXT & STATS (Drawn over the image)
  // Text Shadow to ensure legibility over any photo
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)'; // Slightly stronger shadow over varied pictures
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = '#ffffff';

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

  // Footer Message
  ctx.textAlign = 'left';
  ctx.font = '800 30px "Inter", sans-serif';
  const footerLines = footerMessage.split('\n');
  
  // Left colored vertical bar
  ctx.fillStyle = '#4c1559'; // Deep purple/violet
  ctx.fillRect(70, 1180, 8, footerLines.length * 36);

  ctx.fillStyle = '#ffffff'; // White text
  footerLines.forEach((line, i) => {
    ctx.fillText(line, 95, 1183 + (i * 36));
  });

  // 8. ARCHETYPE (Bottom Right, below the badge)
  ctx.textAlign = 'center';
  ctx.font = '900 36px "Inter", "Arial Black", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
  ctx.shadowBlur = 20;
  ctx.shadowOffsetY = 0;
  ctx.fillText((data.archetype || 'Explorer').toUpperCase(), 940, 1280);

  return canvas;
}

module.exports = { generateSportsCanvas };