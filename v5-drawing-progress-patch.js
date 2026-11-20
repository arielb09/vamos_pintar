/* Vamos a Pintar — etapa 1: miniaturas y progreso en sesión.
 * Cargar DESPUÉS de v3-camera-gallery-patch.js.
 * Depende de los identificadores del index.html adjunto.
 * No guarda en IndexedDB; al recargar se pierde el avance.
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
    if (hit || set.modo === 'marco') pending.add(d.id);
  };
  const originalSeg = seg;
  seg = function(a, b) {
    originalSeg(a, b);
    if (cur) pending.add(cur.id);
  };

  // Detecta navegación sin sustituir show ni tocar los controles de la galería.
  new MutationObserver(() => {
    if (!paint.classList.contains('on')) {
      DR.forEach(d => refresh(d));
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
    pending.delete(d.id);
    previews.delete(d.id);
    const entry = cards.get(d.id);
    if (entry) entry.card.innerHTML = entry.initial;
    stage.animate([
      {opacity:1, transform:'scale(1)'},
      {opacity:.2, transform:'scale(.96)'},
      {opacity:1, transform:'scale(1)'}
    ], {duration:360, easing:'ease-in-out'});
  };

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) DR.forEach(d => refresh(d));
  });
  window.addEventListener('pagehide', () => DR.forEach(d => refresh(d)));
})();
