/* Vamos a Pintar — etapa 2: progreso offline en IndexedDB.
 * Cargar DESPUÉS de v3-camera-gallery-patch.js.
 * Base independiente de Mis creaciones. Guarda PNG original y fondo.
 * No modifica PAL ni el carrusel. Los IDs de DR deben ser estables.
 */
(() => {
  'use strict';
  if (window.__drawingProgressV5) return;
  const grid = document.querySelector('#grid');
  const paint = document.querySelector('#paint');
  if (!grid || !paint || typeof DR === 'undefined') {
    console.error('Progreso v5: cargar después del script principal.');
    return;
  }
  window.__drawingProgressV5 = true;
  const colors = ['#fdd835','#4fc3f7','#f06292','#9ccc65',
    '#fb8c00','#8e24aa','#e53935','#1e88e5'];
  const cards = new Map();
  const pending = new Set();
  const previews = new Map();
  const touched = new Set();
  const timers = new Map();
  let queue = Promise.resolve();
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open('vamos-pintar-progress-v5', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('progress', {keyPath: 'id'});
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => console.warn('Progreso: cerrar otras pestañas de la app.');
  });
  database.catch(error => console.warn('Progreso offline no disponible:', error));

  function write(record, id) {
    queue = queue.then(async () => {
      const db = await database;
      await new Promise((resolve, reject) => {
        const tx = db.transaction('progress', 'readwrite');
        const store = tx.objectStore('progress');
        if (record) store.put(record); else store.delete(id);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    }).catch(error => console.warn('No se pudo guardar el progreso:', error));
  }

  function snapshot(d) {
    clearTimeout(timers.get(d.id));
    timers.delete(d.id);
    if (!cv[d.id] || !pending.has(d.id)) return;
    // Captura inmediata: un borrado posterior no altera este snapshot.
    write({id: d.id, png: cv[d.id].toDataURL('image/png'),
      background: bgs[d.id] || '#fff', updated: Date.now()}, d.id);
    refresh(d);
  }

  function changed(d) {
    if (!d) return;
    touched.add(d.id);
    pending.add(d.id);
    clearTimeout(timers.get(d.id));
    timers.set(d.id, setTimeout(() => snapshot(d), 800));
  }

  async function restore() {
    try {
      const db = await database;
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction('progress', 'readonly');
        const request = tx.objectStore('progress').getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await Promise.all(records.map(async record => {
        const d = DR.find(item => item.id === record.id);
        if (!d || touched.has(d.id)) return;
        const image = new Image();
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = record.png;
        });
        if (touched.has(d.id)) return;
        // Un dibujo nunca abierto recibe su canvas al abrirlo normalmente.
        const existing = cv[d.id];
        const canvas = existing || document.createElement('canvas');
        if (!existing) {
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          cv[d.id] = canvas;
        }
        const x = canvas.getContext('2d');
        x.save();
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, canvas.width, canvas.height);
        x.drawImage(image, 0, 0, canvas.width, canvas.height);
        x.restore();
        bgs[d.id] = record.background || '#fff';
        if (cur && cur.id === d.id) stage.style.background = bgs[d.id];
        pending.add(d.id);
        refresh(d);
      }));
    } catch (error) {
      console.warn('No se pudo recuperar el progreso:', error);
    }
  }
  const escaped = value => String(value).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]));

  function initialSVG(d, index) {
    // Colores solo en el menú; no se dibujan en el lienzo.
    // Colores por región de la manzana: cuerpo rojo, hoja verde, tallo marrón.
    // El orden debe coincidir con las regiones d.r del dibujo.
    const appleColors = ['#e53935', '#9ccc65', '#795548'];
    const isApple = /manzana|apple/i.test(`${d.id} ${d.name}`);
    const regions = d.r.map((path, i) => {
      const color = isApple ? (appleColors[i] || '#e53935')
        : colors[(i + index) % colors.length];
      return `<path d="${escaped(path)}" fill="${color}" fill-rule="evenodd"/>`;
    }).join('');
    const outlines = d.r.map(path => `<path d="${escaped(path)}"/>`).join('');
    return `<svg viewBox="0 0 400 400"><g>${regions}</g><g fill="none" stroke="#2f3a40" stroke-width="8" stroke-linejoin="round" stroke-linecap="round">${outlines}</g></svg>`;
  }

  Array.from(grid.querySelectorAll('.card')).slice(0, DR.length).forEach((card, i) => {
    const d = DR[i];
    const initial = initialSVG(d, i);
    cards.set(d.id, {card, initial});
    card.innerHTML = initial;
  });

  function refresh(d) {
    if (!d || !pending.has(d.id) || !cv[d.id]) return;
    const entry = cards.get(d.id);
    if (!entry) return;
    const small = document.createElement('canvas');
    small.width = small.height = 200;
    const x = small.getContext('2d');
    x.fillStyle = bgs[d.id] || '#fff';
    x.fillRect(0, 0, 200, 200);
    x.drawImage(cv[d.id], 0, 0, 200, 200);
    const image = small.toDataURL('image/png');
    if (previews.get(d.id) !== image) {
      // El parser HTML crea correctamente el namespace SVG.
      // Conservamos los contornos originales y colocamos la pintura debajo.
      const holder = document.createElement('div');
      holder.innerHTML = outlineSVG(d);
      const svg = holder.querySelector('svg');
      if (!svg) {
        console.error('Progreso v5: outlineSVG no devolvió un SVG', d.id);
        return;
      }
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('viewBox', '0 0 400 400');
      const layer = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      layer.setAttribute('href', image);
      layer.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', image);
      layer.setAttribute('width', '400');
      layer.setAttribute('height', '400');
      svg.insertBefore(layer, svg.firstChild);
      entry.card.replaceChildren(svg);
      previews.set(d.id, image);
    }
    pending.delete(d.id);
  }

  // Conserva los lienzos existentes: openDrawing ya recupera el avance en sesión.
  // Solo marca cambios que pueden dejar pintura dentro del área permitida.
  const originalFill = fill;
  fill = function(p) {
    const d = cur;
    const x = ctxOf();
    const hit = d.P.some(path => x.isPointInPath(path, p[0]*2, p[1]*2, 'evenodd'));
    originalFill(p);
    if (hit || set.modo === 'marco') changed(d);
  };
  const originalSeg = seg;
  seg = function(a, b) {
    originalSeg(a, b);
    if (cur) changed(cur);
  };

  // Detecta navegación sin sustituir show ni tocar los controles de la galería.
  new MutationObserver(() => {
    if (!paint.classList.contains('on')) {
      DR.forEach(d => snapshot(d));
    }
  }).observe(paint, {attributes: true, attributeFilter: ['class']});

  // Captura el dibujo al pulsar: un cambio de pantalla durante los 180 ms
  // de animación no debe borrar por accidente otro dibujo.
  document.querySelector('#bTrash').onclick = () => {
    const d = cur;
    if (!d || !cv[d.id]) return;
    const canvas = cv[d.id];
    const x = canvas.getContext('2d');
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, canvas.width, canvas.height);
    x.restore();
    bgs[d.id] = '#fff';
    stage.style.background = '#fff';
    touched.add(d.id);
    clearTimeout(timers.get(d.id));
    timers.delete(d.id);
    pending.delete(d.id);
    previews.delete(d.id);
    write(null, d.id);
    const entry = cards.get(d.id);
    if (entry) entry.card.innerHTML = entry.initial;
    stage.animate([
      {opacity:1, transform:'scale(1)'},
      {opacity:.2, transform:'scale(.96)'},
      {opacity:1, transform:'scale(1)'}
    ], {duration:360, easing:'ease-in-out'});
  };

  // Guardar también al terminar cada gesto reduce el riesgo de cierre abrupto.
  window.addEventListener('pointerup', () => {
    if (cur) snapshot(cur);
  });
  window.addEventListener('pointercancel', () => {
    if (cur) snapshot(cur);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) DR.forEach(d => snapshot(d));
  });
  window.addEventListener('pagehide', () => DR.forEach(d => snapshot(d)));
  restore();
})();
