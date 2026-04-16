import fs from 'fs';

async function downloadIcon() {
  const res = await fetch('https://github.com/fluidicon.png');
  const buffer = await res.arrayBuffer();
  fs.writeFileSync('app-icon.png', Buffer.from(buffer));
  console.log('Icon downloaded successfully.');
}

downloadIcon();
