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
    generateOracleArt,
    buildLocalOracleFallback
  } = global.OraculoGemini;

  const { renderOracleCanvas, FORMAT_DIMENSIONS, ATMOSPHERE_PALETTES } = global.OraculoCanvas;

  const STORAGE_SETTINGS_KEY = 'oraculo_cf_settings';
  const STORAGE_HISTORY_KEY = 'oraculo_cf_history';
  const STORAGE_QR_URL_KEY = 'oraculo_cf_public_url';
  const MAX_HISTORY = 5;

  const FILTROS = {
    aleatorio: 'Aleatorio Cósmico',
    estoicismo: 'Estoicismo',
    kybalion: 'Kybalion & Hermetismo',
    numerologia: 'Numerología del Día',
    historia: 'Historia & Arquetipos'
  };

  const state = {
    sabiduria: null,
    settings: {
      tema: 'naturaleza',
      formato: '4:5',
      firma: 'By Michael_NB-γ',
      filtro: 'aleatorio',
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
    dom.btnDownload = document.getElementById('btn-download');
    dom.btnCopyCaption = document.getElementById('btn-copy-caption');
    dom.btnShuffleNature = document.getElementById('btn-shuffle-nature');
    dom.captionBox = document.getElementById('caption-preview');
    dom.artBadge = document.getElementById('art-source-badge');
    dom.numerologyPill = document.getElementById('daily-numerology-pill');
    dom.apiStatusPill = document.getElementById('api-status-pill');

    dom.streamSelect = document.getElementById('stream-select');
    dom.toggleWebPulse = document.getElementById('toggle-web-pulse');
    dom.webSourcesBox = document.getElementById('web-sources-box');
    dom.webSourcesList = document.getElementById('web-sources-list');
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
    dom.qrCanvas = document.getElementById('qr-canvas');
    dom.btnDownloadQr = document.getElementById('btn-download-qr');
  }

  function showToast(message, type = 'info', durationMs = null) {
    const colors = {
      info: 'border-cyan-400/50 bg-slate-900/95 text-cyan-100',
      success: 'border-emerald-400/50 bg-slate-900/95 text-emerald-100',
      warning: 'border-amber-400/50 bg-slate-900/95 text-amber-100',
      error: 'border-rose-500/60 bg-slate-950/95 text-rose-100'
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
    if (global.SABIDURIA_DATA) {
      state.sabiduria = global.SABIDURIA_DATA;
      return;
    }

    if (global.location.protocol.startsWith('http')) {
      const res = await fetch('./data/sabiduria.json');
      if (res.ok) {
        state.sabiduria = await res.json();
        return;
      }
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
    const signoOcc = pickRandom(db.astrologia_historia.zodiaco_occidental);
    const signoChino = pickRandom(db.astrologia_historia.zodiaco_chino);
    const elemento = pickRandom(db.astrologia_historia.elementos);
    const historia = pickRandom(db.astrologia_historia.lecciones_historicas);

    const bloques = [];
    const corrientesObj = {};

    if (filtro === 'estoicismo') {
      corrientesObj.estoicismo = estoico;
      bloques.push(
        `- Estoicismo (${estoico.autor}, ${estoico.obra} · Pilar ${estoico.pilar}): "${estoico.maxima}". Enseñanza: ${estoico.ensenanza}. Aplicación: ${estoico.aplicacion_practica}`
      );
      if (estoico2) {
        bloques.push(
          `- Refuerzo Estoico (${estoico2.autor}): "${estoico2.maxima}". Aplicación: ${estoico2.aplicacion_practica}`
        );
      }
    } else if (filtro === 'kybalion') {
      corrientesObj.kybalion = kybalion;
      bloques.push(
        `- Hermetismo / Kybalion (${kybalion.nombre}): Axioma "${kybalion.axioma}". Principio: ${kybalion.principio}. Aplicación: ${kybalion.aplicacion_practica}`
      );
      bloques.push(`- Elemento de transmutación (${elemento.nombre}): ${elemento.sabiduria}`);
    } else if (filtro === 'numerologia') {
      corrientesObj.kybalion = kybalion;
      corrientesObj.estoicismo = estoico;
      bloques.push(
        `- Numerología del Día (${numInfo.titulo}): Luz (${numInfo.luz}) vs Sombra (${numInfo.sombra}). Vibración: ${numInfo.vibracion}`
      );
      bloques.push(`- Puente Hermético (${kybalion.nombre}): "${kybalion.axioma}"`);
      bloques.push(`- Ancla Estoica (${estoico.autor}): "${estoico.maxima}"`);
    } else if (filtro === 'historia') {
      corrientesObj.historia = historia;
      corrientesObj.astrologia = signoOcc;
      bloques.push(
        `- Lección Histórica (${historia.personaje_o_evento}, ${historia.epoca}): ${historia.leccion} Clave: ${historia.aplicacion}`
      );
      bloques.push(
        `- Arquetipo Zodiacal (${signoOcc.nombre} · ${signoOcc.arquetipo}, ${signoOcc.elemento}): ${signoOcc.sabiduria}`
      );
      bloques.push(
        `- Arquetipo Oriental (${signoChino.nombre} · ${signoChino.arquetipo}): ${signoChino.virtud}`
      );
    } else {
      corrientesObj.kybalion = kybalion;
      corrientesObj.estoicismo = estoico;
      corrientesObj.historia = historia;
      corrientesObj.astrologia = signoOcc;
      bloques.push(`- Kybalion (${kybalion.nombre}): "${kybalion.axioma}" — ${kybalion.aplicacion_practica}`);
      bloques.push(`- Estoicismo (${estoico.autor}): "${estoico.maxima}" — ${estoico.ensenanza}`);
      bloques.push(`- Historia (${historia.personaje_o_evento}): ${historia.aplicacion}`);
      bloques.push(`- Arquetipo (${signoOcc.nombre} / ${elemento.nombre}): ${signoOcc.sabiduria}`);
    }

    return {
      fecha: hoy,
      fechaTexto,
      filtro,
      filtroLabel: FILTROS[filtro] || FILTROS.aleatorio,
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
        'w-full text-left rounded-xl border border-slate-800/90 bg-slate-900/70 hover:border-cyan-400/50 hover:bg-slate-900 p-3.5 transition-all group';
      const fecha = new Date(item.timestamp).toLocaleString('es-ES', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
      btn.innerHTML = `
        <div class="flex items-center justify-between gap-2 mb-1">
          <span class="text-[11px] font-mono uppercase tracking-wider text-cyan-400">${escapeHtml(item.filtroLabel || 'Oráculo')} · N° ${item.numeroDia || '-'}</span>
          <span class="text-[11px] text-slate-500">${escapeHtml(fecha)}</span>
        </div>
        <p class="text-xs font-semibold text-slate-100 line-clamp-1 group-hover:text-cyan-300 transition-colors">${escapeHtml(item.gancho)}</p>
        <p class="text-xs text-slate-400 line-clamp-2 mt-1">${escapeHtml(item.frase)}</p>
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
    const { formato, filtro } = state.settings;

    dom.formatBtns.forEach((b) => {
      const active = b.dataset.formatBtn === formato;
      b.classList.toggle('bg-cyan-500/20', active);
      b.classList.toggle('text-cyan-300', active);
      b.classList.toggle('border-cyan-400/50', active);
      b.classList.toggle('text-slate-400', !active);
      b.classList.toggle('border-slate-800', !active);
    });

    dom.modalFormatBtns.forEach((b) => {
      const active = b.dataset.modalFormat === formato;
      b.classList.toggle('bg-cyan-500/20', active);
      b.classList.toggle('text-cyan-300', active);
      b.classList.toggle('border-cyan-400/60', active);
      b.classList.toggle('text-slate-400', !active);
      b.classList.toggle('border-slate-700', !active);
    });

    dom.canvasWrapper.style.aspectRatio = formato === '9:16' ? '9 / 16' : '4 / 5';
    dom.streamSelect.value = filtro;
    if (dom.toggleWebPulse) {
      dom.toggleWebPulse.checked = state.settings.webPulseEnabled !== false;
    }

    if (hasApiKey()) {
      dom.apiStatusPill.textContent = 'Gemini API Activa';
      dom.apiStatusPill.className =
        'inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-300';
    } else {
      dom.apiStatusPill.textContent = 'Sin API Key (Configurar)';
      dom.apiStatusPill.className =
        'inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-[11px] font-mono text-amber-300 cursor-pointer';
    }
  }

  function renderWebSources(oracle) {
    if (!dom.webSourcesBox || !dom.webSourcesList) return;
    dom.webSourcesList.innerHTML = '';

    const sources = oracle?.webSources || [];
    const attempted = Boolean(oracle?.webPulseAttempted);

    if (sources.length === 0 && !attempted) {
      dom.webSourcesBox.classList.add('hidden');
      return;
    }

    dom.webSourcesBox.classList.remove('hidden');

    if (sources.length === 0 && attempted) {
      const warn = document.createElement('p');
      warn.className = 'text-[11px] font-mono text-amber-300/90 leading-relaxed';
      warn.textContent =
        '⚠️ No se pudo alcanzar Wikipedia/Google desde esta red (posible firewall/proxy corporativo o sin internet). Se usó sabiduría local.';
      dom.webSourcesList.appendChild(warn);
      return;
    }

    if (oracle?.webSnippet) {
      const snip = document.createElement('p');
      snip.className = 'w-full text-[11px] text-slate-300 leading-relaxed mb-1';
      snip.textContent = oracle.webSnippet;
      dom.webSourcesList.appendChild(snip);
    }

    sources.forEach((src) => {
      const label = `${src.origin ? `${src.origin}: ` : ''}${src.title || 'Fuente web'}`;
      if (src.url && /^https?:\/\//i.test(src.url)) {
        const a = document.createElement('a');
        a.href = src.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.className =
          'inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-mono text-cyan-200 hover:bg-cyan-500/20 transition-colors max-w-full truncate';
        a.textContent = label;
        dom.webSourcesList.appendChild(a);
      } else {
        const span = document.createElement('span');
        span.className =
          'inline-flex items-center rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-[11px] font-mono text-slate-300 max-w-full truncate';
        span.textContent = label;
        dom.webSourcesList.appendChild(span);
      }
    });
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
    renderWebSources(o);
  }

  async function renderInitialShowcase() {
    const contexto = buildOracleContext('aleatorio');
    const num = contexto.numerologiaDia;
    dom.numerologyPill.textContent = `Vibración del Día: ${num.numero} · ${num.titulo.split('·')[0].trim()}`;

    if (state.history.length > 0) {
      state.currentOracle = { ...state.history[0] };
      await refreshCanvasAndCaption();
      return;
    }

    state.currentOracle = {
      id: 'welcome',
      timestamp: Date.now(),
      gancho: 'CUANDO SIENTAS QUE LA TORMENTA NO TERMINA',
      frase:
        'Incluso la noche más larga obedece al ritmo del universo y prepara en silencio la claridad de tu próximo amanecer.',
      palabras_clave: ['ritmo', 'claridad', 'amanecer'],
      atmosfera: 'amanecer',
      caption:
        '🌅 CUANDO SIENTAS QUE LA TORMENTA NO TERMINA\n\nIncluso la noche más larga obedece al ritmo del universo y prepara en silencio la claridad de tu próximo amanecer.\n\nPresiona "✨ INVOCAR MENSAJE" para recibir una nueva palabra de esperanza y sabiduría con un fondo de naturaleza aleatorio.\n\n#Esperanza #OraculoCiberFilosofico #Estoicismo #Kybalion #LuzInterior',
      filtro: 'aleatorio',
      filtroLabel: 'Mensaje de Esperanza',
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

    if (!forceLocal && !hasApiKey()) {
      showToast('Ingresa tu GEMINI_API_KEY o usa el Modo Local Demo.', 'warning');
      openSettingsModal();
      return;
    }

    const contexto = buildOracleContext(state.settings.filtro);
    const seenList = [state.currentOracle, ...state.history]
      .filter((item) => item && item.gancho && item.frase)
      .map((item) => ({ gancho: item.gancho, frase: item.frase }));
    contexto.recentMessages = seenList;

    const previousNatureUrl = state.currentOracle?.imageDataUrl || '';

    try {
      let webPulse = null;
      const webAttempted = Boolean(state.settings.webPulseEnabled && global.OraculoWebPulse);

      if (webAttempted) {
        setLoading(true, '1/3 Conectando con información viva de la web...');
        webPulse = await global.OraculoWebPulse.gatherLiveWebContext({
          apiKey: forceLocal ? '' : getApiKey(),
          contexto
        });
        if (webPulse?.connected) {
          contexto.webPulse = webPulse;
        }
      }

      const webConnected = Boolean(webPulse?.connected);
      const webSnippet = webPulse?.summaryText ? webPulse.summaryText.split('\n')[0] : '';

      setLoading(
        true,
        forceLocal
          ? 'Sintetizando Oráculo de Esperanza...'
          : `${webConnected ? '2/3' : '1/2'} Canalizando sabiduría con Google Gemini...`
      );

      let textPayload;
      let usedQuotaFallback = false;
      let artResult = { imageDataUrl: null, source: 'procedural' };

      if (forceLocal) {
        await new Promise((r) => setTimeout(r, 220));
        textPayload = buildLocalOracleFallback(contexto);
      } else {
        try {
          textPayload = await generateOracleText(contexto, state.settings.tema);
        } catch (geminiErr) {
          const errMsg = String(geminiErr?.message || '');
          const isQuota =
            geminiErr?.code === 'QUOTA_EXCEEDED' ||
            /429|quota|RESOURCE_EXHAUSTED|rate.?limit|billing|credit|exceeded/i.test(errMsg);
          if (isQuota) {
            usedQuotaFallback = true;
            textPayload = buildLocalOracleFallback(contexto);
            if (dom.apiStatusPill) {
              dom.apiStatusPill.textContent = 'Cuota Gemini Agotada · Modo Local';
              dom.apiStatusPill.className =
                'inline-flex items-center gap-1.5 rounded-full border border-rose-500/50 bg-rose-500/15 px-2.5 py-1 text-[11px] font-mono text-rose-200 cursor-pointer';
            }
          } else {
            throw geminiErr;
          }
        }
      }

      if (global.OraculoNature?.fetchRandomNaturePhoto) {
        setLoading(true, `${webConnected && !forceLocal ? '3/3' : '2/2'} Buscando paisaje natural aleatorio...`);
        const natureRes = await global.OraculoNature.fetchRandomNaturePhoto(
          textPayload.atmosfera,
          previousNatureUrl
        );
        if (natureRes?.imageDataUrl) {
          artResult = natureRes;
        }
      }

      const finalOracle = {
        id: `orc_${Date.now()}`,
        timestamp: Date.now(),
        ...textPayload,
        filtro: contexto.filtro,
        filtroLabel: contexto.filtroLabel,
        numeroDia: contexto.numerologiaDia.numero,
        webSources: webPulse?.sources || [],
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
          '⚠️ Tu API Key alcanzó el límite de cuota/créditos de Gemini (429). Se generó un mensaje local distinto para que no se repita.',
          'warning',
          7500
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
      ok: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
      error: 'border-rose-500/50 bg-rose-500/10 text-rose-200',
      info: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200'
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

  function updateQrPreview(rawUrl) {
    if (!dom.qrCanvas || !global.OraculoQR?.renderQRCodeToCanvas) return;
    const clean = String(rawUrl || '').trim();
    const isLocalHost = !clean || /^(file:|https?:\/\/(localhost|127\.0\.0\.1))/i.test(clean);

    if (dom.qrUrlHint) {
      if (!clean) {
        dom.qrUrlHint.classList.remove('hidden');
        dom.qrUrlHint.textContent =
          'Estás en modo local. Pega arriba el link público de GitHub Pages o Vercel (ej: https://tu-usuario.github.io/tu-repo/) para generar el QR instalable.';
      } else if (isLocalHost) {
        dom.qrUrlHint.classList.remove('hidden');
        dom.qrUrlHint.textContent =
          'Aviso: un enlace localhost o file:// no abre en el teléfono; usa tu link público HTTPS de GitHub Pages o Vercel.';
      } else {
        dom.qrUrlHint.classList.add('hidden');
      }
    }

    const targetUrl = clean || 'https://github.com';
    try {
      global.OraculoQR.renderQRCodeToCanvas(dom.qrCanvas, targetUrl, 240);
    } catch (err) {
      console.warn('[Oráculo] Error generando QR:', err);
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

    dom.streamSelect.addEventListener('change', () => {
      state.settings.filtro = dom.streamSelect.value;
      saveSettings();
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
