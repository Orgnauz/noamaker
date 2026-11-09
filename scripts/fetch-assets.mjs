// Downloads the Higgsfield-generated illustrations into public/assets.
// Run once on your own computer:  npm run fetch-assets
import { writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CDN = 'https://d8j0ntlcm91z4.cloudfront.net/user_3HObPkBWrvMNutBv7aOFDBewL1J/';

const ASSETS = {
  // Hero animation v2 (fixed hands)
  'public/assets/hero/hero-v2.mp4': 'hf_20261109_115734_305fc616-5b0a-4257-ac59-4526eb2007f5.mp4',
  'public/assets/hero/hero-poster-v2.png': 'hf_20261109_115623_fd6bcf83-ea4d-4441-ab15-8ce346cf0a81.png',
  // Story chapters
  'public/assets/story/story-1.png': 'hf_20261109_092354_dac65036-0b51-4078-9273-efed92896d7b.png',
  'public/assets/story/story-2.png': 'hf_20261109_092528_144aaeeb-42b4-462d-bff9-10ca2532c9a4.png',
  'public/assets/story/story-3.png': 'hf_20261109_092354_d8680b99-ca24-408a-9e10-178401699e3c.png',
  'public/assets/story/story-4.png': 'hf_20261109_092355_bc7ace20-0a75-49e1-bdf3-318803eebb89.png',
  // Category illustrations
  'public/assets/categories/kitchen.png':  'hf_20261109_092527_e21fa682-48d7-43c9-93f0-460c1198b90f.png',
  'public/assets/categories/home.png':     'hf_20261109_092353_2d44a9fd-e339-45a4-8f17-af1449220f8c.png',
  'public/assets/categories/bath.png':     'hf_20261109_092354_59e40a9e-10e8-41de-8323-e1998426ea64.png',
  'public/assets/categories/entrance.png': 'hf_20261109_092527_80e12e5b-e039-4f18-9597-729878e2f144.png',
  'public/assets/categories/jewelry.png':  'hf_20261109_092352_836b1836-3a3e-443a-9acc-bcd3c7e99c18.png',
  'public/assets/categories/fidget.png':   'hf_20261109_092353_3df2766f-7e0e-4666-9b7f-c787640c8537.png',
  'public/assets/categories/flexi.png':    'hf_20261109_092353_5c51ce59-6641-4d0b-8cf9-6b8e8dce1284.png',
};

const force = process.argv.includes('--force');
let ok = 0;
for (const [dest, file] of Object.entries(ASSETS)) {
  const out = join(ROOT, dest);
  if (!force) { try { await access(out); console.log('✓ exists ', dest); ok++; continue; } catch {} }
  const res = await fetch(CDN + file);
  if (!res.ok) { console.error('✗ failed ', dest, res.status); continue; }
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, Buffer.from(await res.arrayBuffer()));
  console.log('↓ saved  ', dest); ok++;
}
console.log(`\n${ok}/${Object.keys(ASSETS).length} assets ready.`);
