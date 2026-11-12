/* Vamos a Pintar v3 — añadir como <script src="v3-camera-gallery-patch.js"></script>
   justo antes de </body>, después del script actual de index.html. */
(function () {
  'use strict';

  /* ---------- IndexedDB: galería local, máximo 12 creaciones ---------- */
  const DB_NAME = 'vamos-pintar', DB_VERSION = 1, MAX_ART = 12;
  let dbPromise;
  function openDB() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('gallery')) db.createObjectStore('gallery', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function tx(mode, fn) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction('gallery', mode), store = t.objectStore('gallery');
      const req = fn(store);
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  const STORE = {
    list: () => tx('readonly', s => s.getAll()),
    add: async rec => {
      const all = await STORE.list();
      all.sort((a,b) => a.created - b.created);
      const remove = Math.max(0, all.length - MAX_ART + 1);
      for (let i = 0; i < remove; i++) await tx('readwrite', s => s.delete(all[i].id));
      return tx('readwrite', s => s.add(rec));
    }
  };

  /* El nombre hablado queda junto a cada dibujo, sin tocar los 16 objetos originales. */
  const phraseName = {
    pelota:'la pelota', sol:'el sol', casa:'la casa', flor:'la flor', pez:'el pez', estrella:'la estrella',
    corazón:'el corazón', manzana:'la manzana', gato:'el gato', mariposa:'la mariposa', árbol:'el árbol',
    carro:'el carro', helado:'el helado', barco:'el barco', globo:'el globo', tortuga:'la tortuga'
  };
  DR.forEach(d => d.sayName = phraseName[d.name] || d.name);

  /* ---------- UI de Mis Creaciones ---------- */
  const style = document.createElement('style');
  style.textContent = `
    #bGallery{left:24px;bottom:20px;width:96px;height:96px;border-radius:50%;position:absolute;background:#fff;color:#37474f;box-shadow:0 4px 0 #cfc8b8;display:grid;place-items:center}
    #gallery{background:#f4f1ea;flex-direction:column;padding:24px 24px 128px}
    #artGrid{flex:1;min-height:0;overflow-y:auto;touch-action:pan-y;display:grid;grid-template-columns:repeat(4,1fr);gap:20px;padding:4px;scrollbar-width:none}
    #artGrid::-webkit-scrollbar{display:none}.art{position:relative;aspect-ratio:1;background:#fff;border-radius:28px;box-shadow:0 6px 0 #cfc8b8;overflow:hidden;padding:0}.art img{width:100%;height:100%;object-fit:contain;display:block}.emptyArt{grid-column:1/-1;align-self:center;justify-self:center;font-size:28px;font-weight:800;color:#78909c}
    #gBack{position:absolute;right:24px;bottom:20px}.flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:10}.flash.on{animation:flash .18s ease-out}@keyframes flash{0%{opacity:0}35%{opacity:.96}100%{opacity:0}}
    #confetti{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:11}.cooldown{pointer-events:none;filter:grayscale(.35);opacity:.65}
    #artView{background:rgba(20,28,32,.92);align-items:center;justify-content:center;padding:32px}.artFull{max-width:92vw;max-height:85vh;border-radius:28px;background:#fff}.artClose{position:absolute;right:24px;bottom:20px;color:#37474f}
  `;
  document.head.append(style);
  const icon = '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 16l5-5 3 3 3-3 5 5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>';
  const gallery = document.createElement('section');
  gallery.id = 'gallery'; gallery.className = 'screen';
  gallery.innerHTML = '<div id="artGrid"></div><button id="gBack" class="btn" data-i="home"></button>';
  document.body.append(gallery);
  $('#gBack').innerHTML = `<svg class="i" viewBox="0 0 24 24">${IC.home}</svg>`;
  const viewer = document.createElement('section');
  viewer.id = 'artView'; viewer.className = 'screen';
  viewer.innerHTML = '<img class="artFull" alt="Creación guardada"><button class="btn artClose"></button>';
  document.body.append(viewer);
  $('.artClose').innerHTML = `<svg class="i" viewBox="0 0 24 24">${IC.home}</svg>`;
  const bGallery = document.createElement('button');
  bGallery.id = 'bGallery'; bGallery.className = 'btn'; bGallery.innerHTML = icon;
  $('#home').append(bGallery);

  function leaveGallery() { show('home'); }
  $('#gBack').onclick = leaveGallery;
  $('.artClose').onclick = () => { gallery.classList.add('on'); viewer.classList.remove('on'); };
  async function showGallery() {
    show('gallery');
    const grid = $('#artGrid'); grid.innerHTML = '';
    let arts = [];
    try { arts = await STORE.list(); } catch(e) {}
    arts.sort((a,b) => b.created - a.created);
    if (!arts.length) { grid.innerHTML = '<div class="emptyArt">Todavía no hay pinturas</div>'; return; }
    arts.forEach(art => {
      const b = document.createElement('button'), img = new Image(), url = URL.createObjectURL(art.image);
      b.className = 'art'; img.src = url; img.alt = 'Pintura guardada'; b.append(img);
      img.onload = () => URL.revokeObjectURL(url);
      b.onclick = () => { $('.artFull').src = URL.createObjectURL(art.image); gallery.classList.remove('on'); viewer.classList.add('on'); };
      grid.append(b);
    });
  }
  bGallery.onclick = showGallery;

  /* ---------- Sonidos originales creados con Web Audio ---------- */
  function shutter() {
    try {
      const a = getAC(), t = a.currentTime, b = a.createBuffer(1, Math.floor(a.sampleRate*.08), a.sampleRate), d = b.getChannelData(0);
      for (let i=0;i<d.length;i++) d[i] = (Math.random()*2-1) * Math.exp(-i/(a.sampleRate*.018));
      const n = a.createBufferSource(), g = a.createGain(); n.buffer=b; g.gain.setValueAtTime(.28,t); n.connect(g).connect(a.destination); n.start(t);
    } catch(e) {}
  }
  function fanfare() {
    try {
      const a = getAC(), t = a.currentTime;
      [60,64,67,72].forEach((m,i) => {
        const o=a.createOscillator(), g=a.createGain(), at=t+i*.09;
        o.type='triangle'; o.frequency.value=440*Math.pow(2,(m-69)/12);
        g.gain.setValueAtTime(.0001,at); g.gain.exponentialRampToValueAtTime(.13,at+.025); g.gain.exponentialRampToValueAtTime(.0001,at+.65);
        o.connect(g).connect(a.destination); o.start(at); o.stop(at+.7);
      });
    } catch(e) {}
  }

  /* ---------- Destello y confeti de tres segundos ---------- */
  const flash = document.createElement('div'); flash.className = 'flash'; $('#stage').append(flash);
  const conf = document.createElement('canvas'); conf.id = 'confetti'; $('#stage').append(conf);
  function celebrate() {
    flash.classList.remove('on'); void flash.offsetWidth; flash.classList.add('on');
    const r = $('#stage').getBoundingClientRect(), ratio = devicePixelRatio || 1;
    conf.width = r.width * ratio; conf.height = r.height * ratio;
    const c = conf.getContext('2d'); c.scale(ratio,ratio);
    const colors=['#e53935','#fb8c00','#fdd835','#43a047','#1e88e5','#8e24aa','#f06292'];
    const bits = Array.from({length:130}, () => ({x:Math.random()*r.width,y:-20-Math.random()*r.height*.55,vx:(Math.random()-.5)*3.8,vy:1.7+Math.random()*3.2,rot:Math.random()*6.3,vr:(Math.random()-.5)*.22,w:7+Math.random()*8,h:4+Math.random()*6,col:colors[Math.floor(Math.random()*colors.length)]}));
    const start=performance.now();
    (function frame(now){
      c.clearRect(0,0,r.width,r.height);
      bits.forEach(p=>{ p.x+=p.vx; p.y+=p.vy; p.vy+=.035; p.rot+=p.vr; c.save();c.translate(p.x,p.y);c.rotate(p.rot);c.fillStyle=p.col;c.fillRect(-p.w/2,-p.h/2,p.w,p.h);c.restore(); });
      if(now-start<3000) requestAnimationFrame(frame); else c.clearRect(0,0,r.width,r.height);
    })(start);
  }
  function praise() {
    const p = ['¡Muy bien!', '¡Lo has logrado!', `¡Qué linda pintura de ${cur.sayName}!`, `¡Te quedó hermosa ${cur.sayName}!`];
    say(p[Math.floor(Math.random()*p.length)]);
  }

  function composedBlob() {
    return new Promise(resolve => {
      const out=document.createElement('canvas'); out.width=out.height=800;
      const x=out.getContext('2d'); x.fillStyle=bgs[cur.id] || '#fff'; x.fillRect(0,0,800,800); x.drawImage(cv[cur.id],0,0);
      const img=new Image();
      img.onload=()=>{ x.drawImage(img,0,0,800,800); out.toBlob(resolve,'image/png'); };
      img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(outlineSVG(cur).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" '));
    });
  }

  /* Cámara = guardar + celebrar. El guardado no depende de la animación. */
  $('#bCam').onclick = async () => {
    const button = $('#bCam'); if (button.classList.contains('cooldown')) return;
    button.classList.add('cooldown'); shutter();
    try {
      const image = await composedBlob();
      if (image) await STORE.add({ drawing:cur.id, name:cur.name, image, created:Date.now() });
    } catch(e) { /* Si IndexedDB está bloqueado, la celebración sigue funcionando. */ }
    fanfare(); celebrate(); praise();
    setTimeout(()=>button.classList.remove('cooldown'), 3100);
  };
})();
