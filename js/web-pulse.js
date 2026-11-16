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

  const stoicQuotesCache = { loaded: false, items: [] };
  const taoQuotesCache = { loaded: false, items: [] };
  const filosofiaQuotesCache = { loaded: false, items: [] };
  const kybalionQuotesCache = { loaded: false, items: [] };

  function parseWikiquoteAuthorPage(pageTitle, wikitext, pageUrl, defaultWorks) {
    const cleanAuthor = String(pageTitle || '')
      .replace(/^Lucio Anneo\s+/i, '')
      .replace(/^Cayo\s+/i, '')
      .trim();
    const defaultWork = defaultWorks[cleanAuthor] || 'Wikiquote';

    const quotes = [];
    const lines = String(wikitext || '').split('\n');
    let inQuotes = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const sec = line.match(/^==+\s*([^=]+?)\s*==+$/);
      if (sec) {
        const h = sec[1].toLowerCase();
        if (/sobre\s|referencia|bibliograf|enlace|v[eé]ase|biograf|vida|obra|cultura|atribuida|dudosa/i.test(h)) {
          inQuotes = false;
        } else if (/citas|frases|m[aá]ximas|pensamientos/i.test(h)) {
          inQuotes = true;
        }
        continue;
      }

      if (!inQuotes) continue;
      if (!/^\*\s+[^*]/.test(line)) continue;

      let quoteText = cleanWikitextLine(line.replace(/^\*\s+/, ''));
      quoteText = quoteText.replace(/^[«"“]+|[»"”]+$/g, '').trim();
      if (
        quoteText.length < 32 ||
        quoteText.length > 180 ||
        !/[.!?]$/.test(quoteText) ||
        /\[\[|\]\]|—\s*[A-ZÁÉÍÓÚÑ]|wikiquote|traducci[oó]n|original en lat[ií]n|fuente:|nota:|isbn|http/i.test(quoteText)
      ) {
        continue;
      }

      let obra = defaultWork;
      const nextLine = (lines[i + 1] || '').trim();
      if (/^\*\*/.test(nextLine)) {
        const cleanSub = cleanWikitextLine(nextLine.replace(/^\*+\s*/, ''))
          .replace(/^(fuente|obra|referencia)\s*:\s*/i, '')
          .trim();
        if (cleanSub.length >= 4 && cleanSub.length <= 70) {
          obra = cleanSub;
        }
      }

      quotes.push({
        autor: cleanAuthor,
        obra,
        maxima: quoteText,
        sourceUrl: pageUrl || 'https://es.wikiquote.org/'
      });
    }

    return quotes;
  }

  async function fetchWikiquoteLineageQuote({ titles, defaultWorks, cache, recentMessages = [] }) {
    if (!cache.loaded) {
      const url =
        `https://es.wikiquote.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}` +
        `&prop=revisions|info&rvprop=content&rvslots=main&inprop=url&redirects=1&format=json`;
      try {
        const data = await jsonpRequest(url, 3200);
        const pages = Object.values(data?.query?.pages || {});
        const collected = [];
        for (const p of pages) {
          const wt = p?.revisions?.[0]?.slots?.main?.['*'] || p?.revisions?.[0]?.['*'] || '';
          if (wt) {
            collected.push(...parseWikiquoteAuthorPage(p.title, wt, p.fullurl, defaultWorks));
          }
        }
        if (collected.length > 0) {
          cache.items = collected;
          cache.loaded = true;
        }
      } catch {
        // Sin conexión a Wikiquote; se usará el códice local
      }
    }

    if (!cache.items.length) return null;

    const seenTexts = new Set(
      (recentMessages || []).map((m) => String(m.frase || '').toLowerCase().slice(0, 48))
    );
    const fresh = cache.items.filter(
      (q) => !seenTexts.has(q.maxima.toLowerCase().slice(0, 48))
    );
    const pool = fresh.length ? fresh : cache.items;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Recopila contexto web en vivo rápidamente (Wikipedia/Wikiquote JSONP y /api/web-pulse).
   * Para Estoicismo y Taoísmo consulta directamente frases reales de sus maestros en Wikiquote.
   */
  async function gatherLiveWebContext({ apiKey = '', contexto } = {}) {
    if (contexto?.filtro === 'estoicismo') {
      const stoicQuote = await Promise.race([
        fetchWikiquoteLineageQuote({
          titles: 'Marco_Aurelio|Lucio_Anneo_Séneca|Epicteto|Zenón_de_Citio|Cleantes|Crisipo_de_Solos',
          defaultWorks: {
            'Marco Aurelio': 'Meditaciones (Wikiquote)',
            'Séneca': 'Séneca el Joven · Cartas y Tratados (Wikiquote)',
            Epicteto: 'Enquiridión y Disertaciones (Wikiquote)',
            'Zenón de Citio': 'Fragmentos (Wikiquote)',
            Cleantes: 'Cleantes de Aso · Himno a Zeus (Wikiquote)',
            'Crisipo de Solos': 'Fragmentos SVF (Wikiquote)'
          },
          cache: stoicQuotesCache,
          recentMessages: contexto.recentMessages
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2400))
      ]);
      if (stoicQuote) {
        return {
          connected: true,
          stoicQuote,
          summaryText: `Cita estoica real (${stoicQuote.autor} · ${stoicQuote.obra}): "${stoicQuote.maxima}"`,
          sources: [
            {
              origin: 'Wikiquote Estoicismo',
              title: `${stoicQuote.autor} (${stoicQuote.obra})`,
              url: stoicQuote.sourceUrl
            }
          ],
          headline: `${stoicQuote.autor}: ${stoicQuote.obra}`
        };
      }
      return {
        connected: false,
        stoicQuote: null,
        summaryText: '',
        sources: [],
        headline: 'Usando códice de libros estoicos locales'
      };
    }

    if (contexto?.filtro === 'taoismo') {
      const taoQuote = await Promise.race([
        fetchWikiquoteLineageQuote({
          titles: 'Lao-Tse|Zhuangzi|Tao_Te_Ching|Lie_Yukou',
          defaultWorks: {
            'Lao-Tse': 'Tao Te Ching (Wikiquote)',
            'Tao Te Ching': 'Laozi · Tao Te Ching (Wikiquote)',
            Zhuangzi: 'Zhuangzi / Chuang Tzu (Wikiquote)',
            'Lie Yukou': 'Liezi (Wikiquote)'
          },
          cache: taoQuotesCache,
          recentMessages: contexto.recentMessages
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2400))
      ]);
      if (taoQuote) {
        return {
          connected: true,
          taoQuote,
          summaryText: `Sabiduría taoísta real (${taoQuote.autor} · ${taoQuote.obra}): "${taoQuote.maxima}"`,
          sources: [
            {
              origin: 'Wikiquote Taoísmo',
              title: `${taoQuote.autor} (${taoQuote.obra})`,
              url: taoQuote.sourceUrl
            }
          ],
          headline: `${taoQuote.autor}: ${taoQuote.obra}`
        };
      }
      return {
        connected: false,
        taoQuote: null,
        summaryText: '',
        sources: [],
        headline: 'Usando códice de maestros taoístas locales'
      };
    }

    if (contexto?.filtro === 'filosofia') {
      const filosofiaQuote = await Promise.race([
        fetchWikiquoteLineageQuote({
          titles:
            'Sócrates|Platón|Aristóteles|Epicuro|Agustín_de_Hipona|Tomás_de_Aquino|Nicolás_Maquiavelo|René_Descartes|Baruch_Spinoza|John_Locke|David_Hume|Immanuel_Kant|Georg_Wilhelm_Friedrich_Hegel|Karl_Marx|Friedrich_Nietzsche|Ludwig_Wittgenstein|Martin_Heidegger|Hannah_Arendt|Eckhart_Tolle',
          defaultWorks: {
            Sócrates: 'Diálogos / Apología (Wikiquote)',
            Platón: 'La República / Diálogos (Wikiquote)',
            Aristóteles: 'Ética a Nicómaco (Wikiquote)',
            Epicuro: 'Carta a Meneceo (Wikiquote)',
            'Agustín de Hipona': 'Confesiones (Wikiquote)',
            'Tomás de Aquino': 'Suma Teológica (Wikiquote)',
            'Nicolás Maquiavelo': 'El Príncipe / Discursos (Wikiquote)',
            'René Descartes': 'Discurso del método (Wikiquote)',
            'Baruch Spinoza': 'Ética (Wikiquote)',
            'John Locke': 'Ensayo sobre el entendimiento (Wikiquote)',
            'David Hume': 'Tratado de la naturaleza humana (Wikiquote)',
            'Immanuel Kant': 'Crítica de la razón práctica (Wikiquote)',
            'Georg Wilhelm Friedrich Hegel': 'Fenomenología del espíritu (Wikiquote)',
            'Karl Marx': 'Obras Filosóficas (Wikiquote)',
            'Friedrich Nietzsche': 'Así habló Zaratustra (Wikiquote)',
            'Ludwig Wittgenstein': 'Tractatus Logico-Philosophicus (Wikiquote)',
            'Martin Heidegger': 'Ser y Tiempo / Serenidad (Wikiquote)',
            'Hannah Arendt': 'La condición humana (Wikiquote)',
            'Eckhart Tolle': 'El poder del ahora (Wikiquote)'
          },
          cache: filosofiaQuotesCache,
          recentMessages: contexto.recentMessages
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2600))
      ]);
      if (filosofiaQuote) {
        return {
          connected: true,
          filosofiaQuote,
          summaryText: `Cita filosófica real (${filosofiaQuote.autor} · ${filosofiaQuote.obra}): "${filosofiaQuote.maxima}"`,
          sources: [
            {
              origin: 'Wikiquote Filosofía',
              title: `${filosofiaQuote.autor} (${filosofiaQuote.obra})`,
              url: filosofiaQuote.sourceUrl
            }
          ],
          headline: `${filosofiaQuote.autor}: ${filosofiaQuote.obra}`
        };
      }
      return {
        connected: false,
        filosofiaQuote: null,
        summaryText: '',
        sources: [],
        headline: 'Usando códice filosófico curado'
      };
    }

    if (contexto?.filtro === 'kybalion') {
      const kybalionQuote = await Promise.race([
        fetchWikiquoteLineageQuote({
          titles:
            'Hermes_Trismegisto|Pitágoras|Paracelso|Giordano_Bruno|Wallace_Wattles|Wayne_Dyer|El_Kybalión',
          defaultWorks: {
            'Hermes Trismegisto': 'Corpus Hermeticum (Wikiquote)',
            Pitágoras: 'Versos de Oro (Wikiquote)',
            Paracelso: 'De Natura Rerum (Wikiquote)',
            'Giordano Bruno': 'Obras Herméticas (Wikiquote)',
            'Wallace Wattles': 'La ciencia de hacerse rico (Wikiquote)',
            'Wayne Dyer': 'El poder de la intención (Wikiquote)',
            'El Kybalión': 'Los Tres Iniciados · El Kybalión (Wikiquote)'
          },
          cache: kybalionQuotesCache,
          recentMessages: contexto.recentMessages
        }),
        new Promise((resolve) => setTimeout(() => resolve(null), 2600))
      ]);
      if (kybalionQuote) {
        return {
          connected: true,
          kybalionQuote,
          summaryText: `Ley Universal (${kybalionQuote.autor} · ${kybalionQuote.obra}): "${kybalionQuote.maxima}"`,
          sources: [
            {
              origin: 'Wikiquote Leyes Universales',
              title: `${kybalionQuote.autor} (${kybalionQuote.obra})`,
              url: kybalionQuote.sourceUrl
            }
          ],
          headline: `${kybalionQuote.autor}: ${kybalionQuote.obra}`
        };
      }
      return {
        connected: false,
        kybalionQuote: null,
        summaryText: '',
        sources: [],
        headline: 'Usando códice de Maestros y Kybalion locales'
      };
    }

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

    const fastTasks = [
      collect(fetchWikimediaJsonpPulse(fecha)),
      collect(fetchVercelRssPulse())
    ];

    // Esperar como máximo 1.5 segundos las fuentes web abiertas (Wikipedia/Wikiquote/RSS)
    await Promise.race([
      Promise.allSettled(fastTasks),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]);

    // Solo si fallaron las fuentes abiertas y hay API Key, usar Google Search como último recurso (máx 2.2s)
    if (!allInsights.length && apiKey && apiKey.length >= 20) {
      await Promise.race([
        collect(fetchGeminiGoogleSearchPulse(apiKey, contexto)),
        new Promise((resolve) => setTimeout(resolve, 2200))
      ]);
    }

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

  const ephemerisDayCache = new Map();

  function isUsableWikiPhotoUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) return false;
    if (/\.(svg|gif|pdf|djvu|ogv|webm)(\?|$)/i.test(url)) return false;
    if (/flag_of_|commons-logo|ambox|wikidata-logo|pictogram|crystal_clear|nuvola_|red_pog|blue_pog/i.test(url)) {
      return false;
    }
    return true;
  }

  function safeWikimedia960Thumb(thumbUrl, origWidth = 0) {
    if (!thumbUrl || !/upload\.wikimedia\.org\/.*\/thumb\//i.test(thumbUrl)) return '';
    if (origWidth && origWidth < 800) return '';
    // Wikimedia acepta ancho estándar 960px cuando la imagen original lo soporta
    return String(thumbUrl).replace(/\/(\d+)px-([^/]+)$/, '/960px-$2');
  }

  function collectRestPageImages(item) {
    const pages = Array.isArray(item?.pages) ? item.pages : [];
    const urls = [];
    const pushIfValid = (u) => {
      if (u && isUsableWikiPhotoUrl(u) && !urls.includes(u)) {
        urls.push(u);
      }
    };

    for (const page of pages.slice(0, 4)) {
      const thumb = page?.thumbnail?.source || '';
      const orig = page?.originalimage?.source || '';
      const origW = Number(page?.originalimage?.width || 0);

      if (thumb) {
        const hiThumb = safeWikimedia960Thumb(thumb, origW);
        if (hiThumb) pushIfValid(hiThumb);
        pushIfValid(thumb);
      }
      if (orig && (!origW || origW <= 2600)) {
        pushIfValid(orig);
      }
    }
    return urls;
  }

  function extractWikiTitlesFromLine(line) {
    const titles = [];
    const rx = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
    let m;
    while ((m = rx.exec(String(line || ''))) !== null) {
      const t = m[1].trim();
      if (t && !/^(archivo|file|imagen|image|categor[ií]a|category|anexo|ayuda|wikipedia):/i.test(t) && !/^\d{1,4}$/.test(t)) {
        if (!titles.includes(t)) titles.push(t);
      }
    }
    return titles.slice(0, 4);
  }

  const COUNTRY_CODE_MAP = {
    CHI: 'Chile',
    CHL: 'Chile',
    ARG: 'Argentina',
    PER: 'Perú',
    MEX: 'México',
    ESP: 'España',
    COL: 'Colombia',
    BOL: 'Bolivia',
    VEN: 'Venezuela',
    URY: 'Uruguay',
    ECU: 'Ecuador',
    PRY: 'Paraguay',
    BRA: 'Brasil',
    USA: 'Estados Unidos'
  };

  function collapseAdjacentDuplicates(text) {
    let s = String(text || '').replace(/\s+/g, ' ').trim();
    // Colapsar "Argentina Argentina:" / "Chile Chile:" / "Estados Unidos Estados Unidos:"
    s = s.replace(
      /\b([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚáéíóúÑñ]+){0,2})(?:\s*[,;:\-–]?\s+)\1\b/gi,
      '$1'
    );
    s = s.replace(/\s+([:.,;])/g, '$1');
    return s.trim();
  }

  function cleanWikitextLine(raw) {
    let s = String(raw || '');
    s = s.replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
    s = s.replace(/<ref[^/]*\/>/gi, '');
    s = s.replace(/<!--[\s\S]*?-->/g, '');
    s = s.replace(/\[\[(?:Archivo|File|Imagen|Image):[^\]]+\]\]/gi, '');
    s = s.replace(/\{\{(?:bandera2?|flag)\|([^|}]+)(?:\|[^}]*)?\}\}/gi, (_, code) => {
      const upper = code.trim().toUpperCase();
      return `${COUNTRY_CODE_MAP[upper] || code.trim()} `;
    });
    s = s.replace(/\{\{(CHI|CHL|ARG|PER|MEX|ESP|COL|BOL|VEN|URY|ECU|PRY|BRA|USA)\}\}/g, (_, code) => {
      return COUNTRY_CODE_MAP[code] || code;
    });
    s = s.replace(/\{\{(?:siglo|a\.?\s*C\.?|d\.?\s*C\.?)\|([^|}]+)(?:\|[^}]*)?\}\}/gi, '$1');
    s = s.replace(/\{\{[^{}]*\}\}/g, '');
    s = s.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1');
    s = s.replace(/\[\[([^\]]+)\]\]/g, '$1');
    s = s.replace(/'''?/g, '');
    s = s.replace(/<[^>]+>/g, '');
    s = s.replace(/&nbsp;/gi, ' ');
    return collapseAdjacentDuplicates(s);
  }

  const CHILE_STRICT_REGEX =
    /\b(chile|chilen[oa]s?|santiago de chile|valpara[ií]so|concepci[oó]n|antofagasta|iquique|temuco|valdivia|punta arenas|pe[ñn]alol[eé]n|rapa nui|isla de pascua|chilo[eé]|atacama|mapuche|bernardo o'higgins|gabriela mistral|pablo neruda|violeta parra|arturo prat|manuel rodr[ií]guez|jos[eé] miguel carrera|salvador allende|patricio aylwin|v[ií]ctor jara|tricel)\b/i;

  const FOREIGN_LEAD_REGEX =
    /^\s*(?:\d{3,4}\s*[:\-–.]\s*)?(?:en\s+)?(?:argentina|per[uú]|bolivia|m[eé]xico|espa[nñ]a|colombia|venezuela|ecuador|uruguay|paraguay|brasil|cuba|panam[aá]|costa rica|guatemala|honduras|el salvador|nicaragua|rep[uú]blica dominicana|puerto rico|estados unidos|canad[aá]|francia|italia|alemania|reino unido|inglaterra|rusia|china|jap[oó]n|india)\b/i;

  function isStrictChileEvent(text) {
    const clean = String(text || '').trim();
    if (!clean) return false;
    if (!CHILE_STRICT_REGEX.test(clean)) return false;
    if (FOREIGN_LEAD_REGEX.test(clean) && !/\ben chile\b/i.test(clean)) return false;
    return true;
  }

  function parseWikipediaDateWikitext(wikitext, pageUrl) {
    const holidays = [];
    const events = [];
    const chileItems = [];
    const lines = String(wikitext || '').split('\n');
    let section = '';

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      const secMatch = line.match(/^==\s*([^=]+?)\s*==$/);
      if (secMatch) {
        const name = secMatch[1].toLowerCase();
        if (/celebraci|conmemoraci|efem[eé]rid|d[ií]as?\s+internacional/.test(name)) {
          section = 'holidays';
        } else if (/acontecimiento/.test(name)) {
          section = 'events';
        } else {
          section = 'other';
        }
        continue;
      }

      if (/^===/.test(line)) continue;
      if (!/^[*•]/.test(line)) continue;

      const wikiTitles = extractWikiTitlesFromLine(line);
      const clean = cleanWikitextLine(line.replace(/^[*•\s]+/, ''));
      if (!clean || clean.length < 16) continue;

      if (section === 'holidays') {
        const cleanText = extractCompleteSentences(clean, 200);
        if (cleanText && isStrictChileEvent(cleanText)) {
          chileItems.push({
            kind: 'chile',
            year: null,
            text: cleanText,
            extract: '',
            wikiTitles,
            imageUrl: '',
            imageCandidates: [],
            sourceOrigin: 'Wikipedia Chile',
            sourceUrl: pageUrl
          });
        }
        if (cleanText && (!/^\s*en\s+[a-z]/i.test(cleanText) || /internacional|mundial|onu|unesco|oms|global/i.test(cleanText))) {
          holidays.push({
            kind: 'mundial',
            year: null,
            text: cleanText,
            extract: '',
            wikiTitles,
            imageUrl: '',
            imageCandidates: [],
            sourceOrigin: 'Wikipedia Conmemoraciones',
            sourceUrl: pageUrl
          });
        }
      } else if (section === 'events') {
        const m = clean.match(/^(\d{3,4})\s*[:\-–.]\s*(.+)$/);
        const eventText = m ? extractCompleteSentences(m[2], 200) : '';
        if (m && eventText.length > 22) {
          const itemObj = {
            kind: 'historia',
            year: Number(m[1]),
            text: eventText,
            extract: '',
            wikiTitles,
            imageUrl: '',
            imageCandidates: [],
            sourceOrigin: 'Wikipedia Efemérides',
            sourceUrl: pageUrl
          };
          events.push(itemObj);
          if (isStrictChileEvent(eventText)) {
            chileItems.push({
              ...itemObj,
              kind: 'chile',
              sourceOrigin: 'Wikipedia Chile'
            });
          }
        }
      }
    }

    holidays.sort((a, b) => {
      const aIntl = /internacional|mundial|onu|unesco|oms|global/i.test(a.text) ? 0 : 1;
      const bIntl = /internacional|mundial|onu|unesco|oms|global/i.test(b.text) ? 0 : 1;
      return aIntl - bIntl;
    });

    return { holidays, events, chileItems };
  }

  function extractTopicKeywords(text) {
    const stop = new Set([
      'para', 'como', 'sobre', 'entre', 'desde', 'hasta', 'hacia', 'contra', 'segun', 'durante',
      'celebracion', 'conmemoracion', 'internacional', 'mundial', 'nacional', 'general', 'naciones',
      'unidas', 'todos', 'todas', 'parte', 'estado', 'primer', 'primera', 'ultimo', 'ultima',
      'despues', 'antes', 'mediante', 'siendo', 'fueron', 'habia', 'tiene', 'tienen', 'sobre'
    ]);
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !stop.has(w.toLowerCase()))
      .slice(0, 4);
  }

  /**
   * Busca fotografías reales en Wikipedia / Wikimedia Commons relacionadas con la efeméride
   * mediante JSONP (funciona tanto en HTTPS como en file://).
   */
  async function searchEphemerisTopicImages(item) {
    const urls = [];
    const pushUrl = (u) => {
      if (u && isUsableWikiPhotoUrl(u) && !urls.includes(u)) {
        urls.push(u);
      }
    };

    const titles = Array.isArray(item?.wikiTitles) ? item.wikiTitles.filter(Boolean).slice(0, 3) : [];
    const keywords = extractTopicKeywords(item?.text || item?.extract || '');
    const baseQuery = keywords.join(' ') || (titles[0] || '');
    const searchQuery =
      item?.kind === 'chile' && baseQuery && !/\bchile\b/i.test(baseQuery)
        ? `${baseQuery} Chile`
        : baseQuery;

    const tasks = [];

    if (titles.length) {
      const titlesUrl =
        `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles.join('|'))}` +
        `&prop=pageimages&piprop=thumbnail|original&pithumbsize=960&redirects=1&format=json`;
      tasks.push(
        jsonpRequest(titlesUrl, 2800).then((data) => {
          Object.values(data?.query?.pages || {}).forEach((p) => {
            pushUrl(p?.thumbnail?.source);
            const origW = Number(p?.original?.width || 0);
            if (!origW || origW <= 2600) pushUrl(p?.original?.source);
          });
        })
      );
    }

    if (searchQuery) {
      const wpSearchUrl =
        `https://es.wikipedia.org/w/api.php?action=query&generator=search` +
        `&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=6` +
        `&prop=pageimages&piprop=thumbnail|original&pithumbsize=960&format=json`;
      tasks.push(
        jsonpRequest(wpSearchUrl, 2800).then((data) => {
          Object.values(data?.query?.pages || {}).forEach((p) => {
            pushUrl(p?.thumbnail?.source);
          });
        })
      );

      const commonsSearchUrl =
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
        `&gsrnamespace=6&gsrsearch=${encodeURIComponent(searchQuery)}&gsrlimit=8` +
        `&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=960&format=json`;
      tasks.push(
        jsonpRequest(commonsSearchUrl, 3000).then((data) => {
          Object.values(data?.query?.pages || {}).forEach((p) => {
            const info = p?.imageinfo?.[0];
            const mime = (info?.mime || '').toLowerCase();
            if ((mime === 'image/jpeg' || mime === 'image/png') && Number(info?.width || 0) >= 480) {
              pushUrl(info.thumburl || info.url);
            }
          });
        })
      );
    }

    await Promise.race([
      Promise.allSettled(tasks),
      new Promise((resolve) => setTimeout(resolve, 3100))
    ]);

    return urls.slice(0, 8);
  }

  async function loadDayEphemerisPool(fecha = new Date()) {
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    const cacheKey = `${mm}-${dd}`;
    if (ephemerisDayCache.has(cacheKey)) {
      return ephemerisDayCache.get(cacheKey);
    }

    const dateTitle = `${fecha.getDate()}_de_${MONTHS_ES[fecha.getMonth()]}`;
    const defaultUrl = `https://es.wikipedia.org/wiki/${encodeURIComponent(dateTitle)}`;
    const restUrl = `https://es.wikipedia.org/api/rest_v1/feed/onthisday/all/${mm}/${dd}`;
    const jsonpUrl =
      `https://es.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(dateTitle)}` +
      `&prop=revisions|info&rvprop=content&rvslots=main&inprop=url&redirects=1&format=json`;

    const [restRes, jsonpRes] = await Promise.allSettled([
      fetchWithTimeout(restUrl, { headers: { Accept: 'application/json' } }, 2800).then((r) => (r.ok ? r.json() : null)),
      jsonpRequest(jsonpUrl, 3400)
    ]);

    const holidays = [];
    const events = [];
    const chile = [];

    if (restRes.status === 'fulfilled' && restRes.value) {
      const feed = restRes.value;
      const mapRestItem = (item, kind) => {
        const page = Array.isArray(item.pages) ? item.pages[0] : null;
        const imageCandidates = collectRestPageImages(item);
        const wikiTitles = (Array.isArray(item.pages) ? item.pages : [])
          .map((pg) => pg?.titles?.normalized || pg?.title)
          .filter(Boolean)
          .slice(0, 3);
        const text = extractCompleteSentences(collapseAdjacentDuplicates(item.text || page?.description || ''), 200);
        if (!text) return null;
        return {
          kind,
          year: item.year || null,
          text,
          extract: extractCompleteSentences(page?.extract || '', 260),
          wikiTitles,
          imageUrl: imageCandidates[0] || '',
          imageCandidates,
          sourceOrigin: kind === 'mundial' ? 'Wikipedia Día Mundial' : 'Wikipedia On This Day',
          sourceUrl: page?.content_urls?.desktop?.page || defaultUrl
        };
      };

      (Array.isArray(feed.holidays) ? feed.holidays : []).forEach((it) => {
        const mapped = mapRestItem(it, 'mundial');
        if (mapped) {
          holidays.push(mapped);
          if (isStrictChileEvent(mapped.text)) {
            chile.push({ ...mapped, kind: 'chile', sourceOrigin: 'Wikipedia Chile' });
          }
        }
      });

      const histList = [
        ...(Array.isArray(feed.selected) ? feed.selected : []),
        ...(Array.isArray(feed.events) ? feed.events : [])
      ];
      histList.forEach((it) => {
        const mapped = mapRestItem(it, 'historia');
        if (mapped) {
          events.push(mapped);
          if (isStrictChileEvent(mapped.text)) {
            chile.push({ ...mapped, kind: 'chile', sourceOrigin: 'Wikipedia Chile' });
          }
        }
      });
    }

    if (jsonpRes.status === 'fulfilled' && jsonpRes.value) {
      const pages = Object.values(jsonpRes.value?.query?.pages || {});
      const p = pages[0];
      const wikitext = p?.revisions?.[0]?.slots?.main?.['*'] || p?.revisions?.[0]?.['*'] || '';
      if (wikitext) {
        const parsed = parseWikipediaDateWikitext(wikitext, p.fullurl || defaultUrl);
        if (!holidays.length) {
          holidays.push(...parsed.holidays);
        } else {
          // Añadir celebraciones internacionales adicionales detectadas en la página en español
          const existing = new Set(holidays.map((h) => h.text.slice(0, 40).toLowerCase()));
          parsed.holidays.forEach((h) => {
            if (!existing.has(h.text.slice(0, 40).toLowerCase())) holidays.push(h);
          });
        }
        if (!events.length) events.push(...parsed.events);
        if (Array.isArray(parsed.chileItems)) {
          const existingCl = new Set(chile.map((c) => c.text.slice(0, 40).toLowerCase()));
          parsed.chileItems.forEach((c) => {
            if (!existingCl.has(c.text.slice(0, 40).toLowerCase())) chile.push(c);
          });
        }
      }
    }

    holidays.sort((a, b) => {
      const aScore = (/internacional|mundial|onu|unesco|oms/i.test(a.text) ? 2 : 0) + (a.imageCandidates?.length ? 2 : 0);
      const bScore = (/internacional|mundial|onu|unesco|oms/i.test(b.text) ? 2 : 0) + (b.imageCandidates?.length ? 2 : 0);
      return bScore - aScore;
    });

    const pool = { holidays, events, chile, dateUrl: defaultUrl };
    if (holidays.length || events.length || chile.length) {
      ephemerisDayCache.set(cacheKey, pool);
    }
    return pool;
  }

  const CITATION_JUNK_REGEX =
    /copia archivada|archivado desde el original|consultado el \d|wayback machine|\bdoi\s*:|\bisbn\b|\bissn\b|bibliograf[ií]a|enlaces externos|véase también|wikimedia commons alberga/i;

  function stripCitationNoise(text) {
    let s = String(text || '');
    const junkIdx = s.search(/(?:[«"'(]\s*)?(?:copia archivada|archivado desde el original|consultado el \d|wayback machine)/i);
    if (junkIdx !== -1) s = s.slice(0, junkIdx);
    s = s.replace(/\[\d+\]/g, '');
    s = s.replace(/\s*\.\.\.\s*/g, ' ');
    return collapseAdjacentDuplicates(s);
  }

  function extractCompleteSentences(text, maxChars = 195) {
    const cleaned = stripCitationNoise(text);
    if (!cleaned) return '';
    const sentences = cleaned
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 24 && !CITATION_JUNK_REGEX.test(s));

    if (!sentences.length) {
      return cleaned.length <= maxChars ? `${cleaned.replace(/[,\s;:\-]+$/, '')}.` : '';
    }

    let out = '';
    for (const sent of sentences) {
      const candidate = out ? `${out} ${sent}` : sent;
      if (candidate.length <= maxChars) {
        out = candidate;
      } else {
        break;
      }
    }

    if (out) {
      return /[.!?]$/.test(out) ? out : `${out}.`;
    }

    const first = sentences[0];
    if (first.length <= maxChars + 25) return /[.!?]$/.test(first) ? first : `${first}.`;

    const slice = first.slice(0, maxChars - 1);
    const clauseEnd = Math.max(slice.lastIndexOf('; '), slice.lastIndexOf(', '), slice.lastIndexOf(' — '));
    const trimmed =
      clauseEnd >= 80
        ? slice.slice(0, clauseEnd)
        : slice
            .replace(/\s+\S*$/, '')
            .replace(/\s+(?:el|la|los|las|un|una|unos|unas|de|del|al|en|y|o|e|con|por|para|sobre|entre|su|sus|que)$/i, '');
    return `${trimmed.replace(/[,\s;:\-]+$/, '')}.`;
  }

  const CHILE_CURATED_BY_DATE = {
    '11-15': [
      {
        kind: 'chile',
        year: 1945,
        text: 'El 15 de noviembre de 1945 la Academia Sueca anunció el Premio Nobel de Literatura para la poeta chilena Gabriela Mistral, primera persona latinoamericana en recibirlo.',
        extract: 'Lucila Godoy Alcayaga (Gabriela Mistral) llevó la voz de Chile, la infancia y América Latina al reconocimiento universal.',
        wikiTitles: ['Gabriela Mistral'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: 'https://es.wikipedia.org/wiki/Gabriela_Mistral'
      },
      {
        kind: 'chile',
        year: 2019,
        text: 'El 15 de noviembre de 2019 se firmó en el ex Congreso Nacional en Santiago el Acuerdo por la Paz Social y la Nueva Constitución.',
        extract: 'Pacto político chileno acordado tras masivas movilizaciones sociales para abrir un plebiscito ciudadano.',
        wikiTitles: ['Palacio del ex Congreso Nacional de Chile', 'Santiago de Chile'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: 'https://es.wikipedia.org/wiki/Acuerdo_por_la_Paz_Social_y_la_Nueva_Constituci%C3%B3n'
      },
      {
        kind: 'chile',
        year: 1962,
        text: 'El 15 de noviembre de 1962 se promulgó en Chile la primera Ley de Reforma Agraria (Ley N° 15.020), dando impulso histórico al mundo rural e INDAP.',
        extract: 'Promulgada durante el gobierno de Jorge Alessandri para modernizar la agricultura y el acceso a la tierra en Chile.',
        wikiTitles: ['Reforma agraria chilena', 'Instituto de Desarrollo Agropecuario'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: 'https://es.wikipedia.org/wiki/Reforma_agraria_chilena'
      },
      {
        kind: 'chile',
        year: 1811,
        text: 'El 15 de noviembre de 1811, en plena Patria Vieja, José Miguel Carrera encabezó en Chile el movimiento que instauró un nuevo triunvirato ejecutivo.',
        extract: 'Episodio decisivo de los primeros años de independencia y organización republicana de Chile junto a Bernardo O’Higgins.',
        wikiTitles: ['José Miguel Carrera', 'Patria Vieja'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: 'https://es.wikipedia.org/wiki/Jos%C3%A9_Miguel_Carrera'
      },
      {
        kind: 'chile',
        year: 1984,
        text: 'El 15 de noviembre de 1984 se fundó oficialmente en Santiago de Chile la comuna de Peñalolén, al pie de la precordillera andina.',
        extract: 'Comuna del sector oriente de la Región Metropolitana de Santiago cuyo nombre proviene del mapudungun.',
        wikiTitles: ['Peñalolén'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: 'https://es.wikipedia.org/wiki/Pe%C3%B1alol%C3%A9n'
      },
      {
        kind: 'chile',
        year: 1985,
        text: 'El 15 de noviembre de 1985 se restableció oficialmente en Chile el Tribunal Calificador de Elecciones (TRICEL) mediante la Ley Orgánica N° 18.460.',
        extract: 'Organismo autónomo clave del sistema electoral chileno encargado de calificar elecciones y plebiscitos.',
        wikiTitles: ['Tribunal Calificador de Elecciones de Chile'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: 'https://es.wikipedia.org/wiki/Tribunal_Calificador_de_Elecciones_de_Chile'
      },
      {
        kind: 'chile',
        year: 1902,
        text: 'El 15 de noviembre de 1902 se fundó en Santiago de Chile el diario Las Últimas Noticias (LUN), uno de los periódicos más tradicionales del país.',
        extract: 'Medio escrito chileno fundado por Agustín Edwards Mac-Clure en la capital del país.',
        wikiTitles: ['Las Últimas Noticias', 'Santiago de Chile'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: 'https://es.wikipedia.org/wiki/Las_%C3%9Altimas_Noticias'
      }
    ]
  };

  const chileSearchCache = new Map();

  async function searchChileDateEphemeris(fecha = new Date()) {
    const mm = String(fecha.getMonth() + 1).padStart(2, '0');
    const dd = String(fecha.getDate()).padStart(2, '0');
    const cacheKey = `${mm}-${dd}`;
    if (chileSearchCache.has(cacheKey)) {
      return chileSearchCache.get(cacheKey);
    }

    const curatedToday = Array.isArray(CHILE_CURATED_BY_DATE[cacheKey])
      ? CHILE_CURATED_BY_DATE[cacheKey].map((c) => ({ ...c }))
      : [];

    const dayMonth = `${fecha.getDate()} de ${MONTHS_ES[fecha.getMonth()]}`;
    const listUrl =
      `https://es.wikipedia.org/w/api.php?action=query&list=search` +
      `&srsearch=${encodeURIComponent(`"${dayMonth}" ("en Chile" OR "de Chile" OR "Santiago de Chile")`)}` +
      `&srlimit=10&srprop=snippet&format=json`;

    try {
      const searchRes = await jsonpRequest(listUrl, 3000);
      const hits = Array.isArray(searchRes?.query?.search) ? searchRes.query.search : [];
      const dayRx = new RegExp(`\\b${fecha.getDate()}\\s+de\\s+${MONTHS_ES[fecha.getMonth()]}\\b`, 'i');

      const verifiedHits = hits.filter((h) => {
        const title = String(h?.title || '').trim();
        if (!title || /^\d{1,2} de |^\d{3,4}$|^Anexo:/i.test(title)) return false;
        const rawSnippet = String(h?.snippet || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (CITATION_JUNK_REGEX.test(rawSnippet)) return false;
        return dayRx.test(rawSnippet) && isStrictChileEvent(`${title}: ${rawSnippet}`);
      });

      let wikiItems = [];
      if (verifiedHits.length > 0) {
        const pageIds = verifiedHits.slice(0, 6).map((h) => h.pageid).join('|');
        const detailUrl =
          `https://es.wikipedia.org/w/api.php?action=query&pageids=${pageIds}` +
          `&prop=extracts|pageimages|info&exintro=1&explaintext=1&exchars=650` +
          `&piprop=thumbnail|original&pithumbsize=960&inprop=url&format=json`;
        const detailRes = await jsonpRequest(detailUrl, 3000);
        const pages = Object.values(detailRes?.query?.pages || {});

        for (const p of pages) {
          const title = String(p?.title || '').trim();
          const extract = stripCitationNoise(p?.extract || '');
          if (!title || !extract) continue;
          const introSentences = extract.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
          const firstSentence = introSentences[0] || extract;
          if (!isStrictChileEvent(`${title}: ${firstSentence}`)) continue;

          // Preferir una oración COMPLETA del resumen introductorio que mencione la fecha exacta
          const matchingIntroSentence = introSentences.find((s) => dayRx.test(s) && s.length <= 210);
          const matchedHit = verifiedHits.find((vh) => vh.pageid === p.pageid);
          const rawSnippet = String(matchedHit?.snippet || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const cleanSnippet = stripCitationNoise(rawSnippet);
          const completeFromSnippet = cleanSnippet
            .split(/(?<=[.!?])\s+/)
            .find((s) => dayRx.test(s) && s.length >= 35 && s.length <= 200 && /^[A-ZÁÉÍÓÚÑ0-9]/.test(s) && /[.!?]$/.test(s));

          const chosenSentence = matchingIntroSentence || completeFromSnippet;
          if (!chosenSentence) continue;

          const yearMatch = `${chosenSentence} ${extract}`.match(/\b(1[5-9]\d{2}|20[0-2]\d)\b/);
          const candidates = [];
          if (isUsableWikiPhotoUrl(p?.thumbnail?.source)) candidates.push(p.thumbnail.source);
          const origW = Number(p?.original?.width || 0);
          if (isUsableWikiPhotoUrl(p?.original?.source) && (!origW || origW <= 2600)) {
            candidates.push(p.original.source);
          }

          const finalText = chosenSentence.toLowerCase().includes(title.toLowerCase())
            ? chosenSentence
            : `${title}: ${chosenSentence}`;

          wikiItems.push({
            kind: 'chile',
            year: yearMatch ? Number(yearMatch[1]) : null,
            text: extractCompleteSentences(finalText, 195),
            extract: extractCompleteSentences(extract, 260),
            wikiTitles: [title],
            imageUrl: candidates[0] || '',
            imageCandidates: candidates,
            sourceOrigin: 'Wikipedia Chile',
            sourceUrl: p.fullurl || `https://es.wikipedia.org/wiki/${encodeURIComponent(title.replace(/\s+/g, '_'))}`
          });
        }
      }

      const merged = [...curatedToday, ...wikiItems];
      if (merged.length) {
        chileSearchCache.set(cacheKey, merged);
      }
      return merged;
    } catch {
      return curatedToday;
    }
  }

  /**
   * Obtiene una efeméride real (Día Internacional / Mundial, Hito Histórico o Chile) para la fecha de hoy.
   */
  async function gatherTodayEphemeris({ fecha = new Date(), focus = 'mixto', recentTexts = [] } = {}) {
    const [pool, extraChile] = await Promise.all([
      loadDayEphemerisPool(fecha).catch(() => ({ holidays: [], events: [], chile: [], dateUrl: '' })),
      focus === 'chile' ? searchChileDateEphemeris(fecha) : Promise.resolve([])
    ]);
    const seen = new Set(recentTexts.map((t) => String(t || '').slice(0, 60).toLowerCase()));

    let candidates = [];
    if (focus === 'chile') {
      const mergedChile = [...(pool.chile || [])];
      const existingKeys = new Set(mergedChile.map((c) => c.text.slice(0, 40).toLowerCase()));
      (extraChile || []).forEach((c) => {
        if (!existingKeys.has(c.text.slice(0, 40).toLowerCase())) mergedChile.push(c);
      });
      candidates = mergedChile;
    } else if (focus === 'mundiales') {
      candidates = pool.holidays.length ? pool.holidays : pool.events;
    } else if (focus === 'historia') {
      candidates = pool.events.length ? pool.events : pool.holidays;
    } else {
      const topHolidays = pool.holidays.slice(0, 8);
      const topEvents = pool.events.slice(0, 14);
      candidates = [...topHolidays, ...topEvents];
    }

    const unseen = candidates.filter((c) => !seen.has(c.text.slice(0, 60).toLowerCase()));
    const finalPool = unseen.length ? unseen : candidates;

    if (finalPool.length > 0) {
      const pickRange = focus === 'mundiales' ? Math.min(finalPool.length, 5) : finalPool.length;
      const picked = finalPool[Math.floor(Math.random() * pickRange)];
      return {
        connected: true,
        item: picked,
        sources: [
          {
            origin: picked.sourceOrigin,
            title: picked.year ? `${picked.year}: ${picked.text.slice(0, 65)}` : picked.text.slice(0, 75),
            url: picked.sourceUrl || pool.dateUrl
          }
        ]
      };
    }

    const chileFallbackItems = [
      {
        kind: 'chile',
        year: 1945,
        text: 'Legado de Gabriela Mistral en Chile: primera persona latinoamericana en recibir el Premio Nobel de Literatura en 1945, voz universal desde el Valle de Elqui.',
        extract: '',
        wikiTitles: ['Gabriela Mistral', 'Valle de Elqui'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride Cultural de Chile',
        sourceUrl: ''
      },
      {
        kind: 'chile',
        year: 1810,
        text: 'Memoria Republicana y Patrimonio de Chile: desde la Cordillera de los Andes hasta el Pacífico, la historia chilena se construye con resiliencia comunitaria y dignidad.',
        extract: '',
        wikiTitles: ['Cordillera de los Andes', 'Santiago de Chile'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride de Chile',
        sourceUrl: ''
      },
      {
        kind: 'chile',
        year: null,
        text: 'Arte y Conciencia en Chile (Violeta Parra y el folclore vivo): agradecer a la vida y cuidar la memoria popular sigue uniendo generaciones de norte a sur.',
        extract: '',
        wikiTitles: ['Violeta Parra', 'Chiloé'],
        imageUrl: '',
        imageCandidates: [],
        sourceOrigin: 'Efeméride Cultural de Chile',
        sourceUrl: ''
      }
    ];

    const fallbackItems =
      focus === 'chile'
        ? chileFallbackItems
        : [
            {
              kind: 'mundial',
              year: null,
              text: 'Día Mundial en Recuerdo de las Víctimas y Conciencia Vial: proteger la vida cotidiana empieza con empatía, calma y responsabilidad compartida.',
              extract: '',
              wikiTitles: ['Seguridad vial'],
              imageUrl: '',
              imageCandidates: [],
              sourceOrigin: 'Efeméride de Conciencia',
              sourceUrl: ''
            },
            {
              kind: 'mundial',
              year: null,
              text: 'Conciencia Global y Cuidado del Planeta: cada acción cotidiana responsable construye un mundo más justo, verde y habitable.',
              extract: '',
              wikiTitles: ['Planeta Tierra', 'Ecología'],
              imageUrl: '',
              imageCandidates: [],
              sourceOrigin: 'Efeméride de Conciencia',
              sourceUrl: ''
            },
            {
              kind: 'historia',
              year: 1971,
              text: 'Hito de la Ciencia y la Tecnología Moderna: en noviembre de 1971 el lanzamiento comercial del primer microprocesador (Intel 4004) transformó para siempre la comunicación humana.',
              extract: '',
              wikiTitles: ['Intel 4004', 'Microprocesador'],
              imageUrl: '',
              imageCandidates: [],
              sourceOrigin: 'Efeméride Histórica',
              sourceUrl: ''
            },
            {
              kind: 'mundial',
              year: null,
              text: 'Mes de la Tolerancia, la Filosofía y el Diálogo Humano (ONU/UNESCO): pensar con lucidez y escuchar al distinto es la base de toda paz duradera.',
              extract: '',
              wikiTitles: ['Tolerancia social', 'Filosofía'],
              imageUrl: '',
              imageCandidates: [],
              sourceOrigin: 'Efeméride Cultural ONU',
              sourceUrl: ''
            }
          ];
    const freshFallback = fallbackItems.filter((f) => !seen.has(f.text.slice(0, 60).toLowerCase()));
    const fallbackPool = freshFallback.length ? freshFallback : fallbackItems;
    return {
      connected: false,
      item: fallbackPool[Math.floor(Math.random() * fallbackPool.length)],
      sources: []
    };
  }

  global.OraculoWebPulse = {
    gatherLiveWebContext,
    gatherTodayEphemeris,
    searchEphemerisTopicImages
  };
})(window);
