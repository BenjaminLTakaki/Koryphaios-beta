import { rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const versions = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['3', '4'];
const suffixes = ['', '-wal', '-shm'];

function appDataDirs(): string[] {
  const home = homedir();
  const dirs = [
    join(home, 'Library', 'Application Support', 'emdash'),
    join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'emdash'),
  ];

  if (process.env.APPDATA) {
    dirs.push(join(process.env.APPDATA, 'emdash'));
  }

  return Array.from(new Set(dirs));
}

const files = appDataDirs().flatMap((dir) =>
  versions.flatMap((version) =>
    suffixes.map((suffix) => join(dir, `emdash${version}.db${suffix}`))
  )
);

await Promise.all(files.map((file) => rm(file, { force: true })));

console.log(`Removed emdash database files for v${versions.join(', v')}.`);
