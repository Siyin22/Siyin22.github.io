'use strict';

const $ = selector => document.querySelector(selector);
const token = $('meta[name="blog-token"]').content;
let busy = false;
let jobId = null;
let pollTimer;
let toastTimer;
let deploymentTimer;
let trackedCommit;
let deploymentAttempts = 0;
let loadedState = false;
const taskNames = {sync: '同步内容', clean: '清理缓存', build: '生成并检查', preview: '本地预览', publish: '更新推送', new: '新建文章'};

async function api(route, body) {
  const response = await fetch('/api/' + route, {method: body === undefined ? 'GET' : 'POST',
    headers: {'X-Blog-Token': token, 'Content-Type': 'application/json'}, body: body === undefined ? undefined : JSON.stringify(body)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作没有完成，请重试。');
  return data;
}

function toast(message, error = false) {
  $('#toast').textContent = message;
  $('#toast').className = error ? 'error' : '';
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 9000 : 3500);
}

function setBusy(value) {
  busy = value;
  for (const button of document.querySelectorAll('[data-job],#new-post,#new-form button[type="submit"]')) button.disabled = value;
}

function showJob(job) {
  $('#task-panel').hidden = false;
  $('#task-panel').className = 'task-panel ' + job.status;
  const name = taskNames[job.type] || '操作';
  $('#task-title').textContent = job.status === 'running' ? name + '中…' : job.status === 'success' ? name + '完成' : name + '未完成';
  $('#task-message').textContent = job.status === 'running' ?
    job.type === 'publish' ? '正在检查、同步和推送，请稍等。' : job.type === 'preview' ? '正在生成并检查预览，完成后会自动打开博客页面。' : '正在处理，请稍等。' : job.result?.message || job.message;
  $('#open-preview').hidden = !(job.type === 'preview' && job.status === 'success');
  $('#preview strong').textContent = job.type === 'preview' && job.status === 'running' ? '正在准备预览…' : '本地预览';
  $('#task-log').textContent = job.log;
  $('#dismiss-task').hidden = job.status === 'running';
  setBusy(job.status === 'running');
}

function showState(state) {
  const firstState = !loadedState;
  loadedState = true;
  const count = state.changes.length;
  $('#local-status').textContent = state.branch !== 'main' ? '当前分支：' + state.branch :
    count ? `有 ${count} 个文件待发布` : state.ahead ? '有已保存的版本等待推送' : '本地没有待发布的修改';
  $('#local-dot').className = 'status-dot' + (count || state.ahead ? ' pending-dot' : '');
  $('#cache-status').textContent = state.cacheExists ? '已有本地生成结果' : '缓存已清空';
  $('#changes').hidden = !count;
  $('#change-count').textContent = count;
  const list = $('#change-list');
  list.replaceChildren(...state.changes.map(line => {
    const item = document.createElement('li');
    item.textContent = line.replace(/^\s*[MADRCU?!]{1,2}\s+/, '');
    return item;
  }));
  if (state.job?.status === 'running') {
    jobId = state.job.id;
    showJob(state.job);
  } else if (state.job && (state.job.id === jobId || firstState)) {
    showJob(state.job);
    const completed = state.job;
    jobId = null;
    if (completed.status === 'success') {
      if (completed.type === 'publish') {
        trackedCommit = completed.result.commit;
        deploymentAttempts = 0;
        watchDeployment();
      }
      if (completed.type === 'new' && !firstState) toast(completed.result.message);
    }
  } else if (!state.job || state.job.status !== 'running') setBusy(false);
}

async function refreshState() {
  const state = await api('state');
  showState(state);
  return state;
}

async function poll() {
  clearTimeout(pollTimer);
  try { await refreshState(); }
  catch (error) {
    $('#local-status').textContent = '工作台连接已断开，请重新双击打开';
    if (busy) toast(error.message, true);
  }
  pollTimer = setTimeout(poll, busy ? 800 : 8000);
}

async function startJob(type, input = {}) {
  if (busy) return;
  setBusy(true);
  try {
    const job = await api('job', {type, ...input});
    jobId = job.id; showJob(job);
    if (type === 'new') $('#new-dialog').close();
    await poll();
  } catch (error) {
    setBusy(false);
    toast(error.message, true);
  }
}

async function watchDeployment() {
  clearTimeout(deploymentTimer);
  const requestedCommit = trackedCommit;
  try {
    const state = await api('deployment' + (trackedCommit ? '?commit=' + trackedCommit : ''));
    if (requestedCommit !== trackedCommit) return;
    if (state.url) $('#deployment-link').href = state.url;
    if (state.status === 'completed') {
      const success = state.conclusion === 'success';
      $('#deployment-text').textContent = success ? '线上发布成功' : '线上发布未完成';
      $('#deployment-dot').className = 'status-dot ' + (success ? 'success-dot' : 'pending-dot');
      if (trackedCommit && success) toast('博客已成功上线。');
    } else {
      $('#deployment-text').textContent = state.status === 'waiting' ? '等待 GitHub 开始发布' : '正在自动上线…';
      $('#deployment-dot').className = 'status-dot pending-dot';
      if (++deploymentAttempts < 40) deploymentTimer = setTimeout(watchDeployment, 15000);
    }
  } catch {
    if (requestedCommit !== trackedCommit) return;
    $('#deployment-text').textContent = '打开 GitHub 查看状态';
    if (trackedCommit && ++deploymentAttempts < 40) deploymentTimer = setTimeout(watchDeployment, 15000);
  }
}

for (const button of document.querySelectorAll('[data-job]')) button.addEventListener('click', () => startJob(button.dataset.job));
$('#refresh').addEventListener('click', () => refreshState().catch(error => toast(error.message, true)));
$('#folder').addEventListener('click', async () => {
  $('#folder').disabled = true;
  try { toast((await api('folder', {})).message); }
  catch (error) { toast(error.message, true); }
  finally { $('#folder').disabled = false; }
});
$('#new-post').addEventListener('click', () => { $('#new-title').value = ''; $('#new-dialog').showModal(); $('#new-title').focus(); });
$('#cancel-new').addEventListener('click', () => $('#new-dialog').close());
$('#new-form').addEventListener('submit', event => { event.preventDefault(); startJob('new', {title: $('#new-title').value}); });
$('#dismiss-task').addEventListener('click', () => { $('#task-panel').hidden = true; });
window.addEventListener('focus', () => { refreshState().catch(() => {}); });
poll();
watchDeployment();
