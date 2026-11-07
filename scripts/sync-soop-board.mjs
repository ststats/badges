// 공용 SOOP 모듈 원본(src/soop-board.mjs)을 ststat Edge Function 사본으로 내보낸다.
// 쓰는 법: node scripts/sync-soop-board.mjs ../ststat [--check]
// 사본은 여기서만 갱신하고 사본 쪽에서 직접 고치지 않는다(ststat 테스트가 해시로 확인한다).
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { root } from '../src/config.mjs';

const [target, flag] = process.argv.slice(2);
if (!target) throw new Error('쓰는 법: node scripts/sync-soop-board.mjs <ststat 경로> [--check]');
const source = (await fs.readFile(path.join(root, 'src/soop-board.mjs'), 'utf-8')).replace(/\r\n/g, '\n');
const content = '// ststats/badges/src/soop-board.mjs에서 만든 사본. 직접 고치지 않는다.\n' + source;
const copy = path.join(target, 'supabase/functions/_shared/soop-board.mjs');
const lock = path.join(target, '.github/soop-board.json');
const manifest =
    JSON.stringify(
        {
            source: 'ststats/badges:src/soop-board.mjs',
            sha256: createHash('sha256').update(content).digest('hex'),
        },
        null,
        2
    ) + '\n';

if (flag === '--check') {
    const same = async (file, text) => (await fs.readFile(file, 'utf-8').catch(() => null)) === text;
    if (!(await same(copy, content)) || !(await same(lock, manifest)))
        throw new Error(`사본이 원본과 다릅니다: ${copy}`);
} else {
    await fs.mkdir(path.dirname(copy), { recursive: true });
    await fs.writeFile(copy, content);
    await fs.writeFile(lock, manifest);
}
