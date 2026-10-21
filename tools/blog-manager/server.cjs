'use strict';

const http = require('node:http');
const net = require('node:net');
const fs = require('node:fs/promises');
const {existsSync, mkdirSync, appendFileSync} = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawn} = require('node:child_process');

const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const shanghaiTime = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
}).format(new Date());
const failure = (message, status = 400) => Object.assign(new Error(message), {status});

function openDesktop(target, {directory = false} = {}) {
  const command = process.platform === 'win32' ? directory ? 'explorer.exe' : 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' && !directory ? ['url.dll,FileProtocolHandler', target] : [target];
  return new Promise((resolve, reject) => {
    // GUI programs must remain visible; windowsHide also hides Explorer windows.
    const child = spawn(command, args, {windowsHide: false, detached: true, stdio: 'ignore', shell: false});
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

function createManager(root, {openExternal = openDesktop} = {}) {
  root = path.resolve(root);
  const token = crypto.randomBytes(32).toString('hex');
  const projectId = sha(root).slice(0, 16);
  let origin;
  let job = null;

  async function run(command, args, {timeout = 120000, log = false, env = {}} = {}) {
    return new Promise((resolve, reject) => {
      const childEnv = {...process.env, ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never'};
      for (const key of Object.keys(childEnv)) {
        if (/^(http_proxy|https_proxy|all_proxy)$/i.test(key) && !(key in env)) delete childEnv[key];
      }
      const child = spawn(command, args, {cwd: root, env: childEnv, windowsHide: true, shell: false});
      let output = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeout);
      const capture = data => {
        const text = data.toString();
        output = (output + text).slice(-160000);
        if (log && job) job.log = (job.log + text).slice(-100000);
      };
      child.stdout.on('data', capture);
      child.stderr.on('data', capture);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => {
        clearTimeout(timer);
        if (code === 0 && !timedOut) resolve(output.trim());
        else reject(Object.assign(new Error(timedOut ? '操作超时，请检查网络后重试。' : output.trim() || '命令未能完成。'), {output, code}));
      });
    });
  }
  const git = (args, options) => run('git', args, options);
  const log = text => { if (job) job.log += text + '\n'; };

  function proxyAvailable() {
    return new Promise(resolve => {
      const client = net.connect({host: '127.0.0.1', port: 7897});
      const done = result => { client.destroy(); resolve(result); };
      client.setTimeout(700, () => done(false));
      client.once('connect', () => done(true));
      client.once('error', () => done(false));
    });
  }

  async function networkGit(args, readOnly) {
    const remote = await git(['remote', 'get-url', 'origin']);
    const external = /^https?:\/\//.test(remote) && !/^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^/]+\.cn(?=[:/]))/i.test(remote);
    const useProxy = external && await proxyAvailable();
    const prefix = ['-c', 'http.lowSpeedLimit=100', '-c', 'http.lowSpeedTime=20'];
    try {
      return await git([...prefix, '-c', `http.proxy=${useProxy ? 'http://127.0.0.1:7897' : ''}`, ...args], {timeout: 60000, log: true});
    } catch (error) {
      if (readOnly && useProxy && /could not resolve|failed to connect|ssl|tls|timed out|connection.*(reset|refused)|proxy connect/i.test(error.message)) {
        log('代理连接未成功，尝试直接连接。');
        return git([...prefix, '-c', 'http.proxy=', ...args], {timeout: 60000, log: true});
      }
      throw error;
    }
  }

  function ensureIdle() {
    if (job?.status === 'running') throw failure('当前操作还没有完成，请稍等。', 409);
  }

  async function state() {
    const [branch, changes, ahead] = await Promise.all([
      git(['branch', '--show-current']), git(['-c', 'core.quotepath=false', 'status', '--porcelain=v1', '--untracked-files=all']),
      git(['rev-list', '--count', 'origin/main..HEAD']).catch(() => '0')
    ]);
    return {branch, changes: changes ? changes.split('\n') : [], ahead: Number(ahead), job,
      cacheExists: existsSync(path.join(root, 'db.json')) || existsSync(path.join(root, 'public')),
      actionsUrl: 'https://github.com/Siyin22/Siyin22.github.io/actions', siteUrl: 'https://20010903.xyz/'};
  }

  async function assertMain() {
    if (await git(['branch', '--show-current']) !== 'main') throw failure('请先切回 main 分支，再同步或发布。');
    const gitDir = await git(['rev-parse', '--absolute-git-dir']);
    if (['rebase-merge', 'rebase-apply', 'MERGE_HEAD'].some(name => existsSync(path.join(gitDir, name)))) throw failure('仓库有尚未完成的合并，请先在编辑器中处理。');
  }

  async function build({clean = true} = {}) {
    log('正在生成网站……');
    if (clean) await run(process.execPath, ['node_modules/hexo/bin/hexo', 'clean'], {log: true});
    await run(process.execPath, ['node_modules/hexo/bin/hexo', 'generate'], {log: true});
    log('正在检查文章链接、评论和主题配置……');
    await run(process.execPath, ['.github/scripts/check-site.mjs'], {log: true});
  }

  async function createPost(input) {
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    if (!title || title.length > 150 || /[\r\n\0]/.test(title)) throw failure('请填写不超过 150 字的文章标题。');
    let name = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 100).replace(/^[. ]+|[. ]+$/g, '');
    if (!name) throw failure('请换一个文章标题。');
    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '文章-' + name;
    const filename = path.join(root, 'source/_posts', name + '.md');
    if (existsSync(filename)) throw failure('已有同名文章，请换一个标题。');
    log('正在创建带有日期和文章头部的 Markdown 文件……');
    await run(process.execPath, ['node_modules/hexo/bin/hexo', 'new', '--path=' + name + '.md', '--', title], {log: true});
    if (!existsSync(filename)) throw failure('Hexo 未能创建预期的文章文件，请展开日志查看原因。');
    return {message: '新文章已创建。到 Obsidian 的文章目录中打开它即可写作。', filename: name + '.md'};
  }

  async function openFolder() {
    const folder = path.join(root, 'source/_posts');
    if (!(await fs.stat(folder)).isDirectory()) throw failure('文章文件夹不存在。');
    await openExternal(folder, {directory: true});
    return {message: '已打开文章文件夹。'};
  }

  async function sync() {
    await assertMain();
    log('正在获取线上更新……');
    await networkGit(['fetch', 'origin', 'main'], true);
    // Git refuses a fast-forward if it would overwrite a local edit.
    try { await git(['merge', '--ff-only', 'origin/main'], {log: true}); }
    catch { throw failure('线上与本地都有修改，已保留你的内容。请使用“更新推送”，它会先保存本地版本再同步。'); }
    return {message: '已同步最新内容，本地修改已保留。'};
  }

  async function publish(input) {
    await assertMain();
    await build();
    const changes = await git(['status', '--porcelain']);
    if (changes) {
      log('正在保存本地版本……');
      await git(['add', '--all'], {log: true});
      const message = typeof input.message === 'string' && input.message.trim() ? input.message.trim().slice(0, 200) : '更新博客 · ' + shanghaiTime();
      await git(['commit', '-m', message], {log: true});
    }
    const before = await git(['rev-parse', 'HEAD']);
    log('正在同步线上统计和源码……');
    await networkGit(['fetch', 'origin', 'main'], true);
    try { await git(['rebase', 'origin/main'], {log: true}); }
    catch (error) {
      await git(['rebase', '--abort'], {log: true}).catch(() => {});
      throw failure('线上和本地修改了同一处内容，无法自动合并。本地版本已保存；请在编辑器中处理后重试。');
    }
    if (before !== await git(['rev-parse', 'HEAD'])) await build();
    log('正在推送，随后由 GitHub 自动上线……');
    try { await networkGit(['push', 'origin', 'HEAD:main'], false); }
    catch (error) { throw failure('本地版本已保存，推送尚未确认成功。请检查网络后再次点击发布。\n' + error.message); }
    return {message: '已推送到 GitHub，正在自动上线。', commit: await git(['rev-parse', 'HEAD'])};
  }

  function startJob(type, input) {
    ensureIdle();
    const tasks = {sync, publish, new: createPost, build: async () => { await build(); return {message: '网站已重新生成，文章链接和主题配置检查通过。'}; },
      clean: async () => {
        log('正在清理生成的网页和 Hexo 缓存……');
        await run(process.execPath, ['node_modules/hexo/bin/hexo', 'clean'], {log: true});
        return {message: '缓存已清理，文章、图片和主题文件均已保留。'};
      },
      preview: async () => {
        await build({clean: false});
        const result = {message: '预览已生成并打开。修改文章后，再点一次预览即可查看最新内容。', previewUrl: '/'};
        // Open only after generation and verification, without reserving a blank tab.
        // The local desktop launcher also avoids browsers blocking an asynchronous popup.
        try { await openExternal(new URL('/', origin).href); }
        catch { result.message = '预览已生成，自动打开失败。请点击“打开预览”查看。'; }
        return result;
      }};
    if (!tasks[type]) throw failure('不支持的操作。');
    job = {id: crypto.randomUUID(), type, status: 'running', log: '', startedAt: Date.now()};
    const current = job;
    Promise.resolve().then(() => tasks[type](input)).then(result => {
      current.status = 'success'; current.result = result;
    }).catch(error => {
      current.status = 'failed'; current.message = error.message;
    }).finally(() => { current.finishedAt = Date.now(); });
    return current;
  }

  async function deployment(commit) {
    if (commit && !/^[a-f0-9]{40}$/.test(commit)) throw failure('发布版本无效。');
    const url = 'https://api.github.com/repos/Siyin22/Siyin22.github.io/actions/runs?per_page=5' + (commit ? '&head_sha=' + commit : '');
    const useProxy = await proxyAvailable();
    const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
    const args = ['--connect-timeout', '5', '--max-time', '18', '--silent', '--show-error', '--fail', '-H', 'Accept: application/vnd.github+json', '-H', 'User-Agent: Siyin-Blog-Manager', url];
    let output;
    try { output = await run(curl, ['--proxy', useProxy ? 'http://127.0.0.1:7897' : '', ...args], {timeout: 22000}); }
    catch (error) {
      if (useProxy && /curl: \((5|6|7|28|35|60)\)/.test(error.message)) output = await run(curl, ['--proxy', '', ...args], {timeout: 22000});
      else throw failure('暂时无法查询上线状态。可以打开 GitHub 查看，已推送的内容不会丢失。', 502);
    }
    const data = JSON.parse(output);
    const runInfo = data.workflow_runs?.find(run => run.name === 'Deploy blog');
    return runInfo ? {status: runInfo.status, conclusion: runInfo.conclusion, url: runInfo.html_url, createdAt: runInfo.created_at} : {status: 'waiting'};
  }

  async function readBody(request) {
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 32768) throw failure('请求内容过长。', 413);
      chunks.push(chunk);
    }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch { throw failure('请求内容无效。'); }
  }

  const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon'};
  const json = (response, status, data) => { response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); response.end(JSON.stringify(data)); };

  const server = http.createServer(async (request, response) => {
    try {
      if (request.headers.host !== origin?.slice(7)) throw failure('不允许的访问地址。', 403);
      if (request.headers.origin && request.headers.origin !== origin) throw failure('不允许跨站访问。', 403);
      const url = new URL(request.url, origin);
      if (url.pathname === '/api/health') return json(response, 200, {projectId});
      if (url.pathname.startsWith('/api/')) {
        if (request.headers['x-blog-token'] !== token) throw failure('请从本机工作台重新打开。', 403);
        if (request.method === 'GET') {
          if (url.pathname === '/api/state') return json(response, 200, await state());
          if (url.pathname === '/api/deployment') return json(response, 200, await deployment(url.searchParams.get('commit')));
        }
        if (request.method === 'POST') {
          if (!request.headers['content-type']?.startsWith('application/json')) throw failure('请求格式无效。', 415);
          const input = await readBody(request);
          if (url.pathname === '/api/folder') return json(response, 200, await openFolder());
          if (url.pathname === '/api/job') return json(response, 202, startJob(input.type, input));
        }
        throw failure('没有这个操作。', 404);
      }
      if (!['GET', 'HEAD'].includes(request.method)) throw failure('不支持此请求。', 405);
      if (['/manage', '/manage/'].includes(url.pathname)) {
        let html = await fs.readFile(path.join(__dirname, 'index.html'), 'utf8');
        html = html.replace('__BLOG_TOKEN__', token);
        response.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'", 'X-Content-Type-Options': 'nosniff'});
        return response.end(html);
      }
      const asset = {'/manage/app.js': 'app.js', '/manage/style.css': 'style.css', '/manage/icon.svg': 'icon.svg'}[url.pathname];
      const base = asset ? __dirname : path.join(root, 'public');
      let relative = asset || decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (relative.split(/[\\/]/).some(part => part.startsWith('.') || part === 'node_modules')) throw failure('页面不存在。', 404);
      let filename = path.resolve(base, relative);
      if (filename !== base && !filename.startsWith(base + path.sep)) throw failure('页面不存在。', 404);
      try {
        if ((await fs.stat(filename)).isDirectory()) filename = path.join(filename, 'index.html');
        const real = await fs.realpath(filename);
        if (!real.startsWith(await fs.realpath(base) + path.sep)) throw failure('页面不存在。', 404);
        const data = await fs.readFile(filename);
        response.writeHead(200, {'Content-Type': mime[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
        response.end(request.method === 'HEAD' ? undefined : data);
      } catch (error) {
        if (error.code === 'ENOENT') throw failure('预览尚未生成，请回工作台点击“预览网站”。', 404);
        throw error;
      }
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, {error: error.message});
      else response.end();
    }
  });
  return {server, projectId, setOrigin: value => { origin = value; }, state, startJob};
}

function openBrowser(url) {
  openDesktop(url).catch(error => console.error('无法打开浏览器：' + error.message));
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const dataDir = path.join(root, '.blog-manager');
  mkdirSync(dataDir, {recursive: true});
  const manager = createManager(root);
  for (let port = 4317; port <= 4326; port++) {
    const address = `http://127.0.0.1:${port}`;
    manager.setOrigin(address);
    try {
      await new Promise((resolve, reject) => {
        manager.server.once('error', reject);
        manager.server.listen(port, '127.0.0.1', () => { manager.server.removeListener('error', reject); resolve(); });
      });
      await fs.writeFile(path.join(dataDir, 'server.json'), JSON.stringify({pid: process.pid, url: address + '/manage/'}));
      console.log('博客工作台：' + address + '/manage/');
      if (process.argv.includes('--open')) openBrowser(address + '/manage/');
      return;
    } catch (error) {
      if (error.code !== 'EADDRINUSE') throw error;
      try {
        const response = await fetch(address + '/api/health', {signal: AbortSignal.timeout(1000)});
        if ((await response.json()).projectId === manager.projectId) {
          if (process.argv.includes('--open')) openBrowser(address + '/manage/');
          return;
        }
      } catch {}
    }
  }
  throw new Error('4317–4326 端口均被占用，请关闭旧工作台后再试。');
}

if (require.main === module) main().catch(error => {
  const dataDir = path.resolve(__dirname, '../../.blog-manager');
  mkdirSync(dataDir, {recursive: true});
  appendFileSync(path.join(dataDir, 'server.log'), new Date().toISOString() + ' ' + error.stack + '\n');
  console.error(error.message);
  process.exitCode = 1;
});

module.exports = {createManager};
