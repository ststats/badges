// 저장소 루트와 config.json(한 번만 읽는다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const config = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf-8'));
