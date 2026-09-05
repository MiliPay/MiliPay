const sharp = require('sharp');

async function cropFavicon() {
  try {
    await sharp('public/logo-icon-solid.png')
      .trim()
      .toFile('public/favicon-cropped.png');
    console.log('Successfully cropped the favicon using sharp!');
  } catch (error) {
    console.error('Error cropping image:', error);
  }
}

cropFavicon();
