/**
 * app.js
 * Controlador principal de "Oráculo Ciber-Filosófico" (PWA).
 * Compatible con Vercel/localhost (HTTP/HTTPS) y apertura directa (file://).
 */
(function (global) {
  'use strict';

  const {
    getApiKey,
    setApiKey,
    hasApiKey,
    testApiKey,
    generateOracleText,
    generateEphemerisCard,
    buildLocalOracleFallback,
    buildLocalEphemerisFallback
  } = global.OraculoGemini;

  const { renderOracleCanvas, FORMAT_DIMENSIONS, ATMOSPHERE_PALETTES } = global.OraculoCanvas;

  const STORAGE_SETTINGS_KEY = 'oraculo_cf_settings';
  const STORAGE_HISTORY_KEY = 'oraculo_cf_history';
  const STORAGE_QR_URL_KEY = 'oraculo_cf_public_url';
  const MAX_HISTORY = 5;

  const FILTROS = {
    filosofia: 'Filosofía Universal',
    taoismo: 'Taoísmo & Historias Cortas',
    estoicismo: 'Estoicismo',
    kybalion: 'Leyes Universales & Kybalion',
    sabiduria_humana: 'Sabiduría Humana & Parábolas'
  };

  const state = {
    sabiduria: null,
    settings: {
      tema: 'naturaleza',
      modo: 'esperanza',
      efemerideEnfoque: 'mixto',
      formato: '4:5',
      firma: 'By Michael_NB-γ',
      filtro: 'filosofia',
      webPulseEnabled: true
    },
    currentOracle: null,
    history: [],
    isGenerating: false,
    deferredInstallPrompt: null
  };

  const dom = {};

  function cacheDom() {
    dom.canvas = document.getElementById('oracle-canvas');
    dom.canvasWrapper = document.getElementById('canvas-preview-wrapper');
    dom.canvasLoading = document.getElementById('canvas-loading');
    dom.loadingLabel = document.getElementById('loading-label');
    dom.btnInvoke = document.getElementById('btn-invoke');
    dom.btnInvokeIcon = document.getElementById('btn-invoke-icon');
    dom.btnInvokeLabel = document.getElementById('btn-invoke-label');
    dom.btnDownload = document.getElementById('btn-download');
    dom.btnCopyCaption = document.getElementById('btn-copy-caption');
    dom.btnShuffleNature = document.getElementById('btn-shuffle-nature');
    dom.captionBox = document.getElementById('caption-preview');
    dom.artBadge = document.getElementById('art-source-badge');
    dom.numerologyPill = document.getElementById('daily-numerology-pill');
    dom.apiStatusPill = document.getElementById('api-status-pill');

    dom.btnModeEsperanza = document.getElementById('btn-mode-esperanza');
    dom.btnModeEfemeride = document.getElementById('btn-mode-efemeride');
    dom.streamWrapper = document.getElementById('stream-wrapper');
    dom.ephemerisFocusWrapper = document.getElementById('ephemeris-focus-wrapper');
    dom.ephemerisFocusSelect = document.getElementById('ephemeris-focus-select');

    dom.streamSelect = document.getElementById('stream-select');
    dom.toggleWebPulse = document.getElementById('toggle-web-pulse');
    dom.formatBtns = document.querySelectorAll('[data-format-btn]');

    dom.btnOpenSettings = document.getElementById('btn-open-settings');
    dom.settingsModal = document.getElementById('settings-modal');
    dom.btnCloseSettings = document.getElementById('btn-close-settings');
    dom.inputApiKey = document.getElementById('input-api-key');
    dom.apiKeyFeedback = document.getElementById('api-key-feedback');
    dom.btnToggleKeyVis = document.getElementById('btn-toggle-key-vis');
    dom.inputSignature = document.getElementById('input-signature');
    dom.modalFormatBtns = document.querySelectorAll('[data-modal-format]');
    dom.btnTestApiKey = document.getElementById('btn-test-api-key');
    dom.btnSaveSettings = document.getElementById('btn-save-settings');
    dom.btnDemoLocal = document.getElementById('btn-demo-local');

    dom.historyList = document.getElementById('history-list');
    dom.historyEmpty = document.getElementById('history-empty');
    dom.btnClearHistory = document.getElementById('btn-clear-history');
    dom.toastContainer = document.getElementById('toast-container');
    dom.btnInstallPwa = document.getElementById('btn-install-pwa');

    dom.btnOpenQr = document.getElementById('btn-open-qr');
    dom.qrModal = document.getElementById('qr-modal');
    dom.btnCloseQr = document.getElementById('btn-close-qr');
    dom.inputQrUrl = document.getElementById('input-qr-url');
    dom.qrUrlHint = document.getElementById('qr-url-hint');
    dom.btnFixGhPages = document.getElementById('btn-fix-gh-pages');
    dom.qrCanvas = document.getElementById('qr-canvas');
    dom.qrEmptyState = document.getElementById('qr-empty-state');
    dom.qrEncodedLabel = document.getElementById('qr-encoded-label');
    dom.btnDownloadQr = document.getElementById('btn-download-qr');
  }

  function showToast(message, type = 'info', durationMs = null) {
    const colors = {
      info: 'border-sky-400 bg-white/95 text-sky-900 shadow-lg',
      success: 'border-emerald-400 bg-white/95 text-emerald-900 shadow-lg',
      warning: 'border-amber-400 bg-white/95 text-amber-900 shadow-lg',
      error: 'border-rose-500 bg-rose-50/95 text-rose-900 shadow-lg'
    };
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto rounded-xl border px-4 py-3 text-sm font-medium shadow-2xl backdrop-blur-md transition-all duration-300 ${colors[type] || colors.info}`;
    toast.textContent = message;
    dom.toastContainer.appendChild(toast);

    const ttl = durationMs || (type === 'error' || type === 'warning' ? 6800 : 3200);
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, ttl);
  }

  function calcularVibracionFecha(fecha = new Date()) {
    const dd = String(fecha.getDate()).padStart(2, '0');
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const yyyy = String(fecha.getFullYear());
    const digits = `${dd}${mm}${yyyy}`.split('').map(Number);

    let sum = digits.reduce((acc, d) => acc + d, 0);
    const maestros = new Set([11, 22, 33]);

    while (sum > 9 && !maestros.has(sum)) {
      sum = String(sum)
        .split('')
        .map(Number)
        .reduce((acc, d) => acc + d, 0);
    }
    return sum;
  }

  function pickRandom(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  async function loadKnowledgeBase() {
    if (global.SABIDURIA_DATA?.sabiduria_humana) {
      state.sabiduria = global.SABIDURIA_DATA;
      return;
    }

    if (global.location.protocol.startsWith('http')) {
      const res = await fetch('./data/sabiduria.json', { cache: 'no-store' });
      if (res.ok) {
        state.sabiduria = await res.json();
        return;
      }
    }

    if (global.SABIDURIA_DATA) {
      state.sabiduria = global.SABIDURIA_DATA;
      return;
    }

    throw new Error('No se pudo cargar la base de conocimiento sabiduria.js');
  }

  function buildOracleContext(filtro) {
    const db = state.sabiduria;
    const hoy = new Date();
    const numDia = calcularVibracionFecha(hoy);
    const numInfo = db.numerologia.numeros[String(numDia)] || db.numerologia.numeros['7'];
    const fechaTexto = hoy.toLocaleDateString('es-ES', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const kybalion = pickRandom(db.kybalion.leyes);
    const estoico = pickRandom(db.estoicismo.ensenanzas);
    const estoico2 = pickRandom(db.estoicismo.ensenanzas.filter((e) => e.id !== estoico?.id));
    const taoHistorias = db.taoismo?.historias || [];
    const tao = pickRandom(taoHistorias);
    const tao2 = pickRandom(taoHistorias.filter((t) => t.id !== tao?.id));
    const filoPool = db.filosofia?.ensenanzas || [];
    const filo = pickRandom(filoPool);
    const filo2 = pickRandom(filoPool.filter((f) => f.id !== filo?.id));
    const sabHumPool = db.sabiduria_humana?.ensenanzas || [];
    const sabHum = pickRandom(sabHumPool);
    const sabHum2 = pickRandom(sabHumPool.filter((h) => h.id !== sabHum?.id));
    const elemento = pickRandom(db.astrologia_historia.elementos);

    const bloques = [];
    const corrientesObj = {};

    if (filtro === 'sabiduria_humana' && sabHum) {
      corrientesObj.sabiduriaHumana = sabHum;
      corrientesObj.sabiduriaHumanaPool = sabHumPool;
      bloques.push(
        `- Enseñanza Humana (${sabHum.autor} · ${sabHum.obra}): "${sabHum.maxima}". Historia/Contexto: ${sabHum.historia}. Práctica: ${sabHum.aplicacion_practica}`
      );
      if (sabHum2) {
        bloques.push(`- Eco Sapiencial (${sabHum2.autor}): "${sabHum2.maxima}"`);
      }
    } else if (filtro === 'taoismo' && tao) {
      corrientesObj.taoismo = tao;
      corrientesObj.taoismoPool = taoHistorias;
      bloques.push(
        `- Historia Taoísta (${tao.titulo} · ${tao.maestro}): "${tao.historia}" Moraleja: ${tao.ensenanza}`
      );
      if (tao2) {
        bloques.push(`- Complemento Taoísta (${tao2.titulo}): ${tao2.ensenanza}`);
      }
    } else if (filtro === 'estoicismo') {
      corrientesObj.estoicismo = estoico;
      corrientesObj.estoicismoPool = db.estoicismo.ensenanzas;
      bloques.push(
        `- Estoicismo (${estoico.autor}, ${estoico.obra} · Pilar ${estoico.pilar}): "${estoico.maxima}". Enseñanza: ${estoico.ensenanza}. Aplicación: ${estoico.aplicacion_practica}`
      );
      if (estoico2) {
        bloques.push(
          `- Refuerzo Estoico (${estoico2.autor}, ${estoico2.obra}): "${estoico2.maxima}". Aplicación: ${estoico2.aplicacion_practica}`
        );
      }
    } else if (filtro === 'kybalion') {
      const maestroLey = pickRandom(db.kybalion.maestros || []);
      corrientesObj.kybalion = kybalion;
      corrientesObj.kybalionPool = db.kybalion.leyes;
      corrientesObj.kybalionMaestro = maestroLey;
      corrientesObj.kybalionMaestros = db.kybalion.maestros || [];
      if (maestroLey) {
        bloques.push(
          `- Maestro de Leyes Universales (${maestroLey.autor}, ${maestroLey.obra} · ${maestroLey.etapa}): "${maestroLey.maxima}". Enseñanza: ${maestroLey.ensenanza}. Aplicación: ${maestroLey.aplicacion_practica}`
        );
      }
      bloques.push(
        `- Kybalion (${kybalion.nombre}): Axioma "${kybalion.axioma}". Principio: ${kybalion.principio}. Aplicación: ${kybalion.aplicacion_practica}`
      );
      bloques.push(`- Elemento de transmutación (${elemento.nombre}): ${elemento.sabiduria}`);
    } else {
      corrientesObj.filosofia = filo;
      corrientesObj.filosofiaPool = filoPool;
      if (filo) {
        bloques.push(
          `- Filosofía (${filo.autor}, ${filo.obra}): "${filo.maxima}". Enseñanza: ${filo.ensenanza}. Aplicación: ${filo.aplicacion_practica}`
        );
      }
      if (filo2) {
        bloques.push(
          `- Diálogo Filosófico (${filo2.autor}, ${filo2.obra}): "${filo2.maxima}"`
        );
      }
    }

    return {
      fecha: hoy,
      fechaTexto,
      filtro,
      filtroLabel: FILTROS[filtro] || FILTROS.filosofia,
      numerologiaDia: numInfo,
      resumenCorrientes: bloques.join('\n'),
      corrientesObj
    };
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state.settings = { ...state.settings, ...parsed, tema: 'naturaleza' };
        if (!FILTROS[state.settings.filtro]) {
          state.settings.filtro = 'filosofia';
        }
      }
    } catch (e) {
      console.warn('Error leyendo settings:', e);
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(state.settings));
    } catch (e) {
      console.warn('Error guardando settings:', e);
    }
  }

  async function compressArtForHistory(dataUrl) {
    if (!dataUrl) return null;
    if (/^https?:\/\//i.test(dataUrl)) return dataUrl;
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.crossOrigin = 'anonymous';
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = dataUrl;
      });
      const maxW = 460;
      const scale = Math.min(1, maxW / img.width);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', 0.72);
    } catch {
      return null;
    }
  }

  function loadHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_HISTORY_KEY);
      state.history = raw ? JSON.parse(raw) : [];
    } catch {
      state.history = [];
    }
  }

  async function pushHistory(oracleRecord) {
    const compactArt = await compressArtForHistory(oracleRecord.imageDataUrl);
    const entry = {
      ...oracleRecord,
      imageDataUrl: compactArt
    };

    state.history = [entry, ...state.history.filter((h) => h.id !== entry.id)].slice(0, MAX_HISTORY);

    try {
      localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(state.history));
    } catch {
      const stripped = state.history.map((item, idx) =>
        idx === 0 ? item : { ...item, imageDataUrl: null }
      );
      try {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(stripped));
        state.history = stripped;
      } catch {
        console.warn('No se pudo persistir el historial en localStorage.');
      }
    }
    renderHistoryList();
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderHistoryList() {
    dom.historyList.innerHTML = '';
    if (!state.history.length) {
      dom.historyEmpty.classList.remove('hidden');
      dom.btnClearHistory.classList.add('hidden');
      return;
    }

    dom.historyEmpty.classList.add('hidden');
    dom.btnClearHistory.classList.remove('hidden');

    state.history.forEach((item) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'w-full text-left rounded-xl border border-slate-300 bg-white hover:border-sky-500 hover:bg-sky-50/50 p-3.5 shadow-sm transition-all group';
      const fecha = new Date(item.timestamp).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      btn.innerHTML = `
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="text-[11px] font-mono font-semibold uppercase tracking-wider text-sky-700">${escapeHtml(item.filtroLabel || 'Oráculo')} · N° ${item.numeroDia || '-'}</span>
          <span class="text-[11px] text-slate-500">${escapeHtml(fecha)}</span>
        </div>
        <p class="text-xs font-semibold text-slate-900 line-clamp-1 group-hover:text-sky-700 transition-colors">${escapeHtml(item.gancho)}</p>
        <p class="text-xs text-slate-600 line-clamp-2 mt-1">${escapeHtml(item.frase)}</p>
      `;
      btn.addEventListener('click', async () => {
        state.currentOracle = { ...item };
        await refreshCanvasAndCaption();
        global.scrollTo({ top: 0, behavior: 'smooth' });
        showToast('Creación restaurada desde el historial.', 'info');
      });
      dom.historyList.appendChild(btn);
    });
  }

  function syncUIControls() {
    const { formato, filtro, modo, efemerideEnfoque } = state.settings;
    const isEph = modo === 'efemeride';

    if (dom.btnModeEsperanza && dom.btnModeEfemeride) {
      dom.btnModeEsperanza.className = `rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
        !isEph
          ? 'bg-sky-600 text-white border-sky-600 shadow-md'
          : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/70'
      }`;
      dom.btnModeEfemeride.className = `rounded-lg border px-3 py-2 text-xs font-semibold transition-all ${
        isEph
          ? 'bg-orange-500 text-white border-orange-500 shadow-md'
          : 'text-slate-600 border-transparent hover:text-slate-900 hover:bg-slate-200/70'
      }`;
    }

    if (dom.streamWrapper) dom.streamWrapper.classList.toggle('hidden', isEph);
    if (dom.ephemerisFocusWrapper) dom.ephemerisFocusWrapper.classList.toggle('hidden', !isEph);
    if (dom.ephemerisFocusSelect) dom.ephemerisFocusSelect.value = efemerideEnfoque || 'mixto';
    if (dom.btnInvokeIcon) dom.btnInvokeIcon.textContent = isEph ? '📅' : '✨';
    if (dom.btnInvokeLabel) {
      dom.btnInvokeLabel.textContent = isEph ? 'INVOCAR EFEMÉRIDE DE HOY' : 'INVOCAR MENSAJE';
    }

    dom.formatBtns.forEach((b) => {
      const active = b.dataset.formatBtn === formato;
      b.classList.toggle('bg-sky-600', active);
      b.classList.toggle('text-white', active);
      b.classList.toggle('border-sky-600', active);
      b.classList.toggle('shadow-sm', active);
      b.classList.toggle('bg-white', !active);
      b.classList.toggle('text-slate-600', !active);
      b.classList.toggle('border-slate-300', !active);
    });

    dom.modalFormatBtns.forEach((b) => {
      const active = b.dataset.modalFormat === formato;
      b.classList.toggle('bg-sky-600', active);
      b.classList.toggle('text-white', active);
      b.classList.toggle('border-sky-600', active);
      b.classList.toggle('shadow-sm', active);
      b.classList.toggle('bg-white', !active);
      b.classList.toggle('text-slate-600', !active);
      b.classList.toggle('border-slate-300', !active);
    });

    dom.canvasWrapper.style.aspectRatio = formato === '9:16' ? '9 / 16' : '4 / 5';
    dom.streamSelect.value = FILTROS[filtro] ? filtro : 'filosofia';
    if (dom.toggleWebPulse) {
      dom.toggleWebPulse.checked = state.settings.webPulseEnabled !== false;
    }

    if (hasApiKey()) {
      dom.apiStatusPill.textContent = 'Gemini API Activa';
      dom.apiStatusPill.className =
        'inline-flex items-center gap-1.5 rounded-full border border-emerald-400 bg-emerald-100 px-2.5 py-1 text-[11px] font-mono font-semibold text-emerald-800';
    } else {
      dom.apiStatusPill.textContent = 'Sin API Key (Configurar)';
      dom.apiStatusPill.className =
        'inline-flex items-center gap-1.5 rounded-full border border-amber-400 bg-amber-100 px-2.5 py-1 text-[11px] font-mono font-semibold text-amber-800 cursor-pointer';
    }
  }

  async function refreshCanvasAndCaption() {
    if (!state.currentOracle) return;
    const o = state.currentOracle;
    const atmKey = o.atmosfera || global.OraculoGemini.inferAtmosphereFromText(`${o.gancho} ${o.frase}`);
    const atmLabel = ATMOSPHERE_PALETTES[atmKey]?.label || '🌅 Amanecer de Esperanza';

    await renderOracleCanvas(dom.canvas, { ...o, atmosfera: atmKey }, {
      tema: state.settings.tema,
      formato: state.settings.formato,
      firma: state.settings.firma,
      filtroLabel: o.filtroLabel,
      numeroDia: o.numeroDia,
      fecha: o.timestamp ? new Date(o.timestamp) : new Date()
    });

    dom.captionBox.value = o.caption || '';
    dom.btnDownload.disabled = false;
    dom.btnCopyCaption.disabled = false;
    if (dom.btnShuffleNature) dom.btnShuffleNature.disabled = false;

    const sourceTag = o.artSource && o.artSource !== 'procedural' ? o.artSource : 'Paisaje Procedural';
    dom.artBadge.textContent = `${atmLabel} · ${sourceTag}`;
  }

  async function renderInitialShowcase() {
    const activeFiltro = FILTROS[state.settings.filtro] ? state.settings.filtro : 'filosofia';
    const contexto = buildOracleContext(activeFiltro);
    const num = contexto.numerologiaDia;
    dom.numerologyPill.textContent = `Vibración del Día: ${num.numero} · ${num.titulo.split('·')[0].trim()}`;

    const isEphemerisMode = state.settings.modo === 'efemeride';
    const matchingHistory = state.history.find((h) =>
      isEphemerisMode
        ? h.modo === 'efemeride'
        : h.modo !== 'efemeride' && h.filtro === activeFiltro
    );

    if (matchingHistory) {
      state.currentOracle = { ...matchingHistory };
      await refreshCanvasAndCaption();
      return;
    }

    if (isEphemerisMode || activeFiltro !== 'filosofia') {
      await invokeOracle({ forceLocal: !hasApiKey() });
      return;
    }

    state.currentOracle = {
      id: 'welcome',
      modo: 'esperanza',
      timestamp: Date.now(),
      gancho: 'CUANDO SIENTAS QUE LA TORMENTA NO TERMINA',
      frase:
        'Incluso la noche más larga obedece al ritmo del universo y prepara en silencio la claridad de tu próximo amanecer.',
      palabras_clave: ['ritmo', 'claridad', 'amanecer'],
      atmosfera: 'amanecer',
      caption:
        '🌅 CUANDO SIENTAS QUE LA TORMENTA NO TERMINA\n\nIncluso la noche más larga obedece al ritmo del universo y prepara en silencio la claridad de tu próximo amanecer.\n\nPresiona "✨ INVOCAR MENSAJE" para recibir una nueva palabra de esperanza y sabiduría con un fondo de naturaleza aleatorio.\n\n#Esperanza #OraculoCiberFilosofico #Filosofia #Estoicismo #Taoismo',
      filtro: 'filosofia',
      filtroLabel: 'Filosofía Universal',
      numeroDia: num.numero,
      imageDataUrl: null,
      artSource: 'procedural'
    };

    await refreshCanvasAndCaption();

    // Cargar en segundo plano un paisaje real aleatorio para la bienvenida
    if (global.OraculoNature) {
      global.OraculoNature.fetchRandomNaturePhoto('amanecer').then(async (natureArt) => {
        if (natureArt?.imageDataUrl && state.currentOracle?.id === 'welcome') {
          state.currentOracle.imageDataUrl = natureArt.imageDataUrl;
          state.currentOracle.artSource = natureArt.source;
          await refreshCanvasAndCaption();
        }
      });
    }
  }

  function setLoading(loading, text = 'Consultando al Oráculo...') {
    state.isGenerating = loading;
    dom.btnInvoke.disabled = loading;
    dom.canvasLoading.classList.toggle('hidden', !loading);
    dom.loadingLabel.textContent = text;
  }

  async function invokeOracle({ forceLocal = false } = {}) {
    if (state.isGenerating) return;

    const isEphemeris = state.settings.modo === 'efemeride';
    const shouldUseLocalOnly = forceLocal || (isEphemeris && !hasApiKey());

    if (!isEphemeris && !forceLocal && !hasApiKey()) {
      showToast('Ingresa tu GEMINI_API_KEY o usa el Modo Local Demo.', 'warning');
      openSettingsModal();
      return;
    }

    const contexto = buildOracleContext(state.settings.filtro);
    const seenList = [state.currentOracle, ...state.history]
      .filter(
        (item) =>
          item &&
          item.gancho &&
          item.frase &&
          (isEphemeris ? item.modo === 'efemeride' : item.modo !== 'efemeride' && item.filtro === state.settings.filtro)
      )
      .map((item) => ({ gancho: item.gancho, frase: item.frase, ephemerisText: item.ephemerisText || '' }));
    contexto.recentMessages = seenList;

    const allAtms = Object.keys(ATMOSPHERE_PALETTES);
    const prevAtm = state.currentOracle?.atmosfera;
    const candidateAtms = allAtms.filter((a) => a !== prevAtm);
    const targetAtmosphere = candidateAtms[Math.floor(Math.random() * candidateAtms.length)] || 'amanecer';
    contexto.targetAtmosphere = targetAtmosphere;

    const previousNatureUrl = state.currentOracle?.imageDataUrl || '';

    // Precargar el paisaje natural aleatorio EN PARALELO desde el segundo 0
    const naturePromise = global.OraculoNature?.fetchRandomNaturePhoto
      ? global.OraculoNature.fetchRandomNaturePhoto(targetAtmosphere, previousNatureUrl).catch(() => null)
      : Promise.resolve(null);

    const isQuotaError = (err) => {
      const msg = String(err?.message || '');
      return (
        err?.code === 'QUOTA_EXCEEDED' ||
        /429|quota|RESOURCE_EXHAUSTED|rate.?limit|billing|credit|exceeded/i.test(msg)
      );
    };

    const markQuotaPill = () => {
      if (dom.apiStatusPill) {
        dom.apiStatusPill.textContent = 'Cuota Gemini Agotada · Modo Local';
        dom.apiStatusPill.className =
          'inline-flex items-center gap-1.5 rounded-full border border-rose-400 bg-rose-100 px-2.5 py-1 text-[11px] font-mono font-semibold text-rose-800 cursor-pointer';
      }
    };

    try {
      let textPayload;
      let usedQuotaFallback = false;
      let webConnected = false;
      let webAttempted = false;
      let webSources = [];
      let webSnippet = '';
      let ephemerisTextUsed = '';
      let artResult = { imageDataUrl: null, source: 'procedural' };

      if (isEphemeris) {
        const focus = state.settings.efemerideEnfoque || 'mixto';
        contexto.efemerideEnfoque = focus;
        setLoading(
          true,
          focus === 'chile'
            ? '1/2 Consultando efemérides de Chile de hoy...'
            : '1/2 Consultando efemérides mundiales de hoy...'
        );
        const recentTexts = seenList.flatMap((m) => [m.ephemerisText, m.frase].filter(Boolean));
        const ephData = await global.OraculoWebPulse.gatherTodayEphemeris({
          fecha: contexto.fecha,
          focus,
          recentTexts
        });

        webAttempted = true;
        webConnected = Boolean(ephData?.connected);
        webSources = ephData?.sources || [];
        ephemerisTextUsed = ephData?.item?.text || '';
        webSnippet = ephemerisTextUsed;

        // Buscar y verificar foto real de la efeméride (Wikipedia onthisday o búsqueda temática en Wikimedia)
        const resolveEventArt = async () => {
          if (!global.OraculoNature?.verifyCorsImage) return null;
          const baseCandidates = Array.isArray(ephData?.item?.imageCandidates)
            ? [...ephData.item.imageCandidates]
            : [];
          if (ephData?.item?.imageUrl && !baseCandidates.includes(ephData.item.imageUrl)) {
            baseCandidates.unshift(ephData.item.imageUrl);
          }

          const tryList = async (urls) => {
            const clean = urls.filter((u) => u && u !== previousNatureUrl).slice(0, 4);
            if (!clean.length) return null;
            const results = await Promise.allSettled(
              clean.map((url) =>
                global.OraculoNature.verifyCorsImage(url, 2600).then(() => url)
              )
            );
            const ok = results.find((r) => r.status === 'fulfilled' && r.value);
            return ok ? { imageDataUrl: ok.value, source: ephData.item.sourceOrigin || 'Wikipedia' } : null;
          };

          const firstHit = await tryList(baseCandidates);
          if (firstHit) return firstHit;

          if (global.OraculoWebPulse?.searchEphemerisTopicImages) {
            const searched = await global.OraculoWebPulse
              .searchEphemerisTopicImages(ephData.item)
              .catch(() => []);
            const topicHit = await tryList(searched);
            if (topicHit) {
              return { imageDataUrl: topicHit.imageDataUrl, source: 'Efeméride (Wikimedia)' };
            }
          }
          return null;
        };

        const eventPhotoPromise = resolveEventArt();

        if (shouldUseLocalOnly) {
          textPayload = buildLocalEphemerisFallback(ephData.item, contexto);
        } else {
          setLoading(true, '2/2 Redactando efeméride con Gemini...');
          try {
            textPayload = await generateEphemerisCard(ephData.item, contexto);
          } catch (geminiErr) {
            if (isQuotaError(geminiErr)) {
              usedQuotaFallback = true;
              markQuotaPill();
              textPayload = buildLocalEphemerisFallback(ephData.item, contexto);
            } else {
              throw geminiErr;
            }
          }
        }

        const [eventArt, natureRes] = await Promise.all([eventPhotoPromise, naturePromise]);
        if (eventArt?.imageDataUrl) {
          artResult = eventArt;
        } else if (natureRes?.imageDataUrl) {
          artResult = natureRes;
        }
      } else {
        let webPulse = null;
        webAttempted = Boolean(
          state.settings.webPulseEnabled &&
            global.OraculoWebPulse &&
            state.settings.filtro !== 'sabiduria_humana'
        );

        if (webAttempted) {
          setLoading(true, '1/2 Conectando pulso web y buscando paisaje...');
          webPulse = await global.OraculoWebPulse.gatherLiveWebContext({
            apiKey: shouldUseLocalOnly ? '' : getApiKey(),
            contexto
          });
          if (webPulse?.connected) {
            contexto.webPulse = webPulse;
          }
        }

        webConnected = Boolean(webPulse?.connected);
        webSources = webPulse?.sources || [];
        webSnippet = webPulse?.summaryText ? webPulse.summaryText.split('\n')[0] : '';

        setLoading(
          true,
          shouldUseLocalOnly
            ? 'Sintetizando Oráculo de Esperanza...'
            : `${webConnected ? '2/2' : '1/1'} Creando mensaje único con Gemini...`
        );

        if (shouldUseLocalOnly) {
          textPayload = buildLocalOracleFallback(contexto);
        } else {
          try {
            textPayload = await generateOracleText(contexto);
          } catch (geminiErr) {
            if (isQuotaError(geminiErr)) {
              usedQuotaFallback = true;
              markQuotaPill();
              textPayload = buildLocalOracleFallback(contexto);
            } else {
              throw geminiErr;
            }
          }
        }

        const natureRes = await naturePromise;
        if (natureRes?.imageDataUrl) {
          artResult = natureRes;
        }
      }

      const filtroLabelFinal = isEphemeris
        ? state.settings.efemerideEnfoque === 'chile'
          ? '🇨🇱 Efeméride de Chile'
          : '📅 Efeméride Mundial'
        : contexto.filtroLabel;

      const finalOracle = {
        id: `orc_${Date.now()}`,
        timestamp: Date.now(),
        ...textPayload,
        modo: isEphemeris ? 'efemeride' : 'esperanza',
        ephemerisText: ephemerisTextUsed,
        filtro: isEphemeris ? 'efemeride' : contexto.filtro,
        filtroLabel: filtroLabelFinal,
        numeroDia: contexto.numerologiaDia.numero,
        webSources,
        webPulseAttempted: webAttempted,
        webSnippet,
        imageDataUrl: artResult.imageDataUrl,
        artSource: usedQuotaFallback ? `${artResult.source} (Respaldo Local)` : artResult.source
      };

      state.currentOracle = finalOracle;
      await refreshCanvasAndCaption();
      await pushHistory(finalOracle);

      if (usedQuotaFallback) {
        showToast(
          '⚠️ Tu API Key alcanzó el límite de cuota/créditos de Gemini (429). Se generó contenido local distinto.',
          'warning',
          7500
        );
      } else if (isEphemeris) {
        showToast(
          webConnected
            ? '¡Efeméride mundial de hoy creada con datos reales!'
            : 'Efeméride generada en modo local (sin conexión a Wikipedia).',
          webConnected ? 'success' : 'warning'
        );
      } else if (webAttempted && !webConnected && artResult.source !== 'nature-photo') {
        showToast('Sin acceso a Wikipedia/Google en esta red; se usó sabiduría local.', 'warning');
      } else if (artResult.source === 'nature-photo') {
        showToast(
          webConnected
            ? '¡Mensaje creado con pulso web y paisaje natural aleatorio!'
            : '¡Mensaje creado con fondo de naturaleza aleatorio!',
          'success'
        );
      } else {
        showToast(
          webConnected ? '¡Oráculo invocado con información viva de la web!' : '¡Oráculo invocado con éxito!',
          'success'
        );
      }
    } catch (err) {
      console.error('[Oráculo] Error en invocación:', err);
      showToast(err.message || 'Error al invocar el mensaje.', 'error', 7000);
    } finally {
      setLoading(false);
    }
  }

  async function shuffleNatureBackground() {
    if (!state.currentOracle || state.isGenerating) return;
    if (!global.OraculoNature?.fetchRandomNaturePhoto) {
      showToast('El servicio de paisajes no está disponible.', 'warning');
      return;
    }

    const btn = dom.btnShuffleNature;
    const prevText = btn ? btn.textContent : '';
    if (btn) {
      btn.disabled = true;
      btn.textContent = '🌿 Buscando paisaje natural...';
    }

    try {
      const natureRes = await global.OraculoNature.fetchRandomNaturePhoto(
        state.currentOracle.atmosfera || 'amanecer',
        state.currentOracle.imageDataUrl || ''
      );

      if (natureRes?.imageDataUrl) {
        state.currentOracle.imageDataUrl = natureRes.imageDataUrl;
        state.currentOracle.artSource = natureRes.source;
        await refreshCanvasAndCaption();
        showToast('Fondo de naturaleza actualizado aleatoriamente.', 'success');
      } else {
        state.currentOracle.imageDataUrl = null;
        state.currentOracle.artSource = 'procedural';
        await refreshCanvasAndCaption();
        showToast('Sin conexión a Wikimedia Commons; se generó paisaje ilustrado.', 'info');
      }
    } catch (err) {
      console.error('[Oráculo] Error cambiando fondo natural:', err);
      showToast('No se pudo cargar otro paisaje en este momento.', 'warning');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = prevText || '🏞️ Cambiar Fondo de Naturaleza Aleatorio';
      }
    }
  }

  function downloadCanvasHD() {
    if (!state.currentOracle) return;
    const now = new Date();
    const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
      now.getDate()
    ).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const fileName = `oraculo-${state.settings.tema}-${state.settings.formato.replace(':', 'x')}-${stamp}.png`;

    dom.canvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast('No se pudo exportar la imagen PNG.', 'error');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast(`Imagen HD descargada (${FORMAT_DIMENSIONS[state.settings.formato].label}).`, 'success');
      },
      'image/png',
      1.0
    );
  }

  async function copyCaptionToClipboard() {
    const text = (dom.captionBox.value || '').trim();
    if (!text) return;

    try {
      if (navigator.clipboard && global.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        dom.captionBox.select();
        document.execCommand('copy');
      }
      showToast('Caption copiado al portapapeles.', 'success');
    } catch {
      showToast('No se pudo copiar automáticamente; selecciona el texto manualmente.', 'warning');
    }
  }

  function showApiKeyFeedback(message, status = 'info') {
    if (!dom.apiKeyFeedback) return;
    if (!message) {
      dom.apiKeyFeedback.classList.add('hidden');
      return;
    }
    const styles = {
      ok: 'border-emerald-400 bg-emerald-50 text-emerald-800',
      error: 'border-rose-400 bg-rose-50 text-rose-800',
      info: 'border-sky-400 bg-sky-50 text-sky-800'
    };
    dom.apiKeyFeedback.className = `mt-2 rounded-lg border px-2.5 py-2 text-[11px] font-mono leading-relaxed ${styles[status] || styles.info}`;
    dom.apiKeyFeedback.textContent = message;
  }

  function openSettingsModal() {
    dom.inputApiKey.value = getApiKey();
    dom.inputSignature.value = state.settings.firma || 'By Michael_NB-γ';
    showApiKeyFeedback('');
    syncUIControls();
    dom.settingsModal.classList.remove('hidden');
    dom.settingsModal.classList.add('flex');
  }

  function closeSettingsModal() {
    dom.settingsModal.classList.add('hidden');
    dom.settingsModal.classList.remove('flex');
  }

  function resolveDefaultQrUrl() {
    const isPublicHttp =
      global.location.protocol.startsWith('http') &&
      !/^(localhost|127\.0\.0\.1)$/i.test(global.location.hostname || '');

    if (isPublicHttp) {
      return global.location.href.split('#')[0];
    }

    try {
      const saved = (localStorage.getItem(STORAGE_QR_URL_KEY) || '').trim();
      if (saved) return saved;
    } catch {
      // Ignorar si localStorage no está disponible
    }
    return '';
  }

  function normalizeQrTargetUrl(rawUrl) {
    let clean = String(rawUrl || '').trim();
    if (!clean) return '';
    if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(clean) && /\./.test(clean)) {
      clean = `https://${clean}`;
    }
    return clean;
  }

  function detectGitHubRepoUrl(url) {
    const m = String(url || '').match(/^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s?#]+)(?:[/?#].*)?$/i);
    if (!m) return null;
    const owner = m[1];
    const repo = m[2].replace(/\.git$/i, '');
    if (['features', 'marketplace', 'topics', 'explore', 'settings', 'orgs'].includes(owner.toLowerCase())) {
      return null;
    }
    return `https://${owner}.github.io/${repo}/`;
  }

  function updateQrPreview(rawUrl) {
    if (!dom.qrCanvas || !global.OraculoQR?.renderQRCodeToCanvas) return;
    const normalized = normalizeQrTargetUrl(rawUrl);
    const isLocalFileOrLoopback = /^(file:|https?:\/\/(localhost|127\.0\.0\.1|\[::1\]))/i.test(normalized);
    const ghPagesSuggestion = detectGitHubRepoUrl(normalized);

    if (dom.btnFixGhPages) {
      if (ghPagesSuggestion) {
        dom.btnFixGhPages.classList.remove('hidden');
        dom.btnFixGhPages.textContent = `✨ Convertir automáticamente a GitHub Pages: ${ghPagesSuggestion}`;
        dom.btnFixGhPages.dataset.suggestedUrl = ghPagesSuggestion;
      } else {
        dom.btnFixGhPages.classList.add('hidden');
        dom.btnFixGhPages.dataset.suggestedUrl = '';
      }
    }

    if (dom.qrUrlHint) {
      if (!normalized) {
        dom.qrUrlHint.classList.remove('hidden');
        dom.qrUrlHint.textContent =
          'Estás en tu PC en modo local. Pega arriba el link público de GitHub Pages (https://tu-usuario.github.io/tu-repo/) o Vercel para que el teléfono pueda abrirlo.';
      } else if (isLocalFileOrLoopback) {
        dom.qrUrlHint.classList.remove('hidden');
        dom.qrUrlHint.textContent =
          '⚠️ "localhost" o "file://" solo existen dentro de tu PC y NO abren en el teléfono. Usa tu link HTTPS de GitHub Pages/Vercel (o la IP Wi-Fi de tu PC, ej. http://192.168.1.X:8000).';
      } else if (ghPagesSuggestion) {
        dom.qrUrlHint.classList.remove('hidden');
        dom.qrUrlHint.textContent =
          '⚠️ Ese enlace apunta al código del repositorio en GitHub, no a la web ejecutable. Usa la URL de GitHub Pages (botón azul abajo).';
      } else {
        dom.qrUrlHint.classList.add('hidden');
      }
    }

    if (!normalized) {
      const ctx = dom.qrCanvas.getContext('2d');
      ctx.clearRect(0, 0, dom.qrCanvas.width, dom.qrCanvas.height);
      if (dom.qrEmptyState) dom.qrEmptyState.classList.remove('hidden');
      if (dom.qrEncodedLabel) dom.qrEncodedLabel.textContent = 'Sin enlace configurado todavía';
      if (dom.btnDownloadQr) dom.btnDownloadQr.disabled = true;
      return;
    }

    if (dom.qrEmptyState) dom.qrEmptyState.classList.add('hidden');
    if (dom.btnDownloadQr) dom.btnDownloadQr.disabled = false;

    try {
      global.OraculoQR.renderQRCodeToCanvas(dom.qrCanvas, normalized, 420);
      if (dom.qrEncodedLabel) {
        dom.qrEncodedLabel.textContent = `QR apunta a: ${normalized}`;
      }
    } catch (err) {
      console.warn('[Oráculo] Error generando QR:', err);
      if (dom.qrEncodedLabel) dom.qrEncodedLabel.textContent = err.message || 'Enlace demasiado largo para QR';
      showToast(err.message || 'No se pudo generar el código QR.', 'warning');
    }
  }

  function openQrModal() {
    if (!dom.qrModal) return;
    const initialUrl = resolveDefaultQrUrl();
    if (dom.inputQrUrl) {
      dom.inputQrUrl.value = initialUrl;
    }
    updateQrPreview(initialUrl);
    dom.qrModal.classList.remove('hidden');
    dom.qrModal.classList.add('flex');
  }

  function closeQrModal() {
    if (!dom.qrModal) return;
    dom.qrModal.classList.add('hidden');
    dom.qrModal.classList.remove('flex');
  }

  function downloadQrPng() {
    if (!dom.qrCanvas) return;
    dom.qrCanvas.toBlob(
      (blob) => {
        if (!blob) {
          showToast('No se pudo exportar la imagen QR.', 'error');
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'qr-oraculo-ciber-filosofico.png';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1500);
        showToast('Imagen QR descargada.', 'success');
      },
      'image/png',
      1.0
    );
  }

  function bindEvents() {
    dom.btnInvoke.addEventListener('click', () => invokeOracle({ forceLocal: false }));
    dom.btnDownload.addEventListener('click', downloadCanvasHD);
    dom.btnCopyCaption.addEventListener('click', copyCaptionToClipboard);
    if (dom.btnShuffleNature) {
      dom.btnShuffleNature.addEventListener('click', shuffleNatureBackground);
    }

    dom.captionBox.addEventListener('input', () => {
      if (state.currentOracle) {
        state.currentOracle.caption = dom.captionBox.value;
      }
    });

    const handleFormatChange = async (newFormat) => {
      if (!FORMAT_DIMENSIONS[newFormat]) return;
      state.settings.formato = newFormat;
      saveSettings();
      syncUIControls();
      await refreshCanvasAndCaption();
    };

    dom.formatBtns.forEach((btn) => {
      btn.addEventListener('click', () => handleFormatChange(btn.dataset.formatBtn));
    });

    dom.modalFormatBtns.forEach((btn) => {
      btn.addEventListener('click', () => handleFormatChange(btn.dataset.modalFormat));
    });

    if (dom.btnModeEsperanza) {
      dom.btnModeEsperanza.addEventListener('click', () => {
        state.settings.modo = 'esperanza';
        saveSettings();
        syncUIControls();
        if (state.currentOracle?.modo === 'efemeride' && !state.isGenerating) {
          renderInitialShowcase();
        }
      });
    }

    if (dom.btnModeEfemeride) {
      dom.btnModeEfemeride.addEventListener('click', () => {
        state.settings.modo = 'efemeride';
        saveSettings();
        syncUIControls();
        if (state.currentOracle?.modo !== 'efemeride' && !state.isGenerating) {
          invokeOracle({ forceLocal: false });
        }
      });
    }

    if (dom.ephemerisFocusSelect) {
      dom.ephemerisFocusSelect.addEventListener('change', () => {
        state.settings.efemerideEnfoque = dom.ephemerisFocusSelect.value;
        saveSettings();
        if (state.settings.modo === 'efemeride' && !state.isGenerating) {
          invokeOracle({ forceLocal: false });
        }
      });
    }

    dom.streamSelect.addEventListener('change', () => {
      state.settings.filtro = dom.streamSelect.value;
      saveSettings();
      if (state.settings.modo !== 'efemeride' && !state.isGenerating) {
        invokeOracle({ forceLocal: !hasApiKey() });
      }
    });

    if (dom.toggleWebPulse) {
      dom.toggleWebPulse.addEventListener('change', () => {
        state.settings.webPulseEnabled = Boolean(dom.toggleWebPulse.checked);
        saveSettings();
      });
    }

    dom.btnOpenSettings.addEventListener('click', openSettingsModal);
    dom.apiStatusPill.addEventListener('click', () => {
      if (!hasApiKey()) openSettingsModal();
    });
    dom.btnCloseSettings.addEventListener('click', closeSettingsModal);
    dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === dom.settingsModal) closeSettingsModal();
    });

    if (dom.btnOpenQr) {
      dom.btnOpenQr.addEventListener('click', openQrModal);
    }
    if (dom.btnCloseQr) {
      dom.btnCloseQr.addEventListener('click', closeQrModal);
    }
    if (dom.qrModal) {
      dom.qrModal.addEventListener('click', (e) => {
        if (e.target === dom.qrModal) closeQrModal();
      });
    }
    if (dom.inputQrUrl) {
      dom.inputQrUrl.addEventListener('input', () => {
        const val = dom.inputQrUrl.value.trim();
        try {
          if (val) localStorage.setItem(STORAGE_QR_URL_KEY, val);
        } catch {
          // Ignorar
        }
        updateQrPreview(val);
      });
    }
    if (dom.btnDownloadQr) {
      dom.btnDownloadQr.addEventListener('click', downloadQrPng);
    }
    if (dom.btnFixGhPages) {
      dom.btnFixGhPages.addEventListener('click', () => {
        const suggested = dom.btnFixGhPages.dataset.suggestedUrl || '';
        if (!suggested || !dom.inputQrUrl) return;
        dom.inputQrUrl.value = suggested;
        try {
          localStorage.setItem(STORAGE_QR_URL_KEY, suggested);
        } catch {
          // Ignorar
        }
        updateQrPreview(suggested);
      });
    }

    dom.btnToggleKeyVis.addEventListener('click', () => {
      const isPass = dom.inputApiKey.type === 'password';
      dom.inputApiKey.type = isPass ? 'text' : 'password';
      dom.btnToggleKeyVis.textContent = isPass ? 'Ocultar' : 'Mostrar';
    });

    dom.btnTestApiKey.addEventListener('click', async () => {
      const candidate = dom.inputApiKey.value.trim();
      showApiKeyFeedback('Verificando clave contra Google Gemini...', 'info');
      dom.btnTestApiKey.disabled = true;
      const result = await testApiKey(candidate);
      dom.btnTestApiKey.disabled = false;

      if (result.ok) {
        setApiKey(candidate);
        syncUIControls();
        showApiKeyFeedback(`✅ ${result.message}`, 'ok');
      } else {
        showApiKeyFeedback(`⚠️ ${result.message}`, 'error');
      }
    });

    dom.btnSaveSettings.addEventListener('click', async () => {
      const rawKey = dom.inputApiKey.value.trim();
      if (rawKey.length > 0 && rawKey.length < 20) {
        showApiKeyFeedback(
          `⚠️ La clave ingresada solo tiene ${rawKey.length} caracteres. Verifica que copiaste la API Key completa (empieza por "AIza..." y tiene ~39 caracteres), no el nombre de la clave.`,
          'error'
        );
        return;
      }

      setApiKey(rawKey);
      const sig = dom.inputSignature.value.trim() || 'By Michael_NB-γ';
      state.settings.firma = sig;
      saveSettings();
      syncUIControls();
      closeSettingsModal();
      await refreshCanvasAndCaption();
      showToast(
        rawKey ? 'API Key y configuración guardadas. ¡Listo para invocar con Gemini!' : 'Configuración guardada.',
        'success'
      );
    });

    dom.btnDemoLocal.addEventListener('click', async () => {
      closeSettingsModal();
      await invokeOracle({ forceLocal: true });
    });

    dom.btnClearHistory.addEventListener('click', () => {
      state.history = [];
      localStorage.removeItem(STORAGE_HISTORY_KEY);
      renderHistoryList();
      showToast('Historial limpiado.', 'info');
    });

    global.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      dom.btnInstallPwa.classList.remove('hidden');
    });

    dom.btnInstallPwa.addEventListener('click', async () => {
      if (!state.deferredInstallPrompt) return;
      state.deferredInstallPrompt.prompt();
      const { outcome } = await state.deferredInstallPrompt.userChoice;
      if (outcome === 'accepted') {
        dom.btnInstallPwa.classList.add('hidden');
        showToast('¡Oráculo Ciber-Filosófico instalado!', 'success');
      }
      state.deferredInstallPrompt = null;
    });
  }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator && global.location.protocol.startsWith('http')) {
      global.addEventListener('load', () => {
        navigator.serviceWorker
          .register('./sw.js')
          .then((reg) => reg.update().catch(() => {}))
          .catch((err) => console.warn('[PWA] Error registrando Service Worker:', err));
      });
    }
  }

  async function init() {
    cacheDom();
    loadSettings();
    loadHistory();
    syncUIControls();
    renderHistoryList();
    bindEvents();
    registerServiceWorker();

    try {
      await loadKnowledgeBase();
      await renderInitialShowcase();
    } catch (err) {
      console.error(err);
      showToast('Error inicializando la base de sabiduría.', 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})(window);
