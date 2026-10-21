'use strict';

const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const {execFileSync} = require('node:child_process');
const {createManager} = require('./server.cjs');
const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']}).trim();

async function fixture(t, {remote = false, failingBuild = false, failingOpen = false} = {}) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'siyin-manager-'));
  const root = path.join(parent, 'blog');
  await fs.mkdir(path.join(root, 'source/_posts'), {recursive: true});
  await fs.mkdir(path.join(root, 'public'), {recursive: true});
  await fs.writeFile(path.join(root, '.gitignore'), '.blog-manager/\npublic/\nnode_modules/\ndb.json\n.obsidian/\n.trash/\n');
  await fs.writeFile(path.join(root, 'source/_posts/article.md'), '---\ntitle: 原标题\ndate: 2026-10-18 16:17:17\nupdated: 2026-10-20 19:18:17\npermalink: /existing-article/\ncustom: keep-me\ntags: [AI]\ncategories: [技术]\n---\n原内容\n');
  await fs.writeFile(path.join(root, 'public/index.html'), '<h1>真实预览</h1>');
  git(root, 'init', '-b', 'main');
  git(root, 'config', 'user.name', 'Manager Test'); git(root, 'config', 'user.email', 'manager-test@example.invalid');
  git(root, 'add', '.'); git(root, 'commit', '-m', 'Initial fixture');
  if (remote) {
    const bare = path.join(parent, 'remote.git');
    execFileSync('git', ['init', '--bare', bare], {stdio: 'ignore', windowsHide: true});
    git(root, 'remote', 'add', 'origin', bare); git(root, 'push', '-u', 'origin', 'main');
  }
  await fs.mkdir(path.join(root, 'node_modules/hexo/bin'), {recursive: true});
  await fs.writeFile(path.join(root, 'node_modules/hexo/bin/hexo'), failingBuild ? 'process.exit(1)' : `const fs = require('node:fs');
fs.mkdirSync('.blog-manager', {recursive: true});
fs.appendFileSync('.blog-manager/commands.txt', process.argv[2] + '\\n');
if (process.argv[2] === 'clean') {
  fs.rmSync('public', {recursive: true, force: true}); fs.rmSync('db.json', {force: true});
} else if (process.argv[2] === 'generate') {
  fs.mkdirSync('public', {recursive: true}); fs.writeFileSync('public/index.html', '<h1>真实预览</h1>');
  fs.writeFileSync('db.json', '{}');
}
console.log('fixture ' + process.argv[2]);`);
  await fs.mkdir(path.join(root, '.github/scripts'), {recursive: true});
  await fs.writeFile(path.join(root, '.github/scripts/check-site.mjs'), 'console.log("fixture check")');
  const launches = [];
  const manager = createManager(root, {openExternal: async (target, options) => {
    launches.push({target, options, log: (await manager.state()).job?.log});
    if (failingOpen) throw new Error('Desktop launcher unavailable');
  }});
  manager.setOrigin('http://127.0.0.1:4317');
  t.after(async () => { await new Promise(resolve => manager.server.close(resolve)); await fs.rm(parent, {recursive: true, force: true}); });
  return {parent, root, manager, launches};
}

