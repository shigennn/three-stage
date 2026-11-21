// The start screen: new project, open, and recent projects. Actions go to the main process through window.threeStage (preload.cjs).
const api = window.threeStage;
const $ = (id) => document.getElementById(id);

function showError(text) {
  $('error').textContent = text || '';
}

async function call(promise) {
  $('busy').hidden = false;
  showError('');
  const r = await promise;
  $('busy').hidden = true;
  if (r && r.error) showError(r.error);
  return r || {};
}

function joinPath(dir, name) {
  return dir.replace(/[\\/]+$/, '') + '\\' + name;
}

async function renderRecent() {
  const { ok: list = [] } = await api.recent();
  const ul = $('recent');
  ul.replaceChildren();
  $('empty').hidden = list.length > 0;
  for (const r of list) {
    const li = document.createElement('li');
    const info = document.createElement('div');
    info.className = 'info';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = r.name;
    const dir = document.createElement('div');
    dir.className = 'dir';
    dir.textContent = r.dir;
    dir.title = r.dir;
    const when = document.createElement('div');
    when.className = 'when';
    when.textContent = r.exists ? new Date(r.openedAt).toLocaleString() : 'Not found (moved or deleted)';
    info.append(name, dir, when);
    li.append(info);
    if (r.exists) {
      li.addEventListener('click', () => call(api.open(r.dir)));
    } else {
      li.className = 'missing';
      const forget = document.createElement('button');
      forget.textContent = 'Remove from List';
      forget.addEventListener('click', async () => {
        await api.forget(r.dir);
        renderRecent();
      });
      li.append(forget);
    }
    ul.append(li);
  }
}

function updatePath() {
  const name = $('name').value.trim();
  const loc = $('location').value.trim();
  $('path').textContent = name && loc ? `Will be created at: ${joinPath(loc, name)}` : '';
}

$('new').addEventListener('click', async () => {
  $('new-form').hidden = false;
  if (!$('location').value) $('location').value = (await api.defaultLocation()).ok || '';
  updatePath();
  $('name').select();
  $('name').focus();
});

$('cancel').addEventListener('click', () => {
  $('new-form').hidden = true;
  showError('');
});

$('pick').addEventListener('click', async () => {
  const { ok } = await api.pickFolder($('location').value || undefined);
  if (ok) {
    $('location').value = ok;
    updatePath();
  }
});

$('name').addEventListener('input', updatePath);
$('location').addEventListener('input', updatePath);

$('new-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const template = document.querySelector('input[name="template"]:checked')?.value ?? 'empty';
  call(api.create($('location').value.trim(), $('name').value.trim(), template));
});

$('open').addEventListener('click', () => call(api.openDialog()));

renderRecent();
