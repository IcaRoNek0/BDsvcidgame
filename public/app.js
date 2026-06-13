/* ============================================
   百度街景车 ID 辨认游戏 - 前端主程序
   原生 JavaScript（ES6+），IndexedDB 题库存储
   ============================================ */

(function () {
  'use strict';

  // =============================================
  // 配置常量
  // =============================================
  const DB_NAME = 'StreetviewGameDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'questionBanks';
  const DEFAULT_BANK_NAME = '三代白低相机';
  const SETTINGS_KEY = 'streetview_settings';
  const LAST_BANK_KEY = 'streetview_last_bank';

  // 默认 panoid（从服务器 default.txt 加载）
  let DEFAULT_PANOIDS = [];

  // =============================================
  // DOM 引用
  // =============================================
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    // 导航
    navBtns: $$('.nav-btn'),

    // 页面
    pageGame: $('#page-game'),
    pageBank: $('#page-bank'),
    pageSettings: $('#page-settings'),

    // 游戏 - 开始
    gameStart: $('#game-start'),
    bankSelect: $('#bank-select'),
    btnStart: $('#btn-start'),

    // 游戏 - 进行中
    gamePlaying: $('#game-playing'),
    gameProgress: $('#game-progress'),
    gameScore: $('#game-score'),
    btnEnd: $('#btn-end'),
    streetviewImg: $('#streetview-img'),
    imgLoading: $('#img-loading'),
    answerInput: $('#answer-input'),
    btnSubmit: $('#btn-submit'),
    answerFeedback: $('#answer-feedback'),

    // 游戏 - 结束
    gameEnd: $('#game-end'),
    resultText: $('#result-text'),
    resultDetail: $('#result-detail'),
    btnBackStart: $('#btn-back-start'),

    // 题库管理
    bankList: $('#bank-list'),
    btnCreateBank: $('#btn-create-bank'),

    // 题库编辑弹窗
    bankEditorModal: $('#bank-editor-modal'),
    bankEditorTitle: $('#bank-editor-title'),
    editorBankName: $('#editor-bank-name'),
    btnRenameBank: $('#btn-rename-bank'),
    editorImportText: $('#editor-import-text'),
    btnImportPanoids: $('#btn-import-panoids'),
    editorPanoidCount: $('#editor-panoid-count'),
    editorPanoidList: $('#editor-panoid-list'),
    modalCloseBtns: $$('.modal-close'),

    // 图片查看模态框
    imageModal: null,
    modalImg: null,

    // 设置
    settingCaseSensitive: $('#setting-case-sensitive'),
    bgUpload: $('#bg-upload'),
    btnResetBg: $('#btn-reset-bg'),
  };

  // =============================================
  // 游戏状态
  // =============================================
  const gameState = {
    bank: [],
    queue: [],
    currentIndex: -1,
    correctCount: 0,
    answeredCount: 0,
    isPlaying: false,
    currentImgUrl: null,
    currentPanoid: null,
    results: [],
  };

  // =============================================
  // IndexedDB 封装
  // =============================================
  const db = {};

  // 打开数据库
  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('name', 'name', { unique: false });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // 获取所有题库
  async function getAllBanks() {
    const conn = await openDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 添加题库
  async function addBank(bank) {
    const conn = await openDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.add(bank);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 更新题库
  async function updateBank(bank) {
    const conn = await openDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(bank);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // 删除题库
  async function deleteBank(id) {
    const conn = await openDB();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // 从服务器加载默认题库文件
  async function loadDefaultPanoids() {
    try {
      const resp = await fetch('default.txt');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
      DEFAULT_PANOIDS = lines;
      console.log(`Loaded ${lines.length} default panoids from default.txt`);
    } catch (err) {
      console.error('Failed to load default.txt:', err);
      DEFAULT_PANOIDS = [];
    }
  }

  // 初始化默认题库
  async function initDefaultBank() {
    await loadDefaultPanoids();
    const banks = await getAllBanks();
    const hasDefault = banks.some(b => b.name === DEFAULT_BANK_NAME);
    if (!hasDefault && DEFAULT_PANOIDS.length > 0) {
      await addBank({
        name: DEFAULT_BANK_NAME,
        panoids: [...DEFAULT_PANOIDS],
        createdAt: new Date().toISOString(),
        isDefault: true
      });
    }
  }

  // =============================================
  // 设置管理 (localStorage)
  // =============================================
  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }

  function getSetting(key, defaultValue) {
    const s = getSettings();
    return s[key] !== undefined ? s[key] : defaultValue;
  }

  function setSetting(key, value) {
    const s = getSettings();
    s[key] = value;
    saveSettings(s);
  }

  function getLastBankId() {
    return localStorage.getItem(LAST_BANK_KEY);
  }

  function setLastBankId(id) {
    localStorage.setItem(LAST_BANK_KEY, id);
  }

  // =============================================
  // 前端直接加载模块（直接从百度 API 获取 metadata 和图片）
  // =============================================

  // 百度 API 基础 URL
  const BAIDU_META_URL = 'https://mapsv0.bdimg.com/?qt=sdata&sid=';
  const BAIDU_IMG_URL = 'https://mapsv0.bdimg.com/?qt=pr3d&fovy=120&quality=100';

  // 获取真实 Heading（元数据）
  async function fetchHeading(panoid, fallbackHeading = 0) {
    let heading = fallbackHeading;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        const metaRes = await fetch(`${BAIDU_META_URL}${panoid}`, {
          signal: controller.signal,
          mode: 'cors'
        });
        clearTimeout(timeoutId);

        if (metaRes.ok) {
          const metaData = await metaRes.json();
          const content = metaData && metaData.content;
          if (content && content.length > 0 && content[0].Heading !== undefined) {
            heading = content[0].Heading;
            break;
          }
        }
      } catch (e) {
        // 静默重试
      }
      if (attempt < 4) {
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * Math.pow(2, attempt), 10000)));
      }
    }
    return heading;
  }

  // 构建街景图片 URL
  function buildStreetViewUrl(panoid, heading) {
    return `${BAIDU_IMG_URL}&panoid=${panoid}&heading=${heading}&pitch=-90&width=1024&height=1024`;
  }

  // 预加载图片到浏览器缓存
  function preloadImage(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = url;
    });
  }

  // =============================================
  // 页面导航
  // =============================================
  function navigateTo(page) {
    // 如果游戏进行中，阻止导航
    if (gameState.isPlaying && page !== 'game') {
      if (!confirm('游戏正在进行中，离开将结束当前游戏。确定吗？')) return;
      endGame();
    }

    // 隐藏所有页面
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    // 显示目标页面
    const targetPage = document.getElementById(`page-${page}`);
    if (targetPage) targetPage.classList.add('active');

    // 更新导航按钮状态
    dom.navBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });

    // 如果进入题库页面，刷新列表
    if (page === 'bank') renderBankList();
    // 如果进入游戏页面，刷新题库选择
    if (page === 'game') populateBankSelect();
  }

  // =============================================
  // 题库选择器
  // =============================================
  async function populateBankSelect() {
    const banks = await getAllBanks();
    const select = dom.bankSelect;
    select.innerHTML = '';
    banks.forEach(b => {
      const option = document.createElement('option');
      option.value = b.id;
      option.textContent = `${b.name} (${b.panoids.length} 题)`;
      select.appendChild(option);
    });

    // 恢复上次选择的题库
    const lastId = getLastBankId();
    if (lastId && [...select.options].some(o => o.value === lastId)) {
      select.value = lastId;
    }
  }

  // =============================================
  // 游戏逻辑
  // =============================================

  // 开始游戏
  async function startGame() {
    const bankId = Number(dom.bankSelect.value);
    if (!bankId) {
      alert('请先选择题库');
      return;
    }

    const banks = await getAllBanks();
    const bank = banks.find(b => b.id === bankId);
    if (!bank || bank.panoids.length === 0) {
      alert('该题库没有题目');
      return;
    }

    setLastBankId(bankId);

    // 打乱题目顺序（Fisher-Yates）
    const shuffled = [...bank.panoids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 初始化游戏状态
    gameState.bank = shuffled;
    gameState.queue = shuffled;
    gameState.currentIndex = -1;
    gameState.correctCount = 0;
    gameState.answeredCount = 0;
    gameState.isPlaying = true;
    gameState.currentImgUrl = null;
    gameState.currentPanoid = null;
    gameState.results = [];
    clearPreloadCache();

    // 切换 UI
    dom.gameStart.classList.add('hidden');
    dom.gameEnd.classList.add('hidden');
    dom.gamePlaying.classList.remove('hidden');

    // 加载第一题
    await nextQuestion();
  }

  // 下一题
  async function nextQuestion() {
    gameState.currentIndex++;

    // 检查是否所有题目都答完了
    if (gameState.currentIndex >= gameState.queue.length) {
      showEndScreen();
      return;
    }

    const panoid = gameState.queue[gameState.currentIndex];
    gameState.currentPanoid = panoid;

    // 更新进度
    updateProgress();

    // 清空输入
    dom.answerInput.value = '';
    dom.answerInput.className = '';
    dom.answerInput.disabled = false;
    dom.answerFeedback.classList.add('hidden');
    dom.answerFeedback.textContent = '';
    dom.btnSubmit.disabled = false;

    // 显示加载状态（如果缓存命中很快消失）
    dom.imgLoading.classList.remove('hidden');
    dom.streetviewImg.src = '';

    try {
      const url = await getCachedOrFetch(panoid);

      gameState.currentImgUrl = url;
      dom.streetviewImg.src = url;
      dom.imgLoading.classList.add('hidden');
      // 重新挂载 Viewer.js（图片 src 变了）
      initImageViewer();

      // 当前题加载完成后，后台预缓存下两道题
      preloadNextImage();
    } catch (err) {
      dom.imgLoading.textContent = '图片加载失败，请重试或跳过';
      dom.streetviewImg.src = '';
    }
  }

  // =============================================
  // 预缓存模块（使用浏览器原生图片缓存）
  // =============================================
  const CACHE_SIZE = 2; // 预缓存下 N 道题

  // 预缓存 Map：panoid -> 图片 URL（已触发浏览器加载）
  const preloadCache = new Map();

  // 启动预缓存
  async function preloadNextImage() {
    for (let i = 1; i <= CACHE_SIZE; i++) {
      const nextIndex = gameState.currentIndex + i;
      if (nextIndex >= gameState.queue.length) break;
      const nextPanoid = gameState.queue[nextIndex];
      // 不等待，后台静默预加载
      preloadSingleImage(nextPanoid).catch(() => {});
    }
  }

  // 预缓存单张图片：获取 heading → 构造 URL → 触发浏览器加载
  async function preloadSingleImage(panoid) {
    if (preloadCache.has(panoid)) return;
    try {
      const heading = await fetchHeading(panoid);
      const url = buildStreetViewUrl(panoid, heading);
      await preloadImage(url);
      preloadCache.set(panoid, url);
    } catch {
      // 预缓存失败静默处理
    }
  }

  // 获取当前题图片：先取缓存，未命中则实时加载
  async function getCachedOrFetch(panoid) {
    if (preloadCache.has(panoid)) {
      const url = preloadCache.get(panoid);
      preloadCache.delete(panoid);
      return url;
    }
    const heading = await fetchHeading(panoid);
    return buildStreetViewUrl(panoid, heading);
  }

  // 清理预缓存
  function clearPreloadCache() {
    preloadCache.clear();
  }

  // 更新进度显示
  function updateProgress() {
    const total = gameState.queue.length;
    const current = gameState.currentIndex + 1;
    dom.gameProgress.textContent = `${Math.min(current, total)} / ${total}`;
    dom.gameScore.textContent = `正确：${gameState.correctCount}`;
  }

  // 提交答案
  function submitAnswer() {
    if (!gameState.isPlaying) return;

    const userAnswer = dom.answerInput.value.trim();
    if (!userAnswer) {
      dom.answerFeedback.textContent = '请输入答案';
      dom.answerFeedback.className = 'feedback wrong';
      dom.answerFeedback.classList.remove('hidden');
      return;
    }

    const panoid = gameState.currentPanoid;
    const correctAnswer = panoid.slice(-2);

    const caseSensitive = getSetting('caseSensitive', false);
    let isCorrect;
    if (caseSensitive) {
      isCorrect = userAnswer === correctAnswer;
    } else {
      isCorrect = userAnswer.toUpperCase() === correctAnswer.toUpperCase();
    }

    // 记录结果
    gameState.answeredCount++;
    if (isCorrect) gameState.correctCount++;

    gameState.results.push({
      panoid,
      userAnswer,
      correctAnswer,
      isCorrect
    });

    // 显示反馈
    dom.answerInput.className = isCorrect ? 'correct' : 'wrong';
    dom.answerFeedback.textContent = isCorrect
      ? `✓ 正确！答案为 ${correctAnswer}`
      : `✗ 错误！正确答案为 ${correctAnswer}`;
    dom.answerFeedback.className = `feedback ${isCorrect ? 'correct' : 'wrong'}`;
    dom.answerFeedback.classList.remove('hidden');
    dom.answerInput.disabled = true;
    dom.btnSubmit.disabled = true;

    updateProgress();

    // 延迟后自动进入下一题
    setTimeout(async () => {
      if (gameState.isPlaying) {
        await nextQuestion();
      }
    }, 1200);
  }

  // 结束游戏
  function endGame() {
    if (!gameState.isPlaying) return;
    gameState.isPlaying = false;

    clearPreloadCache();

    showEndScreen();
  }

  // 显示结束界面
  function showEndScreen() {
    gameState.isPlaying = false;

    clearPreloadCache();

    dom.gamePlaying.classList.add('hidden');
    dom.gameEnd.classList.remove('hidden');

    const total = gameState.answeredCount;
    const correct = gameState.correctCount;
    const rate = total > 0 ? Math.round((correct / total) * 100) : 0;

    dom.resultText.textContent = `正确率：${rate}%`;

    // ---- 按车型统计正确率 ----
    const carStats = {};
    gameState.results.forEach(r => {
      const carModel = r.panoid.slice(-2);
      if (!carStats[carModel]) {
        carStats[carModel] = { total: 0, correct: 0 };
      }
      carStats[carModel].total++;
      if (r.isCorrect) carStats[carModel].correct++;
    });

    const carStatsArray = Object.entries(carStats).map(([model, stats]) => ({
      model,
      total: stats.total,
      correct: stats.correct,
      rate: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    }));

    // 按正确率升序排列
    carStatsArray.sort((a, b) => a.rate - b.rate);

    dom.resultDetail.innerHTML = '';

    // 车型统计卡片
    if (carStatsArray.length > 1) {
      const statsCard = document.createElement('div');
      statsCard.className = 'car-stats';
      statsCard.innerHTML = '<div class="car-stats-title">各车型正确率</div>';
      carStatsArray.forEach(c => {
        const row = document.createElement('div');
        row.className = 'car-stat-row';
        row.innerHTML = `
          <span class="car-model">${c.model}</span>
          <span class="car-bar-bg"><span class="car-bar-fill" style="width:${c.rate}%"></span></span>
          <span class="car-rate ${c.rate >= 50 ? 'correct' : 'wrong'}">${c.rate}%</span>
          <span class="car-count">${c.correct}/${c.total}</span>
        `;
        statsCard.appendChild(row);
      });
      dom.resultDetail.appendChild(statsCard);
    }

    // 每题的详细结果
    const detailTitle = document.createElement('div');
    detailTitle.className = 'detail-list-title';
    detailTitle.textContent = '答题明细';
    dom.resultDetail.appendChild(detailTitle);

    gameState.results.forEach(r => {
      const item = document.createElement('div');
      item.className = 'result-item';
      item.innerHTML = `
        <span class="panoid-text">${r.panoid}</span>
        <span class="answer-text ${r.isCorrect ? 'correct' : 'wrong'}">
          ${r.isCorrect ? '✓' : '✗'} ${r.userAnswer}${!r.isCorrect ? ' → ' + r.correctAnswer : ''}
        </span>
      `;
      dom.resultDetail.appendChild(item);
    });
  }

  // =============================================
  // 题库管理
  // =============================================

  // 渲染题库列表
  async function renderBankList() {
    const banks = await getAllBanks();
    dom.bankList.innerHTML = '';

    if (banks.length === 0) {
      dom.bankList.innerHTML = '<p style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无题库</p>';
      return;
    }

    banks.forEach(b => {
      const item = document.createElement('div');
      item.className = 'bank-item';
      item.innerHTML = `
        <div class="bank-info">
          <div class="bank-name">${b.name}</div>
          <div class="bank-meta">${b.panoids.length} 题 · ${new Date(b.createdAt).toLocaleDateString()}</div>
        </div>
        <div class="bank-actions">
          <button class="btn-icon" data-action="edit" data-id="${b.id}" title="编辑">✏️</button>
          ${!b.isDefault ? `<button class="btn-icon danger" data-action="delete" data-id="${b.id}" title="删除">🗑️</button>` : ''}
        </div>
      `;
      dom.bankList.appendChild(item);
    });

    // 绑定事件
    dom.bankList.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', () => openBankEditor(Number(btn.dataset.id)));
    });
    dom.bankList.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', () => deleteBankHandler(Number(btn.dataset.id)));
    });
  }

  // 新建题库
  async function createBank() {
    const name = prompt('请输入题库名称：');
    if (!name || !name.trim()) return;
    await addBank({ name: name.trim(), panoids: [], createdAt: new Date().toISOString(), isDefault: false });
    await renderBankList();
    await populateBankSelect();
  }

  // 删除题库
  async function deleteBankHandler(id) {
    if (!confirm('确定要删除该题库吗？此操作不可撤销。')) return;
    await deleteBank(id);
    await renderBankList();
    await populateBankSelect();
  }

  // 当前编辑的题库 ID
  let editingBankId = null;

  // 打开题库编辑弹窗
  async function openBankEditor(id) {
    const banks = await getAllBanks();
    const bank = banks.find(b => b.id === id);
    if (!bank) return;

    editingBankId = id;
    dom.bankEditorTitle.textContent = `编辑：${bank.name}`;
    dom.editorBankName.value = bank.name;
    dom.editorImportText.value = '';
    renderEditorPanoidList(bank.panoids);
    dom.bankEditorModal.classList.remove('hidden');
  }

  // 关闭编辑弹窗
  function closeBankEditor() {
    dom.bankEditorModal.classList.add('hidden');
    editingBankId = null;
  }

  // 渲染编辑弹窗中的 panoid 列表
  function renderEditorPanoidList(panoids) {
    dom.editorPanoidCount.textContent = panoids.length;
    dom.editorPanoidList.innerHTML = '';
    if (panoids.length === 0) {
      dom.editorPanoidList.innerHTML = '<p style="color: var(--text-secondary); padding: 12px; text-align: center;">暂无题目，请导入</p>';
      return;
    }
    panoids.forEach(p => {
      const item = document.createElement('div');
      item.className = 'editor-panoid-item';
      item.innerHTML = `
        <span>${p}</span>
        <button class="remove-panoid" data-panoid="${p}">✕</button>
      `;
      dom.editorPanoidList.appendChild(item);
    });

    // 绑定删除事件
    dom.editorPanoidList.querySelectorAll('.remove-panoid').forEach(btn => {
      btn.addEventListener('click', async () => {
        const panoid = btn.dataset.panoid;
        const banks = await getAllBanks();
        const bank = banks.find(b => b.id === editingBankId);
        if (!bank) return;
        bank.panoids = bank.panoids.filter(p => p !== panoid);
        await updateBank(bank);
        renderEditorPanoidList(bank.panoids);
      });
    });
  }

  // 重命名题库
  async function renameBank() {
    const newName = dom.editorBankName.value.trim();
    if (!newName) {
      alert('请输入题库名称');
      return;
    }
    const banks = await getAllBanks();
    const bank = banks.find(b => b.id === editingBankId);
    if (!bank) return;
    bank.name = newName;
    await updateBank(bank);
    dom.bankEditorTitle.textContent = `编辑：${newName}`;
    await renderBankList();
    await populateBankSelect();
  }

  // 批量导入 panoid
  async function importPanoids() {
    const text = dom.editorImportText.value.trim();
    if (!text) {
      alert('请输入要导入的 panoid');
      return;
    }
    const lines = text.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    if (lines.length === 0) {
      alert('没有有效的 panoid');
      return;
    }

    const banks = await getAllBanks();
    const bank = banks.find(b => b.id === editingBankId);
    if (!bank) return;

    // 去重后添加
    const existing = new Set(bank.panoids);
    const newPanoids = lines.filter(p => !existing.has(p));
    bank.panoids = [...bank.panoids, ...newPanoids];
    await updateBank(bank);

    dom.editorImportText.value = '';
    renderEditorPanoidList(bank.panoids);
    await populateBankSelect();
    alert(`成功导入 ${newPanoids.length} 个 panoid（已跳过 ${lines.length - newPanoids.length} 个重复项）`);
  }

  // =============================================
  // 图片查看（使用 Viewer.js 库，支持双指缩放/拖动）
  // =============================================
  let imgViewer = null;

  function initImageViewer() {
    if (typeof Viewer !== 'function') return;
    if (imgViewer) {
      imgViewer.destroy();
    }
    imgViewer = new Viewer(dom.streetviewImg, {
      inline: false,
      toolbar: false,
      title: false,
      navbar: false,
      button: true,
      movable: true,
      zoomable: true,
      rotatable: false,
      scalable: false,
      transition: true,
      fullscreen: false,
      keyboard: false,
      zoomOnWheel: true,
      zoomRatio: 0.1,
      minZoomRatio: 0.1,
      maxZoomRatio: 8,
      zIndex: 9999,
      zIndexInline: 9999,
    });
  }

  // =============================================
  // 设置
  // =============================================
  function loadSettings() {
    dom.settingCaseSensitive.checked = getSetting('caseSensitive', false);
    applyBackground();
  }

  function applyBackground() {
    const customBg = getSetting('customBg', '');
    if (customBg) {
      document.body.style.backgroundImage = `url(${customBg})`;
    } else {
      // 使用默认 background.png
      document.body.style.backgroundImage = 'url(background.png)';
    }
  }

  // =============================================
  // 事件绑定
  // =============================================
  function init() {
    // 导航
    dom.navBtns.forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // 游戏 - 开始
    dom.btnStart.addEventListener('click', startGame);

    // 游戏 - 提交答案
    dom.btnSubmit.addEventListener('click', submitAnswer);
    dom.answerInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && gameState.isPlaying) {
        e.preventDefault();
        submitAnswer();
      }
    });

    // 游戏 - 结束
    dom.btnEnd.addEventListener('click', endGame);

    // 游戏 - 返回首页
    dom.btnBackStart.addEventListener('click', () => {
      dom.gameEnd.classList.add('hidden');
      dom.gameStart.classList.remove('hidden');
    });

    // 图片点击查看大图（Viewer.js 自动处理点击）
    initImageViewer();

    // 题库管理 - 新建
    dom.btnCreateBank.addEventListener('click', createBank);

    // 题库编辑弹窗
    dom.modalCloseBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // 找到最近的 modal 并关闭
        const modal = btn.closest('.modal');
        if (modal) modal.classList.add('hidden');
      });
    });
    document.querySelectorAll('#bank-editor-modal .modal-overlay').forEach(el => {
      el.addEventListener('click', closeBankEditor);
    });
    dom.btnRenameBank.addEventListener('click', renameBank);
    dom.btnImportPanoids.addEventListener('click', importPanoids);

    // 设置 - 大小写敏感
    dom.settingCaseSensitive.addEventListener('change', () => {
      setSetting('caseSensitive', dom.settingCaseSensitive.checked);
    });

    // 设置 - 自定义背景
    dom.bgUpload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target.result;
        setSetting('customBg', dataUrl);
        applyBackground();
      };
      reader.readAsDataURL(file);
    });

    // 设置 - 恢复默认背景
    dom.btnResetBg.addEventListener('click', () => {
      setSetting('customBg', '');
      applyBackground();
      dom.bgUpload.value = '';
    });

    // 初始化数据库和 UI
    initDBAndUI();
  }

  // =============================================
  // 初始化
  // =============================================
  async function initDBAndUI() {
    try {
      await initDefaultBank();
      await populateBankSelect();
      await renderBankList();
      loadSettings();
    } catch (err) {
      console.error('[ERROR] init failed:', err);
    }
  }

  // DOM 加载完成后初始化
  document.addEventListener('DOMContentLoaded', init);
})();
