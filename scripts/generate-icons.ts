import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Generates valid 256x256 PNG and Windows ICO files from FFmpeg so electron-builder
 * has verified binary icon assets in resources/icons/.
 */
function generateIcons() {
  const iconsDir = path.resolve(process.cwd(), 'resources', 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });

  const pngPath = path.join(iconsDir, 'icon.png');
  const icoPath = path.join(iconsDir, 'icon.ico');

  execFileSync('/usr/bin/ffmpeg', [
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=#0284c7:s=256x256:d=1',
    '-frames:v',
    '1',
    pngPath,
  ]);

  execFileSync('/usr/bin/ffmpeg', [
    '-y',
    '-i',
    pngPath,
    icoPath,
  ]);

  console.log('Generated resources/icons/icon.png and resources/icons/icon.ico');
}

generateIcons();
