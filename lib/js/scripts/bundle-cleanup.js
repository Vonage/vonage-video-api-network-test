// Sample applications require types to be in the same directory as the source code
// By default tsc will not do that, and also recreate the folder structure of the project
// This script is for moving those files into the root folder of the bundle

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const filename = fileURLToPath(import.meta.url);
const dirName = path.dirname(filename);

const projectName = process.argv[2];

// CONFIGURATION - Adjust the number of ../ to reach your project root
const DIST_ROOT = path.resolve(dirName, `../../../dist/${projectName}`);
const SOURCE_DIR = path.join(DIST_ROOT, `${projectName}/src`);

function moveRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });

  const items = fs.readdirSync(src);
  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);

    if (fs.statSync(srcPath).isDirectory()) {
      moveRecursive(srcPath, destPath);
    } else {
      fs.renameSync(srcPath, destPath);
    }
  }
}

const run = () => {
  console.log('Finalizing build: Flattening type directories...');
  setTimeout(() => {
    if (fs.existsSync(SOURCE_DIR)) {
      try {
        moveRecursive(SOURCE_DIR, DIST_ROOT);

        // Cleanup
        fs.rmSync(path.join(DIST_ROOT, projectName), { recursive: true, force: true });
        const sharedPath = path.join(DIST_ROOT, 'shared');
        if (fs.existsSync(sharedPath)) {
          fs.rmSync(sharedPath, { recursive: true, force: true });
        }

        console.log('Type directories flattened.');
      } catch (err) {
        console.error('Error during flattening:', err.message);
      }
    } else {
      console.log('Nothing to flatten. Is the path correct?');
      console.log('Expected path:', SOURCE_DIR);
    }
  }, 200);
};

run();