async function waitForJob(manager, type, input = {}) {
  manager.startJob(type, input);
  for (let attempt = 0; attempt < 300; attempt++) {
    const {job} = await manager.state();
    if (job.status !== 'running') return job;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Fixture job did not finish');
}

test('HTTP mutations require the local host, same origin and private token', async t => {
  const {root, manager, launches} = await fixture(t);
  await new Promise(resolve => manager.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${manager.server.address().port}`;
  manager.setOrigin(origin);
  const html = await (await fetch(origin + '/manage/')).text();
  const token = /name="blog-token" content="([a-f0-9]+)"/.exec(html)[1];
  assert.equal((await fetch(origin + '/api/state')).status, 403);
  assert.equal((await fetch(origin + '/api/state', {headers: {'X-Blog-Token': token, Origin: 'https://other.example'}})).status, 403);
  assert.equal((await fetch(origin + '/api/state', {headers: {'X-Blog-Token': token}})).status, 200);
  const preview = await fetch(origin + '/');
  assert.equal(preview.status, 200); assert((await preview.text()).includes('真实预览'));
  assert.equal((await fetch(origin + '/.git/config')).status, 404);
  const folder = await fetch(origin + '/api/folder', {method: 'POST', headers: {'X-Blog-Token': token, 'Content-Type': 'application/json'}, body: '{}'});
  assert.equal(folder.status, 200);
  assert.equal(launches[0].target, path.join(root, 'source/_posts'));
  assert.deepEqual(launches[0].options, {directory: true});
  const wrongHostStatus = await new Promise((resolve, reject) => {
    require('node:http').get(origin + '/api/state', {headers: {'X-Blog-Token': token, Host: 'other.example'}}, response => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(wrongHostStatus, 403);
  for (const route of ['save', 'create', 'image']) {
    assert.equal((await fetch(origin + '/api/' + route, {method: 'POST', headers: {'X-Blog-Token': token, 'Content-Type': 'application/json'}, body: '{}'})).status, 404);
  }
});

test('clean removes generated files, while preview rebuilds without touching articles or commits', async t => {
  const {root, manager, launches} = await fixture(t);
  const article = await fs.readFile(path.join(root, 'source/_posts/article.md'), 'utf8');
  const before = git(root, 'rev-parse', 'HEAD');
  await fs.writeFile(path.join(root, 'db.json'), '{}');
  assert.equal((await manager.state()).cacheExists, true);
  const cleaned = await waitForJob(manager, 'clean');
  assert.equal(cleaned.status, 'success', cleaned.message);
  assert.equal((await manager.state()).cacheExists, false);
  const preview = await waitForJob(manager, 'preview');
  assert.equal(preview.status, 'success', preview.message);
  assert.equal(preview.result.previewUrl, '/');
  assert.equal(launches.length, 1);
  assert.equal(launches[0].target, 'http://127.0.0.1:4317/');
  assert.match(launches[0].log, /fixture check/);
  // The explicit clean runs once; preview must reuse the cache on subsequent runs.
  assert.equal(await fs.readFile(path.join(root, '.blog-manager/commands.txt'), 'utf8'), 'clean\ngenerate\n');
  assert.match(await fs.readFile(path.join(root, 'public/index.html'), 'utf8'), /真实预览/);
  assert.equal(await fs.readFile(path.join(root, 'source/_posts/article.md'), 'utf8'), article);
  assert.equal(git(root, 'rev-parse', 'HEAD'), before);
  assert.equal(git(root, 'status', '--porcelain', '--', 'source'), '');
});

test('a failed preview build never opens a browser', async t => {
  const {manager, launches} = await fixture(t, {failingBuild: true});
  const job = await waitForJob(manager, 'preview');
  assert.equal(job.status, 'failed');
  assert.equal(launches.length, 0);
});

test('a desktop launch failure leaves a working preview and reports a fallback', async t => {
  const {root, manager} = await fixture(t, {failingOpen: true});
  const job = await waitForJob(manager, 'preview');
  assert.equal(job.status, 'success');
  assert.match(job.result.message, /自动打开失败/);
  assert.equal(job.result.previewUrl, '/');
  await fs.access(path.join(root, 'public/index.html'));
  await new Promise(resolve => manager.server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${manager.server.address().port}`;
  manager.setOrigin(origin);
  const html = await (await fetch(origin + '/manage/')).text();
  const token = /name="blog-token" content="([a-f0-9]+)"/.exec(html)[1];
  const folder = await fetch(origin + '/api/folder', {method: 'POST', headers: {'X-Blog-Token': token, 'Content-Type': 'application/json'}, body: '{}'});
  assert.equal(folder.status, 500);
  assert.match((await folder.json()).error, /Desktop launcher unavailable/);
});

test('a running task blocks a second task', async t => {
  const {manager} = await fixture(t);
  const running = manager.startJob('build', {});
  assert.equal(running.status, 'running');
  assert.throws(() => manager.startJob('clean', {}), /当前操作/);
  while ((await manager.state()).job.status === 'running') await new Promise(resolve => setTimeout(resolve, 25));
});

test('new articles use the real Hexo scaffold and cannot overwrite existing files', async t => {
  const {root, manager} = await fixture(t);
  // Use the project's installed Hexo in an isolated blog, so user articles stay untouched.
  await fs.rm(path.join(root, 'node_modules'), {recursive: true, force: true});
  await fs.symlink(path.resolve(__dirname, '../../node_modules'), path.join(root, 'node_modules'), 'junction');
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({hexo: {version: '7.3.0'}}));
  await fs.copyFile(path.resolve(__dirname, '../../_config.yml'), path.join(root, '_config.yml'));
  await fs.mkdir(path.join(root, 'scaffolds'));
  await fs.copyFile(path.resolve(__dirname, '../../scaffolds/post.md'), path.join(root, 'scaffolds/post.md'));
  const created = await waitForJob(manager, 'new', {title: '--测试 / 新文章: 一'});
  assert.equal(created.status, 'success', created.message + '\n' + created.log);
  assert.equal(created.result.filename, '--测试 - 新文章- 一.md');
  const filename = path.join(root, 'source/_posts', created.result.filename);
  const content = await fs.readFile(filename, 'utf8');
  assert.match(content, /title:.*--测试 \/ 新文章: 一/);
  assert.match(content, /date: \d{4}-\d{2}-\d{2}/);
  assert.match(content, /updated: \d{4}-\d{2}-\d{2}/);
  const duplicate = await waitForJob(manager, 'new', {title: '--测试 / 新文章: 一'});
  assert.equal(duplicate.status, 'failed');
  assert.match(duplicate.message, /同名/);
  assert.equal(await fs.readFile(filename, 'utf8'), content);
  const empty = await waitForJob(manager, 'new', {title: '  '});
  assert.equal(empty.status, 'failed');
  const dotted = await waitForJob(manager, 'new', {title: '.版本 1.0'});
  assert.equal(dotted.status, 'success', dotted.message);
  assert.equal(dotted.result.filename, '版本 1.0.md');
  await fs.access(path.join(root, 'source/_posts', dotted.result.filename));
});

test('publish rebases over remote stats and pushes source without generated files', async t => {
  const {parent, root, manager} = await fixture(t, {remote: true});
  const other = path.join(parent, 'other');
  execFileSync('git', ['clone', '-b', 'main', path.join(parent, 'remote.git'), other], {stdio: 'ignore', windowsHide: true});
  git(other, 'config', 'user.name', 'Counter Test'); git(other, 'config', 'user.email', 'counter@example.invalid');
  await fs.mkdir(path.join(other, 'source/stats'), {recursive: true});
  await fs.writeFile(path.join(other, 'source/stats/visits.json'), '{"count":"12"}');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'Remote counters'); git(other, 'push');
  await fs.appendFile(path.join(root, 'source/_posts/article.md'), '本地新内容');
  const job = await waitForJob(manager, 'publish');
  assert.equal(job.status, 'success', job.message + '\n' + job.log);
  assert.equal(git(root, 'rev-parse', 'HEAD'), git(parent, '--git-dir', path.join(parent, 'remote.git'), 'rev-parse', 'refs/heads/main'));
  assert.equal(await fs.readFile(path.join(root, 'source/stats/visits.json'), 'utf8'), '{"count":"12"}');
  assert(!git(root, 'ls-files').includes('public/')); assert.equal(git(root, 'status', '--porcelain'), '');
});

