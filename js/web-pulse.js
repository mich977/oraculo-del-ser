/**
 * web-pulse.js
 * Módulo de conexión en vivo con la web para "Oráculo Ciber-Filosófico".
 * Usa JSONP (<script>) para Wikipedia/Wikiquote (sin bloqueo CORS incluso en file://),
 * Google Search Grounding en Gemini 2.5 Flash y endpoint /api/web-pulse en Vercel.
 */
(function (global) {
  'use strict';

  const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

  const MONTHS_ES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
  ];

  async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Petición JSONP mediante etiqueta <script>: funciona incluso en file:// (Origin: null) sin CORS.
   */
  function jsonpRequest(url, timeoutMs = 5500) {
    return new Promise((resolve, reject) => {
      const cbName = `__oraculoJsonp_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      let finished = false;

      const cleanup = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          delete global[cbName];
        } catch {
          global[cbName] = undefined;
        }
      };

      const timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        cleanup();
        reject(new Error('Timeout en conexión JSONP'));
      }, timeoutMs);

      global[cbName] = (data) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      const sep = url.includes('?') ? '&' : '?';
      script.src = `${url}${sep}callback=${cbName}`;
      script.async = true;
      script.onerror = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error('Error de red cargando recurso web'));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Consulta Wikipedia y Wikiquote en español vía JSONP (sin CORS, compatible con file:// y HTTP).
   */
  async function fetchWikimediaJsonpPulse(fecha = new Date()) {
    const dateTitle = `${fecha.getDate()}_de_${MONTHS_ES[fecha.getMonth()]}`;

    const wpRandomUrl =
      'https://es.wikipedia.org/w/api.php?action=query&generator=random&grnnamespace=0&prop=extracts|info&inprop=url&exintro=1&explaintext=1&exchars=260&format=json';
    const wpDateUrl =
      `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(dateTitle)}&prop=extracts|info&inprop=url&explaintext=1&exchars=900&format=json`;
    const wqRandomUrl =
      'https://es.wikiquote.org/w/api.php?action=query&generator=random&grnnamespace=0&prop=extracts|info&inprop=url&explaintext=1&exchars=320&format=json';

    const [rndWp, dateWp, rndWq] = await Promise.allSettled([
      jsonpRequest(wpRandomUrl, 5500),
      jsonpRequest(wpDateUrl, 5500),
      jsonpRequest(wqRandomUrl, 5500)
    ]);

    const insights = [];
    const sources = [];

    if (dateWp.status === 'fulfilled') {
      const pages = Object.values(dateWp.value?.query?.pages || {});
      const p = pages[0];
      if (p?.extract) {
        const lines = p.extract
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => /^\d{3,4}\s*[:\-–]/.test(l) || (l.length > 45 && !l.startsWith('==')));
        const pickedLine = lines.length
          ? lines[Math.floor(Math.random() * Math.min(lines.length, 8))]
          : p.extract.slice(0, 220);
        if (pickedLine) {
          insights.push(`Efeméride real de hoy (${p.title}): ${pickedLine.slice(0, 240)}`);
          sources.push({
            origin: 'Wikipedia Hoy',
            title: p.title,
            url: p.fullurl || `https://es.wikipedia.org/wiki/${encodeURIComponent(dateTitle)}`
          });
        }
      }
    }

    if (rndWp.status === 'fulfilled') {
      const pages = Object.values(rndWp.value?.query?.pages || {});
      const p = pages[0];
      if (p?.title && p?.extract) {
        const cleanExtract = p.extract.replace(/\s+/g, ' ').trim();
        if (cleanExtract.length > 35) {
          insights.push(`Descubrimiento web ("${p.title}"): ${cleanExtract}`);
          sources.push({
            origin: 'Wikipedia',
            title: p.title,
            url: p.fullurl || ''
          });
        }
      }
    }

    if (rndWq.status === 'fulfilled') {
      const pages = Object.values(rndWq.value?.query?.pages || {});
      const p = pages[0];
      if (p?.title && p?.extract) {
        const cleanQuote = p.extract
          .split('\n')
          .map((l) => l.replace(/^[*•\s]+/, '').trim())
          .find((l) => l.length > 30 && !l.startsWith('==') && !/^«?wikiquote/i.test(l));
        if (cleanQuote) {
          insights.push(`Cita/Tema en Wikiquote (${p.title}): ${cleanQuote.slice(0, 240)}`);
          sources.push({
            origin: 'Wikiquote',
            title: p.title,
            url: p.fullurl || ''
          });
        }
      }
    }

    return { insights, sources };
  }

  /**
   * Si corre sobre Vercel (HTTP/HTTPS), consulta titulares RSS reales sin CORS.
   */
  async function fetchVercelRssPulse() {
    if (!global.location.protocol.startsWith('http')) {
      return { insights: [], sources: [] };
    }

    try {
      const res = await fetchWithTimeout('./api/web-pulse', {}, 4500);
      if (!res.ok) return { insights: [], sources: [] };
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) return { insights: [], sources: [] };

      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return { insights: [], sources: [] };

      const picked = items[Math.floor(Math.random() * items.length)];
      return {
        insights: [
          `Titular actual (${picked.source}): "${picked.title}"${picked.summary ? ` — ${picked.summary}` : ''}`
        ],
        sources: [
          {
            origin: picked.source || 'RSS',
            title: picked.title,
            url: picked.url || ''
          }
        ]
      };
    } catch {
      return { insights: [], sources: [] };
    }
  }

  /**
   * Usa Google Search Grounding nativo de Gemini para buscar información fresca de la web hoy.
   */
  async function fetchGeminiGoogleSearchPulse(apiKey, contexto) {
    if (!apiKey || apiKey.length < 20) {
      return { insights: [], sources: [] };
    }

    const activeModel = global.OraculoGemini?.getActiveTextModel?.() || 'gemini-3.8-flash';
    const searchUrl = `${GEMINI_API_BASE}/${activeModel}:generateContent`;

    const searchThemes = [
      'noticia positiva inspiradora o avance humano científico reciente de esta semana',
      'descubrimiento astronómico o fenómeno del cielo visible hoy o esta semana',
      'historia real reciente de resiliencia, solidaridad o superación en el mundo',
      'efeméride cultural, filosófica o científica destacada de hoy en la historia'
    ];
    const angle = searchThemes[Math.floor(Math.random() * searchThemes.length)];

    const prompt = `Busca en Google en tiempo real información verídica relacionada con la fecha de hoy (${contexto.fechaTexto}) enfocada en: ${angle}.
Resume en máximo 3 líneas en español un hecho concreto, real y edificante que sirva como metáfora de esperanza para reflexionar hoy.`;

    try {
      const res = await fetchWithTimeout(
        `${searchUrl}?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            tools: [{ google_search: {} }],
            generationConfig: { temperature: 0.5 }
          })
        },
        7500
      );

      if (!res.ok) return { insights: [], sources: [] };

      const data = await res.json();
      const candidate = data?.candidates?.[0];
      const text = candidate?.content?.parts?.map((p) => p.text || '').join(' ').trim();
      const chunks = candidate?.groundingMetadata?.groundingChunks || [];

      const sources = chunks
        .map((c) => c.web)
        .filter((w) => w && w.uri)
        .slice(0, 3)
        .map((w) => ({
          origin: 'Google Search',
          title: w.title || w.uri,
          url: w.uri
        }));

      if (!text) return { insights: [], sources };
      return {
        insights: [`Pulso Google Search en vivo: ${text}`],
        sources
      };
    } catch (err) {
      console.warn('[WebPulse] Google Search Grounding omitido:', err);
      return { insights: [], sources: [] };
    }
  }

  /**
   * Recopila contexto web en vivo con presupuesto máximo de 3.2 s para no frenar la generación.
   */
  async function gatherLiveWebContext({ apiKey = '', contexto }) {
    const fecha = contexto?.fecha || new Date();
    const allInsights = [];
    const allSources = [];

    const collect = (promise) =>
      promise
        .then((res) => {
          if (res) {
            if (Array.isArray(res.insights)) allInsights.push(...res.insights);
            if (Array.isArray(res.sources)) allSources.push(...res.sources);
          }
        })
        .catch(() => {});

    const tasks = [
      collect(fetchWikimediaJsonpPulse(fecha)),
      collect(fetchVercelRssPulse())
    ];

    if (apiKey && apiKey.length >= 20) {
      tasks.push(collect(fetchGeminiGoogleSearchPulse(apiKey, contexto)));
    }

    // Esperar como máximo 3.2 segundos (si las fuentes responden antes, continúa de inmediato)
    await Promise.race([
      Promise.allSettled(tasks),
      new Promise((resolve) => setTimeout(resolve, 3200))
    ]);

    const seen = new Set();
    const uniqueSources = [];
    for (const src of allSources) {
      const key = src.url || src.title;
      if (key && !seen.has(key)) {
        seen.add(key);
        uniqueSources.push(src);
      }
    }

    if (!allInsights.length) {
      return {
        connected: false,
        summaryText: '',
        sources: [],
        headline: 'Sin conexión a fuentes web en este momento'
      };
    }

    return {
      connected: true,
      summaryText: allInsights.join('\n'),
      sources: uniqueSources.slice(0, 4),
      headline: uniqueSources[0]?.title || 'Pulso Web en Vivo'
    };
  }

  global.OraculoWebPulse = {
    gatherLiveWebContext
  };
})(window);
