import assert from 'node:assert/strict';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {resolve, sep} from 'node:path';

const read = path => readFileSync(path, 'utf8');
const config = read('_config.yml');
const theme = /^theme:\s*([^\s#]+)/m.exec(config)?.[1];
assert(theme, 'A theme must be configured');
assert(readdirSync('.').includes(`_config.${theme}.yml`),
  `The theme configuration must be named exactly _config.${theme}.yml (Linux is case-sensitive)`);

const siteUrl = new URL(/^url:\s*(\S+)/m.exec(config)[1]);
assert.equal(read('public/CNAME').trim(), siteUrl.hostname, 'Custom domain must be preserved');
assert(!existsSync('public/.github'), 'Deployment scripts must stay outside the published website');

const counters = JSON.parse(read('public/stats/visit-counter-config.json'));
assert(counters.paths.includes('TOTAL'), 'The total visit counter must be generated');
assert(counters.paths.includes('/integrate-bilibili-translation-model-daily-tools-index-translate-bridge/'),
  'The existing Index Translate Bridge URL must be preserved');
const home = read('public/index.html');
assert(home.includes('data-snapshot="/stats/visits.json"'), 'The homepage must load the counter snapshot');

const publicDir = resolve('public') + sep;
for (const route of counters.paths.filter(path => path !== 'TOTAL')) {
  const filename = resolve('public', decodeURIComponent(route).replace(/^\/+/, ''), 'index.html');
  assert(filename.startsWith(publicDir), 'Article paths must stay inside public');
  const html = read(filename);
  assert(html.includes('data-mapping="pathname"'), `Comment path mapping is missing: ${route}`);
  assert(html.includes('data-repo="Siyin22/blog-comments"'), `The existing comment repository is missing: ${route}`);
  assert(home.includes(route), `The homepage must link to the article: ${route}`);
}
console.log(`Verified theme configuration, custom domain, original article URL, comments and ${counters.paths.length - 1} article pages`);