test('build failures do not create a commit or push local edits', async t => {
  const {root, manager} = await fixture(t, {remote: true, failingBuild: true});
  const before = git(root, 'rev-parse', 'HEAD');
  await fs.appendFile(path.join(root, 'source/_posts/article.md'), '保留这段内容');
  const job = await waitForJob(manager, 'publish');
  assert.equal(job.status, 'failed'); assert.equal(git(root, 'rev-parse', 'HEAD'), before);
  assert.match(await fs.readFile(path.join(root, 'source/_posts/article.md'), 'utf8'), /保留这段内容/);
});

test('sync refuses overlapping changes and preserves the local article', async t => {
  const {parent, root, manager} = await fixture(t, {remote: true});
  const other = path.join(parent, 'other');
  execFileSync('git', ['clone', '-b', 'main', path.join(parent, 'remote.git'), other], {stdio: 'ignore', windowsHide: true});
  git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.invalid');
  await fs.appendFile(path.join(other, 'source/_posts/article.md'), '另一台电脑修改');
  git(other, 'add', '.'); git(other, 'commit', '-m', 'Remote article'); git(other, 'push');
  await fs.appendFile(path.join(root, 'source/_posts/article.md'), '本机尚未发布的内容');
  const job = await waitForJob(manager, 'sync');
  assert.equal(job.status, 'failed'); assert.match(await fs.readFile(path.join(root, 'source/_posts/article.md'), 'utf8'), /本机尚未发布的内容/);
  assert.equal(git(root, 'status', '--porcelain').includes('UU'), false);
});

