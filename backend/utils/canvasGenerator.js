const { createCanvas, loadImage } = require('@napi-rs/canvas');

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

  // Fallback defaults for dynamic data
  const titleLine1 = (data.titleLine1 || 'PLAYER').toUpperCase();
  const titleLine2 = (data.titleLine2 || 'OF THE').toUpperCase();
  const titleLine3 = (data.titleLine3 || 'TOURNAMENT').toUpperCase();
  
  const matchDetails = data.matchDetails || 'FINALS\nIND : 255/5';
  const statValue = data.statValue || '321';
  const statLabel = data.statLabel || 'RUNS in the\ntournament';
  
  const footerMessage = data.footerMessage || 'Congratulations India on\nSecuring the 3rd T20\nWorld Cup!';
  const eventName = data.eventName || 'T20\nWORLD\nCUP\n2026';
  const sponsorName = data.sponsorName || 'DEAR\nABROAD';

  // 1. BACKGROUND (Stadium Sky Gradient)
  const bgGradient = ctx.createLinearGradient(0, 0, 0, H);
  bgGradient.addColorStop(0, '#32527b');   // Deep sky blue at top
  bgGradient.addColorStop(0.4, '#7694b6'); // Mid slate blue
  bgGradient.addColorStop(0.8, '#d0d8e2'); // Pale grayish-blue
  bgGradient.addColorStop(1, '#e8ebef');   // Off-white bottom
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

  // 3. HEADER TITLES
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;

  // "PLAYER"
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 120px "Inter", "Arial Black", sans-serif';
  ctx.fillText(titleLine1, W / 2, 70);

  // "OF THE" (with red decorative lines)
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.font = '800 32px "Inter", "Arial Black", sans-serif';
  const line2Width = ctx.measureText(titleLine2).width;
  ctx.fillText(titleLine2, W / 2, 210);

  ctx.strokeStyle = '#d32f2f'; // Red lines
  ctx.lineWidth = 4;
  ctx.beginPath(); // Left Line
  ctx.moveTo(W / 2 - line2Width / 2 - 60, 226);
  ctx.lineTo(W / 2 - line2Width / 2 - 20, 226);
  ctx.stroke();
  ctx.beginPath(); // Right Line
  ctx.moveTo(W / 2 + line2Width / 2 + 20, 226);
  ctx.lineTo(W / 2 + line2Width / 2 + 60, 226);
  ctx.stroke();

  // "TOURNAMENT"
  ctx.shadowBlur = 15;
  ctx.shadowOffsetY = 6;
  ctx.font = '900 115px "Inter", "Arial Black", sans-serif';
  ctx.fillText(titleLine3, W / 2, 260);
  
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

  // 5. CENTER IMAGE FRAME
  const frameX = 180;
  const frameY = 400;
  const frameW = 720;
  const frameH = 750;
  const frameR = 30;

  // Draw thick white border/shadow base
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 15;
  roundRect(ctx, frameX, frameY, frameW, frameH, frameR);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Create Inner clipping area for Image
  const innerX = frameX + 15;
  const innerY = frameY + 15;
  const innerW = frameW - 30;
  const innerH = frameH - 30;
  const innerR = frameR - 8;

  ctx.save();
  roundRect(ctx, innerX, innerY, innerW, innerH, innerR);
  ctx.clip();

  // Inner background gradient (Visible if image is a transparent cutout)
  const innerGrad = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerH);
  innerGrad.addColorStop(0, '#7588a4'); 
  innerGrad.addColorStop(1, '#aebbd1');
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

  // 8. BOTTOM RIGHT ASSETS
  // Event Name Block
  ctx.textAlign = 'right';
  ctx.fillStyle = '#5c2a7a'; // Distinct Purple
  ctx.font = '900 38px "Inter", "Arial Black", sans-serif';
  const eventLines = eventName.split('\n');
  eventLines.forEach((line, i) => {
    ctx.fillText(line, W - 70, 1120 + (i * 42));
  });

  // Decorative Crosses "XXXX"
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth = 3.5;
  const startX = W - 220; 
  const crossY = 1300;
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