const sharp = require('sharp');
const path = require('path');

const INPUT = 'C:\\Users\\Note\\Desktop\\Mate sonido\\logo-ministerio.png';
const OUTPUT_DIR = path.join(__dirname, '..', 'public');

async function createIcons() {
  const sizes = [192, 512];
  
  for (const size of sizes) {
    // Create circular mask
    const svgCircle = Buffer.from(`<svg width="${size}" height="${size}">
      <circle cx="${size/2}" cy="${size/2}" r="${size/2}" fill="black"/>
    </svg>`);

    const mask = sharp(svgCircle).png();
    
    await sharp(INPUT)
      .resize(size, size, { fit: 'cover' })
      .composite([{
        input: await mask.toBuffer(),
        blend: 'dest-in'
      }])
      .png()
      .toFile(path.join(OUTPUT_DIR, `icon-${size}.png`));
    
    console.log(`Created icon-${size}.png`);
  }

  // Maskable icon (circle with padding)
  const maskSize = 512;
  const circleR = Math.round(maskSize * 0.42);
  
  const maskSvg = Buffer.from(`<svg width="${maskSize}" height="${maskSize}">
    <circle cx="${maskSize/2}" cy="${maskSize/2}" r="${circleR}" fill="black"/>
  </svg>`);
  
  await sharp(INPUT)
    .resize(maskSize, maskSize, { fit: 'cover' })
    .composite([{
      input: await sharp(maskSvg).png().toBuffer(),
      blend: 'dest-in'
    }])
    .png()
    .toFile(path.join(OUTPUT_DIR, 'icon-maskable.png'));
  
  console.log('Created icon-maskable.png');

  // Favicon
  const favSize = 64;
  const favMask = Buffer.from(`<svg width="${favSize}" height="${favSize}">
    <circle cx="${favSize/2}" cy="${favSize/2}" r="${favSize/2}" fill="black"/>
  </svg>`);
  
  await sharp(INPUT)
    .resize(favSize, favSize, { fit: 'cover' })
    .composite([{
      input: await sharp(favMask).png().toBuffer(),
      blend: 'dest-in'
    }])
    .png()
    .toFile(path.join(OUTPUT_DIR, 'favicon.png'));
  
  console.log('Created favicon.png');
}

createIcons().catch(console.error);
