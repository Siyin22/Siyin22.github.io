import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validCount(count) {
  return typeof count === 'string' && /^\d[\d,.\s\u00a0\u202f]*$/.test(count);
}

export async function collect(config, previous, request = fetch, now = () => new Date().toISOString()) {
  const site = new URL(config.siteUrl);
  if (site.protocol !== 'https:' || !/^[a-z0-9-]+\.goatcounter\.com$/.test(site.hostname)) {
    throw new Error('Invalid GoatCounter site');
  }
  const counts = {};
  let successes = 0;
  for (const path of config.paths) {
    if (previous?.siteUrl === site.origin && validCount(previous.counts?.[path]?.count)) {
      counts[path] = previous.counts[path];
    }
    try {
      const response = await request(site.origin + '/counter/' + encodeURIComponent(path) + '.json', {
        signal: AbortSignal.timeout(20000), credentials: 'omit'
      });
      if (!response.ok && response.status !== 404) throw new Error('HTTP ' + response.status);
      const data = await response.json();
      if (!validCount(data.count) || (response.status === 404 && data.count !== '0')) {
        throw new Error('Invalid counter response');
      }
      counts[path] = { count: data.count, updatedAt: now() };
      successes++;
    } catch (error) {
      console.warn('Keeping previous count for ' + path + ': ' + error.message);
    }
  }
  if (!successes) throw new Error('No counters could be refreshed; existing snapshot was not changed');
  return { version: 1, siteUrl: site.origin, counts };
}

export async function main(base = process.cwd()) {
  const config = JSON.parse(await readFile(resolve(base, 'stats/visit-counter-config.json'), 'utf8'));
  const destination = resolve(base, 'stats/visits.json');
  let previous;
  try { previous = JSON.parse(await readFile(destination, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const snapshot = await collect(config, previous);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(snapshot, null, 2) + '\n');
  console.log('Updated ' + Object.keys(snapshot.counts).length + ' public counters');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error); process.exitCode = 1; });
}