test('a rebase conflict is aborted without losing either local or remote content', async t => {
  const {parent, root, manager} = await fixture(t, {remote: true});
  const other = path.join(parent, 'other');
  execFileSync('git', ['clone', '-b', 'main', path.join(parent, 'remote.git'), other], {stdio: 'ignore', windowsHide: true});
  git(other, 'config', 'user.name', 'Other'); git(other, 'config', 'user.email', 'other@example.invalid');
  const remoteFile = path.join(other, 'source/_posts/article.md');
  await fs.writeFile(remoteFile, (await fs.readFile(remoteFile, 'utf8')).replace('原内容', '远端修改'));
  git(other, 'add', '.'); git(other, 'commit', '-m', 'Conflicting edit'); git(other, 'push');
  const localFile = path.join(root, 'source/_posts/article.md');
  await fs.writeFile(localFile, (await fs.readFile(localFile, 'utf8')).replace('原内容', '保留本地修改'));
  const localContent = await fs.readFile(localFile, 'utf8');
  const job = await waitForJob(manager, 'publish');
  assert.equal(job.status, 'failed'); assert.match(job.message, /无法自动合并/);
  assert.equal((await fs.readFile(localFile, 'utf8')).replace(/\r\n/g, '\n'), localContent.replace(/\r\n/g, '\n'));
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert((git(root, 'show', 'origin/main:source/_posts/article.md')).includes('远端修改'));
  await assert.rejects(fs.access(path.join(root, '.git/rebase-merge')));
});

test('a rejected push keeps a local commit and a retry can publish that same commit', async t => {
  const {parent, root, manager} = await fixture(t, {remote: true});
  const hook = path.join(parent, 'remote.git/hooks/pre-receive');
  await fs.writeFile(hook, '#!/bin/sh\nexit 1\n', {mode: 0o755});
  await fs.appendFile(path.join(root, 'source/_posts/article.md'), '待推送的内容');
  const first = await waitForJob(manager, 'publish');
  assert.equal(first.status, 'failed'); assert.match(first.message, /本地版本已保存/);
  const localCommit = git(root, 'rev-parse', 'HEAD');
  assert.match(await fs.readFile(path.join(root, 'source/_posts/article.md'), 'utf8'), /待推送的内容/);
  await fs.unlink(hook);
  const second = await waitForJob(manager, 'publish');
  assert.equal(second.status, 'success', second.message);
  assert.equal(git(root, 'rev-parse', 'HEAD'), localCommit);
});
