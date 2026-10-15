(() => {
  'use strict';
  const content = window.EMOTION_BOX_CONTENT;
  const $ = id => document.getElementById(id);
  const keys = { favorites: 'lucky-everyday:xinxin:v1:favorites', vents: 'lucky-everyday:xinxin:v1:vents', paused: 'lucky-everyday:xinxin:v1:rain-paused', weather: 'lucky-everyday:xinxin:v1:weather' };
  const messages = content.messages.filter(m => m && typeof m.id === 'string' && typeof m.text === 'string');
  const messageMap = new Map(messages.map(m => [m.id, m]));
  let readProblem = false;
  function read(key, validate, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const value = JSON.parse(raw);
      if (!validate(value)) throw new Error('Invalid saved data');
      return value;
    } catch { readProblem = true; return fallback; }
  }
  const isStrings = v => Array.isArray(v) && v.every(x => typeof x === 'string');
  const isVents = v => Array.isArray(v) && v.every(x => x && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.at === 'string');
  let favorites = [...new Set(read(keys.favorites, isStrings, []))];
  let vents = read(keys.vents, isVents, []);
  let paused = read(keys.paused, v => typeof v === 'boolean', false);
  const storedWeather = read(keys.weather, v => typeof v === 'string', 'rain');
  let weather = ['rain', 'cloudy', 'sunny'].includes(storedWeather) ? storedWeather : 'rain';
  let bag = [], current = null, throwing = false;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const readWarning = '暂时无法读取本地记录。已有内容不会自动覆盖；可以先使用不保存的功能，或换回原来的浏览器查看。';
  function write(key, value, status) {
    if (readProblem) { status.textContent = readWarning; return false; }
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { status.textContent = '这次没能保存，可能是浏览器限制或空间不足。内容还在，请先复制留下；你也可以选择不保存。'; return false; }
  }
  document.querySelectorAll('[data-nickname]').forEach(el => { el.textContent = content.profile.nickname; });
  document.title = `${content.profile.nickname}的小盒子`;
  $('secret-title').textContent = content.secret.title;
  $('secret-text').textContent = content.secret.text;
  const copy = content.interactions;
  $('footer-note').textContent = copy.footer;
  $('secret-sign').textContent = copy.secretSign;
  $('art-hint').textContent = copy.hint;
  $('package-label').textContent = copy.packageLabel;
  $('picker-hint').textContent = copy.pickerHint;

  function showDialog(id) {
    const dialog = $(id);
    clearArtEffect();
    if (id === 'note-dialog') resetPicker();
    if (id === 'collection-dialog') renderCollection();
    if (id === 'future-dialog') renderLetters();
    if (id === 'vent-dialog' && readProblem) $('vent-status').textContent = readWarning;
    dialog.showModal();
    if (id === 'quiet-dialog') updateRain();
    // Focus the close control instead of opening the phone keyboard without an invitation.
    dialog.querySelector('[data-close]').focus();
  }
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => showDialog(button.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, input, textarea, a[href], [tabindex="0"]')]
        .filter(el => !el.disabled && el.getClientRects().length);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement);
      const next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
      event.preventDefault(); controls[next].focus();
    });
    let startedOutside = false;
    const outside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
    dialog.addEventListener('pointerdown', event => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => { if (startedOutside && event.target === dialog && outside(event)) dialog.close(); startedOutside = false; });
  });
  $('open-secret').addEventListener('click', () => showDialog('secret-dialog'));
  $('open-collection').addEventListener('click', () => showDialog('collection-dialog'));

  // Pick only after the reveal finishes: closing during the animation never consumes a note.
  let noteTimer = null, noteBusy = false, noteVersion = 0;
  function cancelNoteReveal() {
    clearTimeout(noteTimer); noteTimer = null; noteBusy = false; noteVersion++;
    document.querySelectorAll('.pick-paper').forEach(button => { button.disabled = false; button.classList.remove('picked'); });
    $('note-reader').classList.remove('revealing');
    $('note-dialog').removeAttribute('aria-busy');
    $('next-note').disabled = !messages.length;
    $('back-to-picker').disabled = false;
  }
  function resetPicker() {
    cancelNoteReveal();
    $('note-picker').hidden = false; $('note-reader').hidden = true;
    $('note-title').textContent = copy.pickerTitle; $('note-status').textContent = '';
    $('note-text').textContent = '';
    document.querySelectorAll('.pick-paper').forEach(button => { button.disabled = !messages.length; });
    if (!messages.length) $('note-status').textContent = '这里暂时还没有纸条，先坐一会儿吧。';
  }
  function revealNote(button) {
    if (noteBusy || !messages.length || !$('note-dialog').open) return;
    noteBusy = true;
    const version = ++noteVersion;
    $('note-dialog').setAttribute('aria-busy', 'true');
    document.querySelectorAll('.pick-paper').forEach(paper => { paper.disabled = true; });
    $('next-note').disabled = true; $('back-to-picker').disabled = true;
    const picker = !$('note-picker').hidden;
    if (picker) button.classList.add('picked');
    else $('note-reader').classList.add('revealing');
    function complete() {
      if (version !== noteVersion || !$('note-dialog').open) return;
      cancelNoteReveal();
      nextNote();
      $('note-picker').hidden = true; $('note-reader').hidden = false;
      $('note-title').textContent = copy.readerTitle;
      $('next-note').focus();
    }
    if (reducedMotion.matches) complete();
    else noteTimer = setTimeout(complete, 500);
  }
  document.querySelectorAll('.pick-paper').forEach(button => button.addEventListener('click', () => revealNote(button)));
  $('back-to-picker').addEventListener('click', () => { resetPicker(); document.querySelector('.pick-paper').focus(); });
  $('note-dialog').addEventListener('close', resetPicker);

  let artTimer = null, messageTimer = null;
  function clearArtEffect(clearMessage = true) {
    clearTimeout(artTimer); artTimer = null;
    $('art-stage').removeAttribute('data-effect'); $('art-effects').replaceChildren();
    if (clearMessage) {
      clearTimeout(messageTimer); messageTimer = null;
      $('art-message').classList.remove('message-visible'); $('art-message').textContent = '';
    }
  }
  function playArtEffect(kind) {
    clearArtEffect();
    $('art-message').textContent = copy[kind];
    $('art-message').classList.add('message-visible');
    messageTimer = setTimeout(() => { $('art-message').classList.remove('message-visible'); }, 4000);
    if (reducedMotion.matches) return;
    $('art-stage').dataset.effect = kind;
    if (kind === 'flower' || kind === 'heart') {
      const count = kind === 'flower' ? 16 : 5;
      const bounds = document.querySelector('.hotspot-heart').getBoundingClientRect();
      for (let i = 0; i < count; i++) {
        const particle = document.createElement('span');
        particle.className = kind === 'flower' ? 'petal' : 'floating-heart';
        if (kind === 'flower') {
          particle.style.left = `${3 + (i * 37) % 94}%`;
          particle.style.setProperty('--drift', `${(i % 2 ? 1 : -1) * (20 + i * 3)}px`);
          particle.style.setProperty('--turn', `${90 + i * 23}deg`);
          particle.style.backgroundColor = ['#e4b191', '#d1bca1', '#d6b0a5', '#b6c09c'][i % 4];
        } else {
          const heart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          heart.setAttribute('viewBox', '0 0 24 24'); heart.setAttribute('class', 'ui-icon');
          heart.setAttribute('aria-hidden', 'true'); heart.setAttribute('focusable', 'false');
          const outline = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          outline.setAttribute('d', 'M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13Z');
          outline.setAttribute('fill', 'none'); outline.setAttribute('stroke', 'currentColor'); outline.setAttribute('stroke-width', '1.5');
          heart.append(outline); particle.append(heart);
          particle.style.left = `${bounds.left + bounds.width / 2}px`;
          particle.style.top = `${bounds.top + bounds.height / 2}px`;
          particle.style.setProperty('--drift', `${(i - 2) * 22}px`);
        }
        particle.style.animationDelay = `${kind === 'flower' ? ((i * 7) % 11) * .04 : i * .035}s`;
        if (kind === 'flower') particle.style.animationDuration = `${1.3 + (i % 4) * .07}s`;
        $('art-effects').append(particle);
      }
    }
    artTimer = setTimeout(() => clearArtEffect(false), 2100);
  }
  document.querySelectorAll('[data-art]').forEach(button => button.addEventListener('click', () => playArtEffect(button.dataset.art)));
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) clearArtEffect(false);
    if (noteBusy) {
      // Finish immediately when the system switches off motion during a reveal.
      cancelNoteReveal();
      revealNote(document.querySelector('.pick-paper'));
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearArtEffect(); });
  resetPicker();

  function nextNote() {
    if (!bag.length) {
      bag = [...messages];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
      if (bag.length > 1 && bag[bag.length - 1].id === current?.id) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    current = bag.pop();
    $('note-text').textContent = current?.text || '这里暂时还没有纸条，先坐一会儿吧。';
    $('note-status').textContent = '';
    $('next-note').disabled = !messages.length;
    updateFavorite();
  }
  function updateFavorite() {
    const saved = Boolean(current && favorites.includes(current.id));
    $('save-note').disabled = !current;
    $('save-note').textContent = saved ? '已收藏 · 取消收藏' : '收藏这张';
    $('save-note').setAttribute('aria-pressed', String(saved));
  }
  function toggleFavorite(id, status) {
    const saved = favorites.includes(id);
    const next = saved ? favorites.filter(x => x !== id) : [...favorites, id];
    if (!write(keys.favorites, next, status)) return;
    favorites = next;
    status.textContent = saved ? '已经取消收藏。' : '留下了，下次可以在收藏里找到。';
    updateFavorite();
    return true;
  }
  $('next-note').addEventListener('click', () => revealNote($('next-note')));
  $('save-note').addEventListener('click', () => { if (current) toggleFavorite(current.id, $('note-status')); });
  function makeEntry(text) {
    const article = document.createElement('article'); article.className = 'entry';
    const p = document.createElement('p'); p.textContent = text; article.append(p);
    const footer = document.createElement('div'); footer.className = 'entry-footer'; article.append(footer);
    return { article, footer };
  }
  function empty(container, text) { const p = document.createElement('p'); p.className = 'empty-state'; p.textContent = text; container.append(p); }
  function renderCollection() {
    const container = $('collection-list'); container.replaceChildren();
    $('collection-status').textContent = readProblem ? readWarning : '';
    const available = favorites.filter(id => messageMap.has(id));
    if (!available.length) empty(container, '这里还没有小纸条。遇到喜欢的话，再把它留下来。');
    available.forEach(id => {
      const { article, footer } = makeEntry(messageMap.get(id).text);
      const label = document.createElement('span'); label.className = 'entry-label'; label.textContent = '留给自己的话';
      const button = document.createElement('button'); button.className = 'text-button'; button.textContent = '取消收藏';
      button.addEventListener('click', () => {
        if (toggleFavorite(id, $('collection-status'))) {
          renderCollection(); $('collection-status').textContent = '已经取消收藏。';
          (container.querySelector('button') || $('collection-dialog').querySelector('[data-close]')).focus();
        }
      });
      footer.append(label, button); container.append(article);
    });
    if (favorites.some(id => !messageMap.has(id))) empty(container, '部分旧纸条暂时不在当前内容中；收藏标记仍为你保留。');
  }

  $('throw-vent').addEventListener('click', async () => {
    if (throwing) return;
    const input = $('vent-text'), status = $('vent-status'), text = input.value.trim();
    if (!text) { status.textContent = '什么都不写也可以，先在这里歇一会儿。'; return; }
    const keep = $('save-vent').checked;
    if (keep) {
      const next = [...vents, { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, text, at: new Date().toISOString() }];
      if (!write(keys.vents, next, status)) return;
      vents = next;
    }
    throwing = true; $('throw-vent').disabled = true; input.readOnly = true; $('save-vent').disabled = true;
    input.classList.add('throwing');
    if (!reducedMotion.matches) await new Promise(resolve => setTimeout(resolve, 550));
    input.value = ''; input.classList.remove('throwing'); input.readOnly = false;
    $('save-vent').checked = false; $('save-vent').disabled = false; $('throw-vent').disabled = false; throwing = false;
    status.textContent = keep ? '放好了，只留在当前浏览器里。你想看或删掉都可以。' : '好，先放下了。这段文字没有保存。';
    if (!$('vent-history').hidden) renderVents();
  });
  $('show-vents').addEventListener('click', () => {
    const history = $('vent-history'); history.hidden = !history.hidden;
    $('show-vents').textContent = history.hidden ? '看看留下的纸条' : '收起留下的纸条';
    $('show-vents').setAttribute('aria-expanded', String(!history.hidden));
    if (!history.hidden) renderVents();
  });
  $('show-vents').setAttribute('aria-expanded', 'false');
  function renderVents() {
    const container = $('vent-list'); container.replaceChildren();
    $('clear-vents').hidden = !vents.length;
    if (!vents.length) empty(container, readProblem ? '本地记录暂时无法读取。' : '这里还没有留下的纸条。不留，也很好。');
    [...vents].reverse().forEach(vent => {
      const { article, footer } = makeEntry(vent.text);
      const time = document.createElement('time'); time.dateTime = vent.at;
      const date = new Date(vent.at); time.textContent = Number.isNaN(date.getTime()) ? '之前留下的' : new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(date);
      const button = document.createElement('button'); button.className = 'text-button'; button.textContent = '删除这张';
      button.addEventListener('click', () => {
        const next = vents.filter(x => x.id !== vent.id);
        if (!write(keys.vents, next, $('vent-status'))) return;
        vents = next; renderVents(); $('vent-status').textContent = '这张纸条已经删除。';
        (container.querySelector('button') || $('show-vents')).focus();
      }); footer.append(time, button); container.append(article);
    });
    if (!vents.length) $('clear-confirm').hidden = true;
  }
  $('clear-vents').addEventListener('click', () => { $('clear-confirm').hidden = false; $('cancel-clear').focus(); });
  $('cancel-clear').addEventListener('click', () => { $('clear-confirm').hidden = true; $('clear-vents').focus(); });
  $('confirm-clear').addEventListener('click', () => {
    if (!write(keys.vents, [], $('vent-status'))) return;
    vents = []; renderVents(); $('vent-status').textContent = '树洞纸条已经清空。'; $('show-vents').focus();
  });

  const quietCopy = content.quiet;
  $('quiet-entry').textContent = quietCopy.entry;
  $('quiet-note').textContent = quietCopy.note;
  quietCopy.copy.forEach((line, index) => {
    if (index) $('quiet-copy').append(document.createElement('br'));
    $('quiet-copy').append(document.createTextNode(line));
  });
  document.querySelectorAll('.weather-button').forEach(button => {
    button.textContent = quietCopy.weather[button.dataset.weather].name;
    button.addEventListener('click', () => {
      weather = button.dataset.weather;
      updateRain();
      persistQuiet(keys.weather, weather);
    });
  });
  for (let i = 0; i < 28; i++) {
    const drop = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const x = 193 + (i * 37) % 235, y = 45 + (i * 53) % 260;
    drop.setAttribute('x1', x); drop.setAttribute('y1', y);
    drop.setAttribute('x2', x - 2); drop.setAttribute('y2', y + 10);
    drop.style.animationDelay = `${-i * .37}s`; drop.style.animationDuration = `${3.2 + (i % 5) * .3}s`;
    $('weather-rain').append(drop);
  }
  function updateRain() {
    const stopped = paused || reducedMotion.matches;
    const scene = $('quiet-scene');
    scene.dataset.weather = weather;
    scene.classList.toggle('is-still', stopped);
    scene.classList.toggle('is-inactive', !$('quiet-dialog').open || document.hidden);
    $('quiet-scene-description').textContent = quietCopy.weather[weather].description;
    document.querySelectorAll('.weather-button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.weather === weather)));
    $('toggle-rain').textContent = reducedMotion.matches ? quietCopy.reduced : stopped ? quietCopy.resume : quietCopy.pause;
    $('toggle-rain').setAttribute('aria-pressed', String(stopped));
    $('toggle-rain').disabled = reducedMotion.matches;
    if (readProblem) $('quiet-storage-status').textContent = quietCopy.temporary;
  }
  function persistQuiet(key, value) {
    if (readProblem) { $('quiet-storage-status').textContent = quietCopy.temporary; return; }
    try { localStorage.setItem(key, JSON.stringify(value)); $('quiet-storage-status').textContent = ''; }
    catch { $('quiet-storage-status').textContent = quietCopy.temporary; }
  }
  $('toggle-rain').addEventListener('click', () => {
    paused = !paused; updateRain();
    persistQuiet(keys.paused, paused);
  });
  $('quiet-dialog').addEventListener('close', updateRain);
  document.addEventListener('visibilitychange', updateRain);
  reducedMotion.addEventListener('change', updateRain);
  updateRain();

  const letters = (content.letters || []).filter(letter => letter && typeof letter.id === 'string' && typeof letter.title === 'string' && typeof letter.text === 'string' && typeof letter.unlockAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(letter.unlockAt) && Number.isFinite(Date.parse(letter.unlockAt)));
  $('future-section').hidden = !letters.length;
  $('open-future').addEventListener('click', () => showDialog('future-dialog'));
  function renderLetters() {
    const container = $('future-list'); container.replaceChildren();
    [...letters].sort((a, b) => Date.parse(a.unlockAt) - Date.parse(b.unlockAt)).forEach(letter => {
      const unlocked = Date.now() >= Date.parse(letter.unlockAt);
      const article = document.createElement('article'); article.className = 'entry';
      const title = document.createElement('h3'); title.textContent = letter.title;
      const p = document.createElement('p');
      p.textContent = unlocked ? letter.text : `${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(letter.unlockAt))}（设备当地时间）之后，就可以拆开了。`;
      article.append(title, p); container.append(article);
    });
  }
  // Recheck dates when returning to the page, and while the letter drawer is open.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('future-dialog').open) renderLetters(); });
  setInterval(() => { if ($('future-dialog').open) renderLetters(); }, 30000);
})();
