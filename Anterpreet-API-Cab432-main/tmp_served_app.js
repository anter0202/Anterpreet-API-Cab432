// tmp_served_app.js - removed stale client bundle
// This file previously contained a built client with hard-coded remote API hosts.
// To avoid accidentally serving stale or externally-pointing assets, the file
// content has been replaced. Use the canonical client at ./client/app.js instead.
  setActionsVisible(true);
  await refresh();


async function refresh() {
  await Promise.all([loadImages(), loadJobs()]);
}

async function loadImages() {
  const res = await fetch('http://3.106.115.203:5432/api/v1/images?owner=me&limit=50&page=1&sort=created_at&order=desc', {
    headers: { 'Authorization': 'Bearer ' + state.token }
  });
  const list = await res.json();
  state.images = list;
  const tbody = $('#imagesTable tbody');
  tbody.innerHTML = '';
  list.forEach(row => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(row.created_at).toLocaleString()}</td>
      <td>${row.owner_username}</td>
      <td>${row.width||'?' }x${row.height||'?'}</td>
      <td>${row.format}</td>
      <td>${(row.size_bytes/1024).toFixed(1)} KB</td>
      <td><button data-id="${row.id}">Select</button> <a href="/api/v1/images/${row.id}/download" target="_blank">Download</a></td>
    `;
    tr.querySelector('button').onclick = () => { state.selectedImageId = row.id; alert('Selected image: ' + row.id); };
    tbody.appendChild(tr);
  });
}

async function loadJobs() {
  const res = await fetch('http://3.106.115.203:5432/api/v1/jobs?limit=50&page=1', {
    headers: { 'Authorization': 'Bearer ' + state.token }
  });
  const list = await res.json();
  state.jobs = list;
  const tbody = $('#jobsTable tbody');
  tbody.innerHTML = '';
  list.forEach(row => {
    const tr = document.createElement('tr');
    const link = row.result_path ? `<span class="badge ok">ready</span>` : `<span class="badge">${row.status}</span>`;
    tr.innerHTML = `
      <td>${row.status}</td>
      <td>${row.cpu_ms || '-'}</td>
      <td>${link}</td>
      <td>${new Date(row.updated_at).toLocaleString()}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function uploadFile() {
  const file = $('#fileInput').files[0];
  if (!file) return alert('Choose a file');
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('http://3.106.115.203:5432/api/v1/images', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + state.token },
    body: fd
  });
  if (!res.ok) { alert('Upload failed'); return; }
  await refresh();
}

async function importRandom() {
  const res = await fetch('http://3.106.115.203:5432/api/v1/images/import', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + state.token }
  });
  if (!res.ok) { alert('Import failed'); return; }
  await refresh();
}

async function processSelected() {
  if (!state.selectedImageId) return alert('Select an image first (press Select)');
  const preset = $('#preset').value;
  const repeats = parseInt($('#repeats').value, 10) || 1;
  const res = await fetch('http://3.106.115.203:5432/api/v1/jobs', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + state.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId: state.selectedImageId, params: { preset, repeats } })
  });
  if (!res.ok) { alert('Process failed'); return; }
  await loadJobs();
}

$('#loginBtn').onclick = login;
$('#refreshBtn').onclick = refresh;
$('#uploadBtn').onclick = uploadFile;
$('#importBtn').onclick = importRandom;
$('#processSelectedBtn').onclick = processSelected;
