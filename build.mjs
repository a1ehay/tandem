import { cp, mkdir, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const frontendDirectory = join(projectRoot, 'frontend');
const outputDirectory = join(projectRoot, 'dist');
const publicFiles = [
  'index.html',
  'styles.css',
  'app.js',
  'favicon.svg',
  'robots.txt',
  '404.html',
  '_headers',
];

await mkdir(outputDirectory, { recursive: true });
await Promise.all(publicFiles.map((file) => copyFile(join(frontendDirectory, file), join(outputDirectory, file))));
await cp(join(frontendDirectory, 'src/client'), join(outputDirectory, 'src/client'), { recursive: true });
console.log(`Готово: статический сайт собран в ${outputDirectory}`);
