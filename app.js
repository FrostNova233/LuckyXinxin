(() => {
  'use strict';
  const content = window.EMOTION_BOX_CONTENT;
  const $ = id => document.getElementById(id);
  const prefix = 'lucky-everyday:xinxin:v1:';
  // Legacy keys stay readable; the versioned gift store holds snapshots and faces.
  const keys = { favorites: `${prefix}favorites`, vents: `${prefix}vents`, paused: `${prefix}rain-paused`, weather: `${prefix}weather`, visited: `${prefix}visited`, drops: `${prefix}drops`, gifts: 'lucky-everyday:xinxin:v2:gift-drops' };
  const messages = content.messages.filter(m => m && typeof m.id === 'string' && typeof m.text === 'string');
  const messageMap = new Map(messages.map(m => [m.id, m]));
  const luckyContent = content.superLucky && typeof content.superLucky.id === 'string' && typeof content.superLucky.text === 'string' ? content.superLucky : null;
  const isSpecial = item => item?.special === 'super-lucky';
  const luckyHit = value => value >= 0 && value < .10;
  function dayIsLucky(day) {
    // A fixed, separate date hash keeps today's surprise stable before it is saved.
    let hash = 2166136261;
    for (const char of `super-lucky-v1:${day}`) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    hash ^= hash >>> 16; hash = Math.imul(hash, 0x85ebca6b); hash ^= hash >>> 13;
    return luckyHit((hash >>> 0) / 4294967296);
  }
  const readProblems = new Set();
  const art = window.BOTTLE_ART, faceNames = art.names, faceIds = Object.keys(faceNames);
  const validFace = face => Object.hasOwn(faceNames, face);
  function stableFace(id) {
    let hash = 2166136261;
    for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return faceIds[(hash >>> 0) % faceIds.length];
  }
  const isStrings = v => Array.isArray(v) && v.every(x => typeof x === 'string');
  const isVents = v => Array.isArray(v) && v.every(x => x && typeof x.id === 'string' && typeof x.text === 'string' && typeof x.at === 'string' && (x.expression === undefined || validFace(x.expression)));
  const isDays = v => isStrings(v) && v.every(day => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T00:00:00Z`)) && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day);
  const readWarning = '暂时无法读取这部分本地记录，原来的内容不会被覆盖。其他小雨滴仍可以看看。';
  function read(key, validate, fallback, absent = fallback) {
    try {
      const raw = localStorage.getItem(key);
      readProblems.delete(key);
      if (raw === null) return absent;
      const value = JSON.parse(raw);
      if (!validate(value)) throw new Error('Invalid saved data');
      return value;
    } catch { readProblems.add(key); return fallback; }
  }
  function write(key, value, status) {
    if (readProblems.has(key)) { if (status) status.textContent = readWarning; return false; }
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { if (status) status.textContent = '这次没能保存，可能是浏览器限制或空间不足。还没有存进瓶子里，写下的内容会为你保留。'; return false; }
  }
  const isGiftStore = store => store && store.version === 2 && Array.isArray(store.items) && new Set(store.items.map(item => item?.id)).size === store.items.length && store.items.every(item =>
    item && typeof item.messageId === 'string' && validFace(item.expression) &&
    (typeof item.text === 'string' || item.text === null) && (item.special === undefined || isSpecial(item)) &&
    (item.source === 'message' && item.special === undefined && item.id === `message:${item.messageId}` ||
     item.source === 'daily' && typeof item.text === 'string' && isDays([item.day]) && item.id === `daily:${item.day}` ||
     item.source === 'lucky' && isSpecial(item) && typeof item.text === 'string' && typeof item.id === 'string' && /^lucky:.+/.test(item.id) &&
       typeof item.at === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(item.at) && Number.isFinite(Date.parse(item.at))));
  let giftStoreExists = false;
  function loadGifts(fallback = []) {
    const store = read(keys.gifts, isGiftStore, { version: 2, items: fallback }, null);
    giftStoreExists = store !== null;
    if (store) return store.items;
    const ids = [...new Set(read(keys.favorites, isStrings, []))];
    return ids.map(messageId => ({ id: `message:${messageId}`, source: 'message', messageId, text: messageMap.get(messageId)?.text ?? null, expression: stableFace(`message:${messageId}`) }));
  }
  let giftItems = loadGifts();
  const giftsUnreadable = () => readProblems.has(keys.gifts) || (!giftStoreExists && readProblems.has(keys.favorites));
  const collectionUnreadable = () => giftsUnreadable() || readProblems.has(keys.vents) || readProblems.has(keys.drops);
  function saveGift(entry, status) {
    const latest = loadGifts(giftItems);
    if (giftsUnreadable()) { status.textContent = readWarning; return false; }
    const existing = latest.find(item => item.id === entry.id);
    if (existing) { giftItems = latest; if (entry.source === 'daily') current = existing; return true; }
    const next = [...latest, entry];
    if (!write(keys.gifts, { version: 2, items: next }, status)) return false;
    giftItems = next; giftStoreExists = true; return true;
  }
  let vents = read(keys.vents, isVents, []);
  let drops = [...new Set(read(keys.drops, isDays, []))]; // Legacy dates only; no new daily counter.
  let paused = read(keys.paused, v => typeof v === 'boolean', false);
  let weather = read(keys.weather, v => ['rain', 'cloudy', 'sunny'].includes(v), 'rain');
  const returning = read(keys.visited, v => typeof v === 'boolean', false);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const copy = content.interactions;
  const capacity = 10, pageSize = 6, pages = { gift: 0, self: 0, home: 0 };
  let bag = [], current = null, lastRandomId = null, bottleSelection = null, personal = null, menuGroup = 'gift', readerMode = 'random', pendingCatch = null;
  let noteTimer = null, noteVersion = 0, noteBusy = false, artTimer = null, artMessageTimer = null, journeyTimer = null, submitting = false;
  let luckyTimer = null, brandResetTimer = null, brandMotionTimer = null, brandStarsTimer = null, brandCount = 0, lastBrandTap = -Infinity;
  let luckySequence = 0;
  let svgSequence = 0, heroBottleSignature = '';
  const returnFocus = new WeakMap(), dialogStack = [];
  const groupName = group => group === 'gift' ? '送给你的' : '留给自己的';
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
  const starPath = 'm0-9 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z';

  function bottleSvg(count, index = 0, group = 'gift', special = false) {
    const stage = count === 0 ? 0 : count <= 3 ? 1 : count <= 6 ? 2 : count <= 9 ? 3 : 4;
    const height = [0, 29, 53, 74, 85][stage], top = 144 - height;
    const palettes = [['#d3bda0', '#aac9ca'], ['#a6b69d', '#b5ccbc'], ['#d7b3a5', '#b8cbd3'], ['#c4b8ce', '#bcc8d5']];
    const [cap, water] = special ? ['#d9b45e', '#e2ca83'] : group === 'self' ? [['#cbb39d', '#c5c6b5'], ['#c4b2ba', '#c8c2cb'], ['#c9ba9f', '#c7ccb6'], ['#b8b6c5', '#c2c8cd']][index % 4] : palettes[index % palettes.length];
    const clip = `glass-${++svgSequence}`;
    const positions = [[41, 130], [76, 121], [49, 105], [73, 93], [40, 84]];
    const stars = positions.slice(0, stage === 0 ? 0 : stage + 1).map(([x, y], i) => `<path d="${starPath}" transform="translate(${x} ${y}) scale(${.68 + i * .035})" fill="#e7cf91" stroke="#948660" stroke-width="1.1"/>`).join('');
    return `<svg viewBox="0 0 120 165" aria-hidden="true" class="bottle-svg${special ? ' super-lucky-bottle' : ''}" data-fill="${stage}" data-count="${count}"><defs><clipPath id="${clip}"><path d="M44 32h32v18l22 28v58q0 10-10 10H32q-10 0-10-10V78l22-28Z"/></clipPath></defs><ellipse cx="60" cy="154" rx="44" ry="5" fill="#e6e0d1"/><path d="M44 32h32v18l22 28v58q0 10-10 10H32q-10 0-10-10V78l22-28Z" fill="#fffdf6" fill-opacity=".5"/><g clip-path="url(#${clip})"><rect x="20" y="${top}" width="80" height="${height + 2}" fill="${water}" fill-opacity=".85"/>${height ? `<path d="M20 ${top}q20-5 40 0t40 0" stroke="#729898" stroke-width="1.5" fill="none"/>` : ''}${stars}</g><path d="M44 32h32v18l22 28v58q0 10-10 10H32q-10 0-10-10V78l22-28Z" fill="none" stroke="#647b70" stroke-width="2" stroke-linejoin="round"/><rect x="40" y="22" width="40" height="13" rx="2" fill="${cap}" stroke="#8b7e65" stroke-width="1.5"/><path d="M43 27h33M29 88v36" stroke="#fffdf6" stroke-width="3" stroke-linecap="round"/><path d="M25 136q35 9 70 0" fill="none" stroke="#647b70" stroke-opacity=".35"/>${stage >= 3 ? '<path class="bottle-sparkle" d="M11 59v12m-6-6h12m91 38v10m-5-5h10" fill="none" stroke="#b7a56d" stroke-width="1.5"/>' : ''}${stage === 4 ? '<path d="m82 43 7 5 8-2" fill="none" stroke="#aa9472" stroke-width="2"/>' : ''}</svg>`;
  }
  function mascotSvg(expression = 'smile', luggage = false, special = false) { return art.mascot(expression, luggage, special); }
  function heroScene() {
    const n = giftItems.length ? (giftItems.length % capacity || capacity) : 0;
    const index = Math.max(0, Math.ceil(giftItems.length / capacity) - 1);
    if (!$('hero-scene').firstElementChild) {
      $('hero-scene').innerHTML = `<svg viewBox="105 0 380 390" aria-hidden="true"><ellipse cx="266" cy="357" rx="196" ry="15" fill="#e9e3d6"/><path d="M116 357q18-3 33 1m273 0 33-4" stroke="#bcb3a1" stroke-width="1.5" fill="none"/><g transform="translate(118 4) rotate(-4 125 180)"><svg id="hero-bottle" width="260" height="357" viewBox="0 0 120 165"></svg></g><g class="hero-mascot" transform="translate(371 250)"><svg width="100" height="114" viewBox="0 0 110 125">${mascotSvg().replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg></g><path class="hero-star" d="${starPath}" transform="translate(405 94) scale(2.1) rotate(12)" fill="#e7cf91" stroke="#9c8b5d" stroke-width="1"/><path d="m437 165v11m-5-5h10M118 239l-6 8m-3-19 8 1" stroke="#b1a578" stroke-width="1.7" stroke-linecap="round"/><path d="M395 123q12 9 17 28" stroke="#b9b59d" stroke-width="1.4" stroke-dasharray="3 7" fill="none"/></svg>`;
    }
    const special = giftItems.slice(index * capacity, (index + 1) * capacity).some(isSpecial);
    $('hero-bottle').classList.toggle('has-super-lucky', special);
    const signature = `${n}:${index}:${special}`;
    if (signature === heroBottleSignature) return;
    $('hero-bottle').innerHTML = bottleSvg(n, index, 'gift', special).replace(/^<svg[^>]*>|<\/svg>$/g, '');
    heroBottleSignature = signature;
  }
  function entries(group) {
    if (group === 'gift') return giftItems.map(item => ({ ...item, kind: 'gift' }));
    return [...drops.map(day => ({ kind: 'legacy', id: day, at: day, expression: stableFace(`legacy:${day}`) })), ...vents.map(vent => ({ ...vent, kind: 'vent', expression: vent.expression || stableFace(`vent:${vent.id}`) }))]
      .sort((a, b) => a.at < b.at ? -1 : a.at > b.at ? 1 : 0);
  }
  function total() { return giftItems.length + vents.length + drops.length; }
  function bottleList(group) {
    const count = entries(group).length;
    return Array.from({ length: group === 'gift' ? Math.max(1, Math.ceil(count / capacity)) : Math.ceil(count / capacity) }, (_, index) => ({ group, index, count: Math.min(capacity, Math.max(0, count - index * capacity)) }));
  }
  function renderShelf(root) {
    root.replaceChildren();
    const home = root.id === 'home-shelves', pageKey = home ? 'home' : menuGroup;
    let bottles;
    if (home) {
      const gift = bottleList('gift'), self = bottleList('self'); bottles = [];
      for (let i = 0; i < Math.max(gift.length, self.length); i++) { if (gift[i]) bottles.push(gift[i]); if (self[i]) bottles.push(self[i]); }
    } else bottles = bottleList(menuGroup);
    const pageCount = Math.max(1, Math.ceil(bottles.length / pageSize));
    pages[pageKey] = Math.min(pages[pageKey], pageCount - 1);
    const grid = el('div', 'bottle-grid');
    bottles.slice(pages[pageKey] * pageSize, (pages[pageKey] + 1) * pageSize).forEach(({ group, index, count }) => {
      const button = el('button', `bottle-card${group === 'self' ? ' is-self' : ''}`); button.dataset.bottle = String(index); button.dataset.group = group;
      const special = entries(group).slice(index * capacity, (index + 1) * capacity).some(isSpecial);
      button.classList.toggle('has-super-lucky', special);
      button.setAttribute('aria-label', `${groupName(group)}第${index + 1}瓶，${count}滴小雨滴${special ? '，含超级幸运小雨滴' : ''}`);
      const drawing = el('span', 'bottle-drawing'); drawing.innerHTML = bottleSvg(count, index, group, special);
      const name = el('span', 'bottle-name');
      const mark = el('span', 'bottle-type'); mark.setAttribute('aria-hidden', 'true');
      mark.innerHTML = group === 'gift' ? '<svg viewBox="0 0 24 24"><path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M5 18c-6 0-6-9 0-9 0-7 11-9 14-2 7 0 7 11 0 11Z"/></svg>';
      name.append(mark, document.createTextNode(`第${index + 1}瓶`));
      button.append(drawing, name, el('span', 'bottle-amount', count ? `${count}滴${count === capacity ? ' · 满满一瓶' : ''}` : '第一滴，慢慢来'));
      button.addEventListener('click', () => { bottleSelection = { group, index }; showDialog('bottle-dialog'); }); grid.append(button);
    });
    if (bottles.length) root.append(grid); else root.append(el('p', 'empty-state', '这里暂时没有自己的心事雨滴，什么都不留下也可以。'));
    if (pageCount > 1) {
      const navigation = el('div', 'pagination'); navigation.setAttribute('aria-label', home ? '瓶架翻页' : `${groupName(menuGroup)}的瓶架翻页`);
      for (const direction of [-1, 1]) {
        const button = el('button', 'secondary', direction === -1 ? '上一页' : '下一页'); button.dataset.direction = String(direction);
        button.disabled = pages[pageKey] + direction < 0 || pages[pageKey] + direction >= pageCount;
        button.addEventListener('click', () => { pages[pageKey] += direction; renderCollections(); (root.querySelector('.pagination button:not(:disabled)') || root.querySelector('.bottle-card')).focus(); });
        navigation.append(button); if (direction === -1) navigation.append(el('span', 'tiny', `${pages[pageKey] + 1} / ${pageCount}`));
      }
      root.append(navigation);
    }
  }
  function renderCollections() {
    updateDailyEntry();
    $('drop-count').textContent = `已经留下${total()}滴小雨滴`;
    heroScene(); renderShelf($('home-shelves'));
    document.querySelectorAll('[data-collection-group]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.collectionGroup === menuGroup)); });
    if ($('collection-dialog').open) renderShelf($('collection-list'));
    $('collection-status').textContent = collectionUnreadable() ? readWarning : '';
    $('home-collection-status').textContent = $('collection-status').textContent;
    if ($('bottle-dialog').open) renderBottle();
  }
  function renderBottle() {
    if (!bottleSelection) return;
    const items = entries(bottleSelection.group);
    bottleSelection.index = Math.min(bottleSelection.index, Math.max(0, Math.ceil(items.length / capacity) - 1));
    const { group, index } = bottleSelection, contents = items.slice(index * capacity, (index + 1) * capacity);
    $('bottle-dialog-title').textContent = `${groupName(group)} · 第${index + 1}瓶`;
    $('bottle-intro').textContent = contents.length ? `${contents.length}滴小雨滴。点一滴，听听它带来的话。` : '这一瓶还空着，什么时候留下一滴都可以。';
    $('bottle-detail-art').classList.toggle('has-super-lucky', contents.some(isSpecial));
    $('bottle-detail-art').innerHTML = bottleSvg(contents.length, index, group, contents.some(isSpecial));
    const list = $('bottle-drops'); list.replaceChildren();
    contents.forEach((entry, position) => {
      const button = el('button', 'bottled-drop'); button.dataset.kind = entry.kind;
      button.classList.toggle('is-super-lucky', isSpecial(entry));
      const picture = el('span', 'bottled-picture'); picture.innerHTML = mascotSvg(entry.expression, false, isSpecial(entry));
      // Neither visible labels nor accessible names reveal personal writing.
      const label = isSpecial(entry) ? `超级幸运 · 第${position + 1}滴` : entry.kind === 'gift' ? (entry.text ? `送给你的 · 第${position + 1}滴` : '以前收下的一滴') : entry.kind === 'legacy' ? '以前留下的一滴' : `留给自己的 · 第${position + 1}滴`;
      button.append(picture, el('span', '', label));
      button.addEventListener('click', () => {
        if (entry.kind === 'gift') { showDialog('note-dialog'); showNote(entry, 'bottle'); }
        else { personal = entry; showDialog('personal-dialog'); }
      });
      list.append(button);
    });
    $('bottle-status').textContent = (group === 'gift' ? giftsUnreadable() : readProblems.has(keys.vents)) || (group === 'self' && readProblems.has(keys.drops)) ? readWarning : '';
  }
  function renderPersonal() {
    $('personal-dialog-title').textContent = personal.kind === 'legacy' ? '以前留下的一滴' : '留给自己的一滴';
    $('personal-mascot').innerHTML = mascotSvg(personal.expression);
    $('personal-date').textContent = personal.kind === 'legacy' ? personal.at : Number.isFinite(Date.parse(personal.at)) ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(new Date(personal.at)) : '以前留下的';
    $('personal-text').textContent = personal.kind === 'legacy' ? '这滴小雨滴来自旧版的一次主动留下，没有附带文字。' : personal.text;
    $('remove-confirm').hidden = true; $('personal-status').textContent = '';
  }

  function showDialog(id) {
    const dialog = $(id);
    if (dialog.open) return;
    returnFocus.set(dialog, document.activeElement); clearArtEffect();
    if (id === 'note-dialog') resetPicker();
    if (id === 'collection-dialog') { renderShelf($('collection-list')); $('collection-status').textContent = collectionUnreadable() ? readWarning : ''; }
    if (id === 'bottle-dialog') renderBottle();
    if (id === 'personal-dialog') renderPersonal();
    if (id === 'future-dialog') renderLetters();
    if (id === 'vent-dialog') $('vent-status').textContent = readProblems.has(keys.vents) ? readWarning : '';
    if (id === 'quiet-dialog') {
      const foreground = $('quiet-foreground');
      if (!foreground.hasAttribute('href')) foreground.setAttribute('href', foreground.dataset.src);
    }
    dialogStack.push(dialog); dialog.showModal();
    if (['note-dialog', 'vent-dialog', 'quiet-dialog'].includes(id)) write(keys.visited, true);
    if (id === 'quiet-dialog') updateRain();
    dialog.querySelector('[data-close]').focus();
  }
  document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => showDialog(button.dataset.open)));
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('close', () => {
      const index = dialogStack.indexOf(dialog); if (index !== -1) dialogStack.splice(index, 1);
      const opener = returnFocus.get(dialog), top = dialogStack.at(-1);
      if (opener?.isConnected && opener.getClientRects().length && (!top || top.contains(opener))) opener.focus();
      else (top?.querySelector('[data-close]') || $('open-daily')).focus();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Tab') return;
      const controls = [...dialog.querySelectorAll('button, input, textarea, a[href], [tabindex="0"]')].filter(node => !node.disabled && node.getClientRects().length);
      if (!controls.length) return;
      const index = controls.indexOf(document.activeElement), next = event.shiftKey ? (index <= 0 ? controls.length - 1 : index - 1) : (index + 1) % controls.length;
      event.preventDefault(); controls[next].focus();
    });
    let startedOutside = false;
    const outside = event => { const rect = dialog.getBoundingClientRect(); return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom; };
    dialog.addEventListener('pointerdown', event => { startedOutside = event.target === dialog && outside(event); });
    dialog.addEventListener('click', event => { if (startedOutside && event.target === dialog && outside(event)) dialog.close(); startedOutside = false; });
  });
  document.querySelectorAll('[data-nickname]').forEach(node => { node.textContent = content.profile.nickname; });
  document.title = `${content.profile.nickname}的小瓶子`;
  $('secret-dialog-title').textContent = content.secret.title;
  $('secret-text').textContent = content.secret.text; $('secret-sign').textContent = copy.secretSign;
  $('footer-note').textContent = copy.footer; $('picker-hint').textContent = copy.pickerHint; $('package-label').textContent = copy.packageLabel;
  if (returning) { document.body.classList.add('is-returning'); $('hero-title').textContent = `${content.profile.nickname}，欢迎回来～`; $('hero-intro').textContent = '想接一点小幸运，还是再坐一会儿？'; }
  $('open-secret').addEventListener('click', () => showDialog('secret-dialog'));
  document.querySelectorAll('[data-collection-group]').forEach(button => button.addEventListener('click', () => { menuGroup = button.dataset.collectionGroup; renderCollections(); }));
  const dailyMessages = [...messages].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  function dailyNote() {
    const now = new Date(), day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    return dailyMessages[((day % dailyMessages.length) + dailyMessages.length) % dailyMessages.length];
  }
  function localDay(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
  function updateDailyEntry() {
    const saved = !giftsUnreadable() && giftItems.some(item => item.id === `daily:${localDay()}`);
    $('daily-label').textContent = saved ? '看看今天留下的这一滴' : '接住今天这一滴';
    $('daily-hint').textContent = saved ? '已经好好留在瓶子里了，随时可以再看看。' : '今天这一滴，接住就替你留在瓶子里。';
  }
  function refreshDailyEntry() {
    giftItems = loadGifts(giftItems);
    updateDailyEntry();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDailyEntry(); });
  window.addEventListener('pageshow', refreshDailyEntry);
  window.addEventListener('focus', refreshDailyEntry);
  let dailyTimer;
  function scheduleDailyRefresh() {
    clearTimeout(dailyTimer);
    const now = new Date(), midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    dailyTimer = setTimeout(() => { refreshDailyEntry(); scheduleDailyRefresh(); }, Math.max(1, midnight - now));
  }
  scheduleDailyRefresh();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleDailyRefresh(); });
  function openDaily() {
    showDialog('note-dialog'); giftItems = loadGifts(giftItems);
    updateDailyEntry();
    const day = localDay(), id = `daily:${day}`, existing = giftItems.find(item => item.id === id);
    if (existing) { showNote(existing, 'daily'); return; }
    const special = Boolean(luckyContent && messages.length && dayIsLucky(day)), message = special ? luckyContent : dailyNote();
    if (!message) { showNote(null, 'daily'); return; }
    const entry = { id, source: 'daily', day, messageId: message.id, text: message.text, expression: stableFace(id), ...(special ? { special: 'super-lucky' } : {}) };
    startCatch(entry.expression, entry);
  }
  $('open-daily').addEventListener('click', openDaily);
  // Each discovery has one action, a short motion and one shared response.
  // No discovery mutates a collection or sends anything outside this page.
  const artActions = new Set(['box', 'letter', 'flower', 'heart', 'star', 'sheep', 'footer-star']);
  function clearArtMessage() {
    clearTimeout(artMessageTimer); artMessageTimer = null;
    $('art-message').textContent = ''; $('sheep-bubble').hidden = true;
    $('closing-star-status').textContent = ''; $('closing-star').classList.remove('is-lit');
  }
  function clearArtEffect(clearMessage = true) {
    clearBrandEffect();
    clearTimeout(artTimer); artTimer = null;
    $('art-stage').removeAttribute('data-effect'); $('art-stage').classList.remove('is-sparkling');
    $('art-effects').replaceChildren();
    $('closing-star').classList.remove('is-shining');
    if (clearMessage) clearArtMessage();
  }
  function playArtEffect(kind, button) {
    if (!artActions.has(kind) || document.hidden) return;
    clearArtEffect();
    if (kind === 'sheep') $('sheep-bubble').hidden = false;
    else if (kind === 'footer-star') $('closing-star-status').textContent = copy.footerStar;
    else $('art-message').textContent = copy[kind];
    artMessageTimer = setTimeout(clearArtMessage, 4000);
    if (kind === 'footer-star') {
      $('closing-star').classList.add('is-lit');
      void $('closing-star').offsetWidth;
      if (!reducedMotion.matches) $('closing-star').classList.add('is-shining');
      artTimer = setTimeout(() => clearArtEffect(false), 2100);
      return;
    }
    if (reducedMotion.matches) return;
    // Flush the removed state so repeating the same object restarts its motion.
    void $('art-stage').offsetWidth;
    $('art-stage').dataset.effect = kind;
    if (kind === 'star') $('art-stage').classList.add('is-sparkling');
    if (kind === 'flower' || kind === 'heart') {
      const origin = button.getBoundingClientRect();
      const count = kind === 'flower' ? 16 : 5;
      for (let i = 0; i < count; i++) {
        const particle = el('span', kind === 'flower' ? 'desk-petal' : 'desk-heart');
        particle.style.left = kind === 'flower' ? `${3 + (i * 37) % 94}%` : `${origin.left + origin.width / 2 - 8}px`;
        if (kind === 'heart') particle.style.top = `${origin.top + origin.height / 2}px`;
        particle.style.setProperty('--drift', `${kind === 'flower' ? (i % 2 ? 1 : -1) * (20 + i * 3) : (i - 2) * 14}px`);
        particle.style.setProperty('--turn', `${90 + i * 31}deg`);
        particle.style.setProperty('--petal', ['#e4b191', '#d1bca1', '#d6b0a5', '#b6c09c'][i % 4]);
        particle.style.animationDelay = `${kind === 'flower' ? ((i * 7) % 11) * .04 : i * .04}s`;
        if (kind === 'flower') particle.style.animationDuration = `${1.3 + (i % 4) * .07}s`;
        if (kind === 'heart') particle.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13Z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
        $('art-effects').append(particle);
      }
    }
    artTimer = setTimeout(() => clearArtEffect(false), 2100);
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-art]');
    if (button && ($('art-stage').contains(button) || button.id === 'closing-star')) playArtEffect(button.dataset.art, button);
  });
  function clearBrandEffect() {
    clearTimeout(brandResetTimer); clearTimeout(brandMotionTimer); clearTimeout(brandStarsTimer);
    brandCount = 0; lastBrandTap = -Infinity;
    $('brand-bottle').classList.remove('is-shaking', 'has-stars'); $('brand-status').textContent = '';
  }
  $('brand-bottle').addEventListener('click', () => {
    if (document.hidden || dialogStack.length) return;
    const now = Date.now();
    if (now - lastBrandTap > 2000) brandCount = 0;
    lastBrandTap = now; brandCount++;
    clearTimeout(brandResetTimer); clearTimeout(brandMotionTimer);
    const button = $('brand-bottle'); button.classList.remove('is-shaking');
    if (!reducedMotion.matches) { void button.offsetWidth; button.classList.add('is-shaking'); }
    brandMotionTimer = setTimeout(() => button.classList.remove('is-shaking'), 450);
    if (brandCount >= 3) {
      brandCount = 0; lastBrandTap = -Infinity;
      clearTimeout(brandStarsTimer); button.classList.remove('has-stars'); void button.offsetWidth; button.classList.add('has-stars');
      $('brand-status').textContent = '摇出了一点小星光。✨';
      brandStarsTimer = setTimeout(() => { button.classList.remove('has-stars'); $('brand-status').textContent = ''; }, 1400);
    } else brandResetTimer = setTimeout(() => { brandCount = 0; lastBrandTap = -Infinity; }, 2001);
  });
  function stopLuckyCelebration() {
    clearTimeout(luckyTimer); luckyTimer = null;
    const layer = $('lucky-celebration');
    if (typeof layer.hidePopover === 'function' && layer.matches(':popover-open')) layer.hidePopover();
    layer.classList.remove('is-celebrating'); layer.replaceChildren();
    $('note-dialog').classList.remove('has-lucky-celebration');
  }
  function celebrateLucky() {
    stopLuckyCelebration();
    if (document.hidden || !$('note-dialog').open) return;
    const layer = $('lucky-celebration');
    $('note-dialog').classList.add('has-lucky-celebration');
    layer.classList.add('is-celebrating');
    for (let i = 0; i < 36; i++) {
      const star = el('span', 'lucky-particle');
      star.innerHTML = '<svg viewBox="0 0 24 24"><path d="m12 1 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1Z"/></svg>';
      star.style.left = `${3 + i * 37 % 94}%`; star.style.top = `${4 + i * 29 % 90}%`;
      star.style.setProperty('--turn', `${i * 41 % 100 - 50}deg`); star.style.setProperty('--delay', `${i % 6 * .055}s`);
      star.style.setProperty('--size', `${12 + i % 5 * 5}px`); layer.append(star);
    }
    // A non-modal top-layer popover paints above the reader without taking focus.
    if (typeof layer.showPopover === 'function') layer.showPopover();
    luckyTimer = setTimeout(stopLuckyCelebration, 2400);
  }
  $('note-dialog').addEventListener('close', stopLuckyCelebration);
  document.body.classList.toggle('page-hidden', document.hidden);
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('page-hidden', document.hidden);
    if (document.hidden) { stopLuckyCelebration(); clearBrandEffect(); }
  });
  reducedMotion.addEventListener('change', () => { stopLuckyCelebration(); clearBrandEffect(); });
  function cancelNoteReveal() {
    clearTimeout(noteTimer); noteTimer = null; noteBusy = false; pendingCatch = null; noteVersion++;
    $('note-dialog').removeAttribute('aria-busy'); $('catch-panel').classList.remove('is-catching');
  }
  function resetPicker() {
    stopLuckyCelebration(); $('note-reader').classList.remove('is-super-lucky'); $('lucky-date').hidden = true; $('lucky-date').textContent = '';
    cancelNoteReveal(); readerMode = 'random'; $('note-picker').hidden = false; $('note-reader').hidden = true; $('catch-panel').hidden = true;
    $('note-dialog-title').textContent = copy.pickerTitle; $('note-status').textContent = messages.length ? '' : '这里暂时还没有小雨滴，先坐一会儿吧。'; $('note-text').textContent = ''; $('reader-mascot').replaceChildren();
    const choices = [...faceIds];
    for (let i = choices.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [choices[i], choices[j]] = [choices[j], choices[i]]; }
    const picker = document.querySelector('.picker-scene'); picker.replaceChildren();
    choices.slice(0, 3).forEach(expression => {
      const button = el('button', 'pick-drop'); button.dataset.expression = expression; button.disabled = !messages.length;
      button.setAttribute('aria-label', `接住${faceNames[expression]}的小雨滴`); button.innerHTML = mascotSvg(expression);
      button.addEventListener('click', () => startCatch(expression)); picker.append(button);
    });
    $('note-dialog').querySelector('.dialog-body').scrollTop = 0;
  }
  function completeCatch(version) {
    if (!pendingCatch || version !== noteVersion || !$('note-dialog').open) return;
    const { expression, dailyEntry } = pendingCatch;
    cancelNoteReveal();
    if (document.hidden) {
      if (dailyEntry) showNote(dailyEntry, 'daily'); else resetPicker();
      $('note-status').textContent = '刚才先暂停了，回来后再接住也可以。'; return;
    }
    if (dailyEntry) {
      current = dailyEntry;
      const status = el('p'); const saved = saveGift(dailyEntry, status);
      showNote(current, 'daily');
      if (!saved) $('note-status').textContent = status.textContent;
      renderCollections();
      if (isSpecial(current)) celebrateLucky();
    } else nextNote(expression);
  }
  function startCatch(expression, dailyEntry = null) {
    if (noteBusy || !$('note-dialog').open || (!dailyEntry && !messages.length)) return;
    cancelNoteReveal(); noteBusy = true; readerMode = dailyEntry ? 'daily' : 'random';
    const version = ++noteVersion; pendingCatch = { expression, dailyEntry };
    $('note-dialog').setAttribute('aria-busy', 'true'); $('note-picker').hidden = true; $('note-reader').hidden = true; $('catch-panel').hidden = false;
    $('note-dialog-title').textContent = dailyEntry ? '接住今天这一滴' : '轻轻接住这一滴';
    $('note-status').textContent = ''; $('catch-scene').innerHTML = art.catching(expression);
    $('note-dialog').querySelector('.dialog-body').scrollTop = 0;
    if (reducedMotion.matches) completeCatch(version);
    else { $('catch-panel').classList.add('is-catching'); noteTimer = setTimeout(() => completeCatch(version), 1300); }
  }
  function nextNote(expression) {
    if (luckyContent && luckyHit(Math.random())) {
      const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${++luckySequence}`;
      showNote({ id: `lucky:${id}`, source: 'lucky', messageId: luckyContent.id, text: luckyContent.text, expression, at: new Date().toISOString(), special: 'super-lucky' }, 'random');
      celebrateLucky(); return;
    }
    if (!bag.length) { bag = [...messages]; for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; } }
    const last = bag.length - 1;
    if (bag.length > 1 && [current?.messageId, lastRandomId].includes(bag[last].id)) {
      let other = bag.findIndex(message => message.id !== current?.messageId && message.id !== lastRandomId);
      if (other < 0) other = bag.findIndex(message => message.id !== current?.messageId);
      if (other >= 0) [bag[other], bag[last]] = [bag[last], bag[other]];
    }
    let message, repeat = false;
    if (bag[last]?.id === current?.messageId && messages.length > 1) { message = messages.find(message => message.id !== current.messageId); repeat = true; }
    else { message = bag.pop(); lastRandomId = message?.id; }
    const entry = message ? { id: `message:${message.id}`, source: 'message', messageId: message.id, text: message.text, expression } : null;
    showNote(entry, 'random', repeat ? '这一滴，陪你再听一遍' : undefined);
  }
  function showNote(entry, mode = 'random', title) {
    stopLuckyCelebration();
    current = entry; readerMode = mode; $('note-picker').hidden = true; $('note-reader').hidden = false; $('catch-panel').hidden = true;
    $('note-reader').classList.toggle('is-super-lucky', isSpecial(entry));
    $('note-dialog-title').textContent = title || (isSpecial(entry) ? '超级幸运小雨滴' : entry?.source === 'daily' ? `${entry.day === localDay() ? '今天' : entry.day}这一滴，留给你` : copy.readerTitle);
    $('note-text').textContent = entry?.text ?? (entry ? '这一滴带来的话暂时不在当前内容里，原来的收藏仍为你留着。' : '这里暂时还没有小雨滴，先坐一会儿吧。');
    $('reader-mascot').innerHTML = mascotSvg(entry?.expression || 'smile', false, isSpecial(entry));
    $('lucky-date').hidden = !isSpecial(entry);
    $('lucky-date').textContent = isSpecial(entry) ? `相遇于 ${entry.source === 'daily' ? entry.day : new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(entry.at))}` : '';
    $('note-status').textContent = ''; updateFavorite();
    if (mode === 'daily' && giftItems.some(item => item.id === entry?.id)) $('note-status').textContent = isSpecial(entry) ? '超级幸运已放进瓶子里。✨' : '这一滴，已经替你留在瓶子里。';
  }
  function updateFavorite() {
    const saved = Boolean(current && giftItems.some(item => item.id === current.id));
    $('save-note').hidden = readerMode !== 'random'; $('save-note').disabled = !current || saved; $('save-note').textContent = saved ? '已经在瓶子里' : '存下这一滴';
    $('next-note').hidden = readerMode !== 'random'; $('next-note').disabled = !messages.length;
    $('go-random').hidden = readerMode !== 'daily'; $('retry-daily').hidden = readerMode !== 'daily' || !current || saved;
    $('reader-close').hidden = readerMode !== 'bottle'; $('remove-note').hidden = !saved || readerMode === 'daily';
  }
  function changeFavorite(remove = false) {
    if (!current) return;
    const status = $('note-status');
    if (remove) {
      const latest = loadGifts(giftItems);
      if (giftsUnreadable()) { status.textContent = readWarning; return; }
      const next = latest.filter(item => item.id !== current.id);
      if (!write(keys.gifts, { version: 2, items: next }, status)) return;
      giftItems = next; giftStoreExists = true;
    } else if (!saveGift(current, status)) return;
    updateFavorite(); renderCollections();
    status.textContent = remove ? '这一滴已经取出，想念时还可以再接住。' : isSpecial(current) ? '超级幸运已放进瓶子里。✨' : '存好了，表情也一起留在瓶子里。💧';
    if (readerMode === 'random') (remove ? $('save-note') : $('next-note')).focus();
    else if (readerMode === 'daily') $('go-random').focus();
    else if (remove) $('reader-close').focus();
  }
  $('next-note').addEventListener('click', () => { resetPicker(); document.querySelector('.pick-drop:not(:disabled)')?.focus(); });
  $('go-random').addEventListener('click', () => { resetPicker(); document.querySelector('.pick-drop:not(:disabled)')?.focus(); });
  $('retry-daily').addEventListener('click', () => { if (current && readerMode === 'daily') changeFavorite(); });
  $('note-dialog').addEventListener('close', resetPicker);
  $('save-note').addEventListener('click', () => changeFavorite()); $('remove-note').addEventListener('click', () => changeFavorite(true));

  $('remove-personal').addEventListener('click', () => { $('remove-confirm').hidden = false; $('cancel-remove').focus(); });
  $('cancel-remove').addEventListener('click', () => { $('remove-confirm').hidden = true; $('remove-personal').focus(); });
  $('confirm-remove').addEventListener('click', () => {
    if (!personal) return;
    if (personal.kind === 'vent') {
      vents = read(keys.vents, isVents, vents, []);
      const next = vents.filter(vent => vent.id !== personal.id);
      if (!write(keys.vents, next, $('personal-status'))) return;
      vents = next;
    } else {
      drops = [...new Set(read(keys.drops, isDays, drops, []))];
      const next = drops.filter(day => day !== personal.id);
      if (!write(keys.drops, next, $('personal-status'))) return;
      drops = next;
    }
    renderCollections(); $('personal-dialog').close();
  });
  $('personal-dialog').addEventListener('close', () => { $('personal-text').textContent = ''; $('personal-date').textContent = ''; personal = null; });
  function updateVentButton() { $('throw-vent').textContent = $('save-vent').checked ? '放进自己的瓶子' : '让小雨滴带走'; }
  $('save-vent').addEventListener('change', updateVentButton);
  function departureSvg() { return art.departure(); }
  function finishDeparture() {
    clearTimeout(journeyTimer); journeyTimer = null;
    $('departure-scene').classList.remove('is-travelling');
    if (!$('departure-scene').classList.contains('is-static')) $('departure-scene').classList.add('is-complete');
    $('skip-departure').hidden = true;
    if (document.activeElement === $('skip-departure') && $('vent-dialog').open) $('another-vent').focus();
  }
  function resetVentResult() {
    finishDeparture(); submitting = false; $('vent-form').hidden = false; $('vent-result').hidden = true;
    $('save-vent').checked = false; updateVentButton(); $('vent-status').textContent = '';
  }
  $('throw-vent').addEventListener('click', () => {
    if (submitting) return;
    const input = $('vent-text'), text = input.value.trim(), keep = $('save-vent').checked;
    if (!text) { $('vent-status').textContent = '什么都不说也可以，小雨滴就在这里陪你坐会儿。'; return; }
    if (keep) {
      vents = read(keys.vents, isVents, vents, []);
      const next = [...vents, { id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`, text, at: new Date().toISOString(), expression: faceIds[Math.floor(Math.random() * faceIds.length)] }];
      if (!write(keys.vents, next, $('vent-status'))) return;
      vents = next;
    }
    submitting = true; input.value = ''; $('save-vent').checked = false; updateVentButton(); $('vent-status').textContent = '';
    $('vent-form').hidden = true; $('vent-result').hidden = false;
    $('departure-scene').hidden = keep; $('saved-scene').hidden = !keep;
    $('vent-result-copy').textContent = keep ? '这一滴，已经放进“留给自己的”瓶子里。' : '小雨滴带着你的小情绪远行啦。';
    if (keep) { $('saved-scene').innerHTML = bottleSvg(vents.length + drops.length ? ((vents.length + drops.length - 1) % capacity) + 1 : 0, Math.floor((vents.length + drops.length - 1) / capacity), 'self'); renderCollections(); }
    else {
      $('departure-scene').classList.remove('is-complete', 'is-static'); $('departure-scene').innerHTML = departureSvg();
      if (!reducedMotion.matches && !document.hidden) { $('departure-scene').classList.add('is-travelling'); $('skip-departure').hidden = false; journeyTimer = setTimeout(finishDeparture, 5000); }
      else { $('departure-scene').classList.add('is-static'); finishDeparture(); }
    }
    $('another-vent').focus();
  });
  $('skip-departure').addEventListener('click', finishDeparture);
  $('another-vent').addEventListener('click', () => { resetVentResult(); $('vent-text').focus(); });
  $('vent-dialog').addEventListener('close', () => { if (submitting) resetVentResult(); else { finishDeparture(); $('save-vent').checked = false; updateVentButton(); } });
  $('show-vents').addEventListener('click', () => {
    pages.self = Math.max(0, Math.ceil(entries('self').length / (capacity * pageSize)) - 1);
    menuGroup = 'self'; showDialog('collection-dialog'); renderCollections();
    $('collection-list').querySelector('.bottle-card')?.focus();
  });
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) { clearArtEffect(false); finishDeparture(); }
    if (noteBusy) completeCatch(noteVersion);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearArtEffect(); finishDeparture(); } });
  window.addEventListener('storage', event => {
    if (event.key === keys.favorites || event.key === keys.gifts || event.key === null) giftItems = loadGifts(giftItems);
    if (event.key === keys.vents || event.key === null) vents = read(keys.vents, isVents, vents, []);
    if (event.key === keys.drops || event.key === null) drops = [...new Set(read(keys.drops, isDays, drops, []))];
    if ($('note-dialog').open && readerMode === 'daily' && !noteBusy) {
      const saved = giftItems.find(item => item.id === current?.id);
      if (saved) showNote(saved, 'daily');
    }
    updateFavorite(); renderCollections();
    if ($('personal-dialog').open && personal) {
      const updated = entries('self').find(entry => entry.kind === personal.kind && entry.id === personal.id);
      if (!updated) $('personal-dialog').close();
    }
  });
  // A backup contains only persisted collection records, never drafts or preferences.
  const backupFormat = 'lucky-xinxin-backup';
  let backupPreview = null, backupJob = 0;
  const cleanGift = item => ({ id: item.id, source: item.source, ...(item.source === 'daily' ? { day: item.day } : {}), ...(item.source === 'lucky' ? { at: item.at } : {}), messageId: item.messageId, text: item.text, expression: item.expression, ...(isSpecial(item) ? { special: 'super-lucky' } : {}) });
  const cleanVent = item => ({ id: item.id, text: item.text, at: item.at, ...(item.expression === undefined ? {} : { expression: item.expression }) });
  const uniqueIds = items => new Set(items.map(item => item.id)).size === items.length;
  function readBackupRecords() {
    const gifts = loadGifts(giftItems);
    const savedVents = read(keys.vents, isVents, []);
    const savedDays = read(keys.drops, isDays, []);
    if (collectionUnreadable() || !uniqueIds(savedVents)) throw new Error('暂时无法完整读取本地记录，已停止备份或恢复，原来的记录不会被覆盖。');
    return { gifts: gifts.map(cleanGift), vents: savedVents.map(cleanVent), legacyDays: [...new Set(savedDays)] };
  }
  function parseBackup(text) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('这段文字不是完整的备份，请粘贴复制出来的全部内容。'); }
    if (!data || data.format !== backupFormat) throw new Error('这不是小瓶子的备份，请检查粘贴的内容。');
    if (data.version !== 1) throw new Error('暂时不支持这个备份版本，原来的记录没有改变。');
    if (typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)) ||
        !isGiftStore({ version: 2, items: data.gifts }) || !isVents(data.vents) || !uniqueIds(data.vents) ||
        !isDays(data.legacyDays) || new Set(data.legacyDays).size !== data.legacyDays.length) {
      throw new Error('备份里的记录不完整或格式有误，原来的记录没有改变。');
    }
    return { gifts: data.gifts.map(cleanGift), vents: data.vents.map(cleanVent), legacyDays: [...data.legacyDays] };
  }
  function mergeBackup(existing, incoming) {
    const merge = (a, b, identity) => {
      const ids = new Set(a.map(identity));
      return [...a, ...b.filter(item => !ids.has(identity(item)))];
    };
    return {
      gifts: merge(existing.gifts, incoming.gifts, item => item.id),
      vents: merge(existing.vents, incoming.vents, item => item.id),
      legacyDays: merge(existing.legacyDays, incoming.legacyDays, day => day)
    };
  }
  function clearBackupPreview() {
    backupPreview = null; $('backup-summary').replaceChildren(); $('backup-confirm').hidden = true;
  }
  function previewBackup() {
    clearBackupPreview();
    try {
      const incoming = parseBackup($('backup-input').value), existing = readBackupRecords();
      const merged = mergeBackup(existing, incoming);
      const list = el('ul');
      const groups = [
        ['普通赠言', incoming.gifts.filter(item => item.source === 'message'), existing.gifts, item => item.id],
        ['今日雨滴', incoming.gifts.filter(item => item.source === 'daily' && !isSpecial(item)), existing.gifts, item => item.id],
        ['超级幸运', incoming.gifts.filter(isSpecial), existing.gifts, item => item.id],
        ['自己的心事', incoming.vents, existing.vents, item => item.id],
        ['旧日期记录', incoming.legacyDays, existing.legacyDays, day => day]
      ];
      for (const [label, items, saved, identity] of groups) {
        const ids = new Set(saved.map(identity)), repeated = items.filter(item => ids.has(identity(item))).length;
        list.append(el('li', '', `${label}：新增 ${items.length - repeated}，重复 ${repeated}`));
      }
      $('backup-summary').append(list, el('p', 'tiny', '重复记录会跳过，瓶子里原有的内容会保留。'));
      backupPreview = { existing, merged };
      $('backup-confirm').hidden = false;
      $('backup-status').textContent = '已经检查好了，确认数量后就可以合并。';
    } catch (error) { $('backup-status').textContent = error.message; }
  }
  function reloadCollections() {
    giftItems = loadGifts(giftItems);
    vents = read(keys.vents, isVents, vents, []);
    drops = [...new Set(read(keys.drops, isDays, drops, []))];
    updateFavorite(); renderCollections();
  }
  $('backup-copy').addEventListener('click', async () => {
    showDialog('backup-dialog');
    const job = ++backupJob;
    $('backup-title').textContent = '备份我的小瓶子';
    $('backup-restore-panel').hidden = true;
    let text;
    try {
      const records = readBackupRecords();
      text = JSON.stringify({ format: backupFormat, version: 1, exportedAt: new Date().toISOString(), ...records }, null, 2);
    } catch (error) { $('backup-status').textContent = error.message; return; }
    $('backup-status').textContent = '正在复制……';
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(text);
      if (job === backupJob && $('backup-dialog').open) $('backup-status').textContent = '已复制，可以粘贴到备忘录保存。🌿';
    } catch {
      if (job !== backupJob || !$('backup-dialog').open) return;
      $('backup-output-panel').hidden = false; $('backup-output').value = text;
      $('backup-status').textContent = '浏览器没能自动复制，请在下面全选文字，手动复制保存。';
      $('backup-output').focus(); $('backup-output').select();
    }
  });
  $('backup-restore').addEventListener('click', () => {
    showDialog('backup-dialog');
    $('backup-title').textContent = '把小雨滴放回瓶子';
    $('backup-restore-panel').hidden = false;
    $('backup-input').focus();
  });
  $('backup-select').addEventListener('click', () => { $('backup-output').focus(); $('backup-output').select(); });
  $('backup-input').addEventListener('input', () => { clearBackupPreview(); $('backup-status').textContent = ''; });
  $('backup-check').addEventListener('click', previewBackup);
  $('backup-confirm').addEventListener('click', () => {
    if (!backupPreview) return;
    let existing;
    try { existing = readBackupRecords(); }
    catch (error) { clearBackupPreview(); $('backup-status').textContent = error.message; return; }
    if (JSON.stringify(existing) !== JSON.stringify(backupPreview.existing)) {
      previewBackup();
      if (backupPreview) $('backup-status').textContent = '本地记录刚刚有变化，请核对更新后的数量，再点击合并。';
      return;
    }
    const merged = backupPreview.merged;
    const changes = [
      ['gifts', keys.gifts, { version: 2, items: merged.gifts }],
      ['vents', keys.vents, merged.vents],
      ['legacyDays', keys.drops, merged.legacyDays]
    ].filter(([name]) => JSON.stringify(existing[name]) !== JSON.stringify(merged[name]));
    let operations;
    try { operations = changes.map(([, key, value]) => ({ key, before: localStorage.getItem(key), after: JSON.stringify(value) })); }
    catch { clearBackupPreview(); $('backup-status').textContent = '暂时无法读取本地记录，已停止恢复。粘贴的备份仍为你保留。'; return; }
    const attempted = [];
    try {
      for (const operation of operations) { attempted.push(operation); localStorage.setItem(operation.key, operation.after); }
    } catch {
      // Storage has no multi-key transaction. Restore only values written by this attempt;
      // do not overwrite a concurrent change from another tab during rollback.
      let rolledBack = true;
      for (const operation of attempted.reverse()) {
        try {
          const now = localStorage.getItem(operation.key);
          if (now === operation.before) continue;
          if (now !== operation.after) { rolledBack = false; continue; }
          if (operation.before === null) localStorage.removeItem(operation.key);
          else localStorage.setItem(operation.key, operation.before);
        } catch { rolledBack = false; }
      }
      clearBackupPreview(); reloadCollections();
      $('backup-status').textContent = rolledBack ? '这次没能恢复，已回滚本次写入。粘贴的备份仍为你保留，可以检查后重试。' : '恢复未完成，部分记录未能回滚。请保留这份备份，检查瓶子里的记录后重试。';
      return;
    }
    const added = merged.gifts.length + merged.vents.length + merged.legacyDays.length - existing.gifts.length - existing.vents.length - existing.legacyDays.length;
    clearBackupPreview(); reloadCollections();
    $('backup-status').textContent = added ? `合并好了，新留下 ${added} 滴小雨滴。💧` : '这些小雨滴都已经在瓶子里了，没有重复添加。';
  });
  $('backup-dialog').addEventListener('close', () => {
    backupJob++; clearBackupPreview();
    $('backup-output').value = ''; $('backup-input').value = ''; $('backup-status').textContent = '';
    $('backup-output-panel').hidden = true; $('backup-restore-panel').hidden = true;
  });

  resetPicker(); renderCollections();

  const quietCopy = content.quiet;
  $('quiet-foreground').addEventListener('load', () => $('quiet-scene').classList.add('has-reading-art'));
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
    if (readProblems.has(keys.weather) || readProblems.has(keys.paused)) $('quiet-storage-status').textContent = quietCopy.temporary;
  }
  function persistQuiet(key, value) {
    if (readProblems.has(key)) { $('quiet-storage-status').textContent = quietCopy.temporary; return; }
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
      p.textContent = unlocked ? letter.text : `${new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(letter.unlockAt))}（设备当地时间）之后，就可以遇见这一滴了。`;
      article.append(title, p); container.append(article);
    });
  }
  // Recheck dates when returning to the page, and while the letter drawer is open.
  document.addEventListener('visibilitychange', () => { if (!document.hidden && $('future-dialog').open) renderLetters(); });
  setInterval(() => { if ($('future-dialog').open) renderLetters(); }, 30000);
})();
