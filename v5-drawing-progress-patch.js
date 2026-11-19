/* Añadir DESPUÉS de v3-camera-gallery-patch.js, antes de </body>. */
(function () {
  'use strict';
  // Base independiente: no cambia la versión ni los registros de la galería.
  const cards = new Map();
  const records = new Map();
  const dirty = new Set();
  let queue = Promise.resolve(), timer, opening = 0;
  const dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open('vamos-pintar-progress', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('progress', {keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function transaction(mode, operation) {
    const db = await dbPromise;
    return new Promise((resolve, reject) => {
      const t = db.transaction('progress', mode);
      const request = operation(t.objectStore('progress'));
      t.oncomplete = () => resolve(request.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  function initialThumbnail(d) {
    const colors = ['#fdd835','#4fc3f7','#f06292','#9ccc65','#fb8c00','#8e24aa','#e53935','#1e88e5'];
    return `<svg viewBox="0 0 400 400" aria-hidden="true"><g stroke="#2f3a40" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">${d.r.map((path,i) => `<path d="${path}" fill="${colors[i % colors.length]}" fill-rule="evenodd"/>`).join('')}</g></svg>`;
  }
  function updateThumbnail(d) {
    const card = cards.get(d.id);
    if (!card) return;
    if (!records.has(d.id)) { card.innerHTML = initialThumbnail(d); return; }
    const small = document.createElement('canvas'); small.width = small.height = 200;
    const x = small.getContext('2d');
    x.fillStyle = bgs[d.id] || '#fff'; x.fillRect(0,0,200,200);
    x.drawImage(cv[d.id],0,0,200,200);
    const svg = outlineSVG(d);
    card.innerHTML = svg.replace('<g ', `<image href="${small.toDataURL('image/png')}" width="400" height="400"/><g `);
  }
  DR.forEach((d,i) => {
    const card = $('#grid').children[i];
    if (card) { cards.set(d.id,card); card.innerHTML = initialThumbnail(d); }
  });
  function makeCanvas(id) {
    if (cv[id]) return cv[id];
    const c = document.createElement('canvas'); c.width = c.height = 800;
    c.getContext('2d').setTransform(2,0,0,2,0,0);
    c.hidden = true; $('#stage').prepend(c); cv[id] = c; bgs[id] = '#fff';
    return c;
  }
  const ready = (async () => {
    try {
      const all = await transaction('readonly', s => s.getAll());
      await Promise.all(all.map(async record => {
        const d = DR.find(item => item.id === record.id);
        if (!d || !record.image) return;
        const url = URL.createObjectURL(record.image);
        try {
          const image = new Image();
          await new Promise((resolve,reject) => { image.onload=resolve; image.onerror=reject; image.src=url; });
          const c = makeCanvas(d.id), x = c.getContext('2d');
          x.save(); x.setTransform(1,0,0,1,0,0); x.drawImage(image,0,0,800,800); x.restore();
          bgs[d.id] = record.background || '#fff'; records.set(d.id,record); updateThumbnail(d);
        } finally { URL.revokeObjectURL(url); }
      }));
    } catch (error) { console.warn('No se pudo recuperar el progreso local.',error); }
  })();
  const originalOpen = openDrawing;
  openDrawing = async function(d) {
    const token = ++opening;
    await ready;
    if (token === opening) originalOpen(d);
  };
  function persist(d) {
    if (!d || !cv[d.id] || !dirty.has(d.id)) return;
    dirty.delete(d.id);
    // Captura síncrona: el guardado no cambia aunque el niño siga pintando.
    const snapshot = document.createElement('canvas'); snapshot.width = snapshot.height = 800;
    snapshot.getContext('2d').drawImage(cv[d.id],0,0);
    const background = bgs[d.id] || '#fff';
    const pixels = snapshot.getContext('2d').getImageData(0,0,800,800).data;
    let hasPaint = background !== '#fff';
    for (let i=3; !hasPaint && i<pixels.length; i+=4) hasPaint = pixels[i] !== 0;
    if (!hasPaint) {
      records.delete(d.id); updateThumbnail(d);
      queue = queue.then(() => transaction('readwrite',s => s.delete(d.id))).catch(error => console.warn('No se pudo borrar el progreso.',error));
      return;
    }
    records.set(d.id,{id:d.id}); updateThumbnail(d);
    const blob = new Promise(resolve => snapshot.toBlob(resolve,'image/png'));
    queue = queue.then(async () => {
      const image = await blob;
      if (image) await transaction('readwrite',s => s.put({id:d.id,image,background,updated:Date.now()}));
    }).catch(error => console.warn('No se pudo guardar el progreso.',error));
  }
  function scheduleSave() {
    clearTimeout(timer);
    const d = cur;
    timer = setTimeout(() => persist(d),700);
  }
  stage.addEventListener('pointerdown',e => {
    if (cur && e.pointerId === pid) dirty.add(cur.id);
  });
  stage.addEventListener('pointermove',e => {
    if (cur && tool === 'brush' && e.pointerId === pid) dirty.add(cur.id);
  });
  ['pointerup','pointercancel'].forEach(name => stage.addEventListener(name,scheduleSave));
  // Captura antes de los onclick existentes: incluye volver, candado y cámara.
  ['bHome','lock','bCam'].forEach(id => {
    const button = document.getElementById(id);
    if (button) button.addEventListener('pointerdown',() => persist(cur),true);
  });
  $('#bHome').addEventListener('click',() => persist(cur),true);
  $('#bTrash').addEventListener('click',() => {
    const d = cur;
    clearTimeout(timer);
    // El borrado original se ejecuta a los 180 ms.
    setTimeout(() => { if (d) { dirty.add(d.id); persist(d); } },230);
  });
  document.addEventListener('visibilitychange',() => {
    if (document.hidden) persist(cur);
  });
  window.addEventListener('pagehide',() => persist(cur));
})();
