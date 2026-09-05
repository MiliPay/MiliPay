const Jimp = require('jimp');

async function cropImage() {
  try {
    const image = await Jimp.read('public/logo-icon-solid.png');
    
    // Autocrop removes borders of the same color
    image.autocrop();
    
    // Save the cropped image
    await image.writeAsync('public/favicon-cropped.png');
    console.log('Successfully cropped the image!');
  } catch (error) {
    console.error('Error cropping image:', error);
  }
}

cropImage();
