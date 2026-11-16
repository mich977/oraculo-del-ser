/**
 * gemini-service.js
 * Servicio de integración directa con la API REST de Google Gemini (sin dependencias).
 * Enfoque central: mensajes filosóficos que siembran ESPERANZA, alivio y claridad,
 * adaptando dinámicamente la atmósfera visual y el fondo generado según el texto.
 */
(function (global) {
  'use strict';

  const STORAGE_API_KEY = 'oraculo_cf_gemini_api_key';
  const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

  const TEXT_MODEL = 'gemini-3.8-flash';
  const IMAGEN_MODEL = 'imagen-3.0-generate-002';
  const FALLBACK_IMAGE_MODEL = 'gemini-2.5-flash-image';

  const VALID_ATMOSPHERES = ['amanecer', 'aurora', 'fortaleza', 'renacimiento', 'serenidad', 'cosmos'];

  let memoryApiKey = '';
  let imageDisabledForKey = '';
  let discoveredCache = { apiKey: '', ready: false, textModel: TEXT_MODEL, predictImageModels: [], contentImageModels: [] };

  async function fetchWithTimeout(url, options = {}, timeoutMs = 6500) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  function getApiKey() {
    try {
      const stored = (localStorage.getItem(STORAGE_API_KEY) || '').trim();
      return stored || memoryApiKey;
    } catch {
      return memoryApiKey;
    }
  }

  function setApiKey(key) {
    const clean = (key || '').trim();
    if (clean !== memoryApiKey) {
      imageDisabledForKey = '';
      discoveredCache.ready = false;
    }
    memoryApiKey = clean;
    try {
      if (clean) {
        localStorage.setItem(STORAGE_API_KEY, clean);
      } else {
        localStorage.removeItem(STORAGE_API_KEY);
      }
    } catch {
      // Si localStorage está bloqueado en file://, conservamos memoryApiKey en sesión
    }
  }

  function hasApiKey() {
    return getApiKey().length >= 20;
  }

  /**
   * Descubre los modelos activos disponibles para la API Key actual.
   */
  async function discoverAvailableModels(apiKey) {
    if (!apiKey) return null;
    if (discoveredCache.apiKey === apiKey && discoveredCache.ready) {
      return discoveredCache;
    }

    const res = await fetch(`${GEMINI_BASE_URL}?key=${encodeURIComponent(apiKey)}`, { method: 'GET' });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error?.message || `Error HTTP ${res.status} al validar la clave.`);
    }

    const data = await res.json();
    const models = Array.isArray(data.models) ? data.models : [];

    const textCandidates = models
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          /gemini/i.test(m.name) &&
          !/image|embedding|tts|audio|robotics/i.test(m.name)
      )
      .map((m) => m.name.replace(/^models\//, ''));

    // Priorizar gemini-3.8-flash, luego versiones 3.x flash, luego cualquier flash
    const preferredOrder = (name) => {
      if (name === 'gemini-3.8-flash') return 0;
      if (/^gemini-3\.\d+-flash$/.test(name)) return 1;
      if (/^gemini-3.*flash/.test(name)) return 2;
      if (/^gemini-2\.5-flash$/.test(name)) return 3;
      if (/flash/i.test(name)) return 4;
      return 5;
    };
    textCandidates.sort((a, b) => preferredOrder(a) - preferredOrder(b));

    const predictImageModels = models
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('predict') &&
          /imagen/i.test(m.name)
      )
      .map((m) => m.name.replace(/^models\//, ''));

    const contentImageModels = models
      .filter(
        (m) =>
          Array.isArray(m.supportedGenerationMethods) &&
          m.supportedGenerationMethods.includes('generateContent') &&
          /image/i.test(m.name)
      )
      .map((m) => m.name.replace(/^models\//, ''));

    discoveredCache = {
      apiKey,
      ready: true,
      textModel: textCandidates[0] || TEXT_MODEL,
      predictImageModels,
      contentImageModels
    };
    return discoveredCache;
  }

  function getActiveTextModel() {
    const key = getApiKey();
    if (key && discoveredCache.apiKey === key && discoveredCache.ready) {
      return discoveredCache.textModel;
    }
    return TEXT_MODEL;
  }

  async function testApiKey(candidateKey) {
    const clean = (candidateKey || getApiKey() || '').trim();
    if (!clean) {
      return { ok: false, message: 'Ingresa una API Key primero.' };
    }
    if (clean.length < 20) {
      return {
        ok: false,
        message: `La clave ingresada solo tiene ${clean.length} caracteres. Una Gemini API Key real empieza por "AIza..." y tiene ~39 caracteres.`
      };
    }

    try {
      discoveredCache.ready = false;
      const info = await discoverAvailableModels(clean);
      return {
        ok: true,
        message: `Conexión verificada. Modelo activo: ${info.textModel}`
      };
    } catch (err) {
      return {
        ok: false,
        message: err.message || 'No se pudo contactar a Google Gemini.'
      };
    }
  }

  /**
   * Infere la atmósfera visual más coherente a partir de las palabras del mensaje
   * si no viene explícita o para reforzar la sintonía emocional del texto.
   */
  function inferAtmosphereFromText(text) {
    const t = String(text || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

    if (/(cicatriz|fractura|quiebr|oro|kintsugi|renac|ceniza|fenix|transform)/.test(t)) {
      return 'renacimiento';
    }
    if (/(amanec|alba|sol|despertar|manana|horizonte|aurora|nuevo dia|claridad)/.test(t)) {
      return 'amanecer';
    }
    if (/(calma|silencio|paz|quietud|mente|respir|agua|mar|seren|refugio)/.test(t)) {
      return 'serenidad';
    }
    if (/(fuego|fuerza|tormenta|coraje|firme|escudo|valor|resist|pie|luz interior)/.test(t)) {
      return 'fortaleza';
    }
    if (/(estrella|cosmos|universo|destino|infinito|camino|orbita|constelacion)/.test(t)) {
      return 'cosmos';
    }
    if (/(esperanza|sanar|flui|vibr|energia|cielo|brill|alivio)/.test(t)) {
      return 'aurora';
    }
    return 'amanecer';
  }

  function buildOraclePrompt(contexto) {
    const webPulseBlock = contexto.webPulse?.summaryText
      ? `\nPULSO REAL DE LA WEB EN VIVO (Úsalo como chispa o metáfora contemporánea original conectada con el mensaje):\n${contexto.webPulse.summaryText}\n`
      : '';

    const recentList = Array.isArray(contexto.recentMessages) ? contexto.recentMessages : [];
    const antiRepeatBlock = recentList.length
      ? `\nMENSAJES YA MOSTRADOS (PROHIBIDO repetir ideas, estructuras o palabras centrales):\n${recentList
          .slice(0, 6)
          .map((m, i) => `${i + 1}. "${m.gancho}" — "${m.frase}"`)
          .join('\n')}\n`
      : '';

    const enfoques = [
      'la paciencia silenciosa de las raíces bajo tierra antes de brotar en primavera',
      'el coraje sereno de soltar un peso antiguo para caminar liviano',
      'el arte japonés del kintsugi: embellecer las grietas con oro vivo',
      'el oficio de un faro que no persigue barcos, solo sostiene su luz firme',
      'la música que nace precisamente de los silencios entre notas',
      'un navegante guiándose por estrellas fijas cuando cambia la marea',
      'el descanso fértil del invierno que prepara las flores que nadie ve aún',
      'construir hogar dentro de la propia respiración en medio de la prisa',
      'la precisión serena del relojero que ordena una pieza a la vez',
      'el río que rodea la roca sin odio hasta pulirla con paciencia',
      'la alegría discreta de empezar hoy como un aprendiz libre de ayer',
      'la gratitud lúcida por lo que permanece en pie después del cambio',
      'el puente invisible que se tiende cuando alguien decide confiar un día más',
      'transformar la duda en curiosidad y el miedo en atención despierta',
      'un bosque que vuelve a brotar más fuerte tras el fuego',
      'la calma profunda del fondo del mar aunque en la superficie haya viento'
    ];
    const enfoqueRandom = enfoques[Math.floor(Math.random() * enfoques.length)];
    const targetAtm = VALID_ATMOSPHERES.includes(contexto.targetAtmosphere)
      ? contexto.targetAtmosphere
      : VALID_ATMOSPHERES[Math.floor(Math.random() * VALID_ATMOSPHERES.length)];

    const taoObj = contexto.corrientesObj?.taoismo;
    const isTaoMode = contexto.filtro === 'taoismo' && (taoObj || contexto.webPulse?.taoQuote);
    const liveTao = isTaoMode ? contexto.webPulse?.taoQuote : null;
    const isStoicMode = contexto.filtro === 'estoicismo';
    const isFiloMode = contexto.filtro === 'filosofia';
    const isKybalionMode = contexto.filtro === 'kybalion';
    const isSabHumMode = contexto.filtro === 'sabiduria_humana';
    const recentFrasesSet = new Set(
      recentList.map((m) => String(m.frase || '').toLowerCase().slice(0, 48))
    );
    const pickLiveIfFresh = (live) =>
      live &&
      !recentFrasesSet.has(String(live.maxima || '').toLowerCase().slice(0, 48)) &&
      Math.random() < 0.4;

    const liveQuote = isStoicMode
      ? pickLiveIfFresh(contexto.webPulse?.stoicQuote)
      : isFiloMode
        ? pickLiveIfFresh(contexto.webPulse?.filosofiaQuote)
        : isKybalionMode
          ? pickLiveIfFresh(contexto.webPulse?.kybalionQuote)
          : null;
    const philosopherObj = isStoicMode
      ? liveQuote || contexto.corrientesObj?.estoicismo
      : isFiloMode
        ? liveQuote || contexto.corrientesObj?.filosofia
        : isKybalionMode
          ? liveQuote || contexto.corrientesObj?.kybalionMaestro
          : isSabHumMode
            ? contexto.corrientesObj?.sabiduriaHumana
            : null;
    const isAuthorQuoteMode = (isStoicMode || isFiloMode || isKybalionMode || isSabHumMode) && Boolean(philosopherObj);

    const taoBlock = isTaoMode
      ? `\nENFOQUE ESPECIAL TAOÍSTA REAL (Laozi / Zhuangzi / Lie Yukou / Wang Chongyang / Maestros Celestiales Tianshi):\n${
          liveTao
            ? `- Cita real en vivo (${liveTao.autor} · ${liveTao.obra}): "${liveTao.maxima}"\n`
            : ''
        }${
          taoObj
            ? `- Maestro / Tradición: ${taoObj.maestro}\n- Historia corta (${taoObj.titulo}): ${taoObj.historia}\n- Esperanza que nos deja hoy: ${taoObj.ensenanza}\n`
            : ''
        }- Propósito: Devolver calma, esperanza real y sentido humano a personas saturadas por el ruido digital y redes como TikTok.\n`
      : '';

    const authorLabel = isStoicMode
      ? 'ESTOICISMO REAL'
      : isKybalionMode
        ? 'MAESTROS DE LAS LEYES UNIVERSALES'
        : isSabHumMode
          ? 'SABIDURÍA HUMANA SIN DOGMAS (PARÁBOLAS DE JESÚS, ECLESIASTÉS Y PROVERBIOS — LENGUAJE CERCANO NO RELIGIOSO)'
          : 'FILOSOFÍA UNIVERSAL REAL';
    const authorBlock = isAuthorQuoteMode
      ? `\nENFOQUE ESTRICTO DE ${authorLabel} (${
          isSabHumMode
            ? 'USA LENGUAJE HUMANO Y CERCANO PARA CREYENTES Y NO CREYENTES, SIN SERMONES, SIN DOGMAS NI ETIQUETAS RELIGIOSAS; ENFÓCATE EN LO QUE HACES VUELVE, EMPATÍA, PERDÓN Y PAZ'
            : 'PROHIBIDO INVENTAR CITAS NI USAR METÁFORAS AJENAS'
        }):\n- Referencia: ${philosopherObj.autor} (${philosopherObj.obra})\n- Enseñanza / Máxima: "${philosopherObj.maxima}"\n${philosopherObj.historia ? `- Relato / Sentido humano: ${philosopherObj.historia}\n` : ''}${philosopherObj.ensenanza ? `- Enseñanza práctica: ${philosopherObj.ensenanza}\n` : ''}${philosopherObj.aplicacion_practica ? `- Aplicación práctica: ${philosopherObj.aplicacion_practica}\n` : ''}`
      : '';

    const centralFocus = isAuthorQuoteMode
      ? `${philosopherObj.autor} (${philosopherObj.obra}): "${philosopherObj.maxima}"`
      : isTaoMode
        ? liveTao
          ? `${liveTao.autor} (${liveTao.obra}): "${liveTao.maxima}"`
          : `${taoObj.maestro} — ${taoObj.titulo}: ${taoObj.ensenanza}`
        : enfoqueRandom;

    const dailyPulseLine = isAuthorQuoteMode || isTaoMode
      ? ''
      : `- Vibración ${contexto.numerologiaDia.numero} (${contexto.numerologiaDia.titulo}): ${contexto.numerologiaDia.consejo}\n`;
    const strictIsolationRule =
      isAuthorQuoteMode || isTaoMode
        ? `\nREGLA ESTRICTA DE ENFOQUE: Céntrate 100% en "${contexto.filtroLabel}" y en la enseñanza dada arriba. PROHIBIDO mezclar otros títulos, corrientes ajenas, autores de otras escuelas o numerología.\n`
        : '';

    return `Eres el Oráculo Ciber-Filosófico. Tu misión es dar ESPERANZA REAL, claridad y fuerza serena fusionando sabiduría ancestral (${contexto.filtroLabel}) con la vida cotidiana actual.

SEMILLA ÚNICA: #${Date.now()}-${Math.floor(Math.random() * 99999)}
ATMÓSFERA EMOCIONAL DE ESTA TARJETA: "${targetAtm}"
METÁFORA / CITA CENTRAL OBLIGATORIA PARA ESTA VEZ: ${centralFocus}

CONTEXTO DE HOY (${contexto.fechaTexto}):
${dailyPulseLine}- Corriente seleccionada (${contexto.filtroLabel}):
${contexto.resumenCorrientes}${taoBlock}${authorBlock}${strictIsolationRule}${webPulseBlock}${antiRepeatBlock}

DEVUELVE SOLO JSON VÁLIDO CON ESTOS 5 CAMPOS:
1. "gancho": ${
      isAuthorQuoteMode
        ? isSabHumMode
          ? `Encabezado breve humano en MAYÚSCULAS (4 a 8 palabras, ej. "${philosopherObj.gancho_sugerido || 'LO QUE PONES EN EL MUNDO VUELVE A TI'}") sin tono religioso`
          : `Encabezado en MAYÚSCULAS citando al autor y su obra (ej. "${philosopherObj.autor.toUpperCase()} · ${philosopherObj.obra.toUpperCase().slice(0, 28)}")`
        : isTaoMode
          ? `Encabezado en MAYÚSCULAS nombrando al maestro taoísta (${(liveTao?.autor || taoObj?.maestro || 'LAOZI').toUpperCase()}) y una frase breve de gancho para detener el scroll`
          : 'Título psicológico en MAYÚSCULAS (4 a 9 palabras), directo al corazón, sin repetir fórmulas previas'
    }.
2. "frase": ${
      isAuthorQuoteMode
        ? isSabHumMode
          ? 'Enseñanza humana clara y cálida de 15 a 24 palabras en UNA o DOS oraciones COMPLETAS terminadas en punto final (sin lenguaje religioso ni dogmas; habla como ley de vida y empatía cotidiana)'
          : `Cita fiel o síntesis exacta de la enseñanza real de ${philosopherObj.autor} en UNA o DOS oraciones COMPLETAS terminadas en punto final (14 a 25 palabras, máximo 180 caracteres, sin frases cortadas)`
        : `Mensaje ORIGINAL de 15 a 24 palabras en UNA o DOS oraciones COMPLETAS terminadas en punto final (sin cortar ideas ni usar puntos suspensivos), anclado en la ${isTaoMode ? 'enseñanza real del maestro taoísta elegido, trayendo esperanza frente al ruido digital actual' : 'METÁFORA CENTRAL elegida'}. Evita frases gastadas ("noche más larga", "tormenta pasará", "luz interior")`
    }.
3. "palabras_clave": 2 o 3 palabras EXACTAS de "frase" para resaltar en dorado.
4. "atmosfera": Usa exactamente "${targetAtm}".
5. "caption": Texto breve en español listo para redes (${
      isAuthorQuoteMode
        ? isSabHumMode
          ? `gancho con emoji 🕊️ + breve parábola o reflexión humana sin tono confesional ni dogmas + 1 gesto concreto para ser mejor persona hoy + pregunta cercana + 5 hashtags (#SabiduriaHumana #Humanidad #Empatia #Esperanza #VidaConsciente)`
          : `gancho con emoji ${isStoicMode ? '🏛️' : isKybalionMode ? '🔺' : '🦉'} + cita literal "${philosopherObj.maxima}" atribuida a ${philosopherObj.autor} (${philosopherObj.obra}) + 2 párrafos concretos para volver a la humanidad más humana hoy + pregunta para comentar + 5 hashtags (${isStoicMode ? '#Estoicismo #Humanidad #MarcoAurelio #Seneca #Epicteto' : isKybalionMode ? '#LeyesUniversales #Kybalion #HermesTrismegisto #NevilleGoddard #Conciencia' : '#Filosofia #Sabiduria #Humanidad #PensamientoCritico #Esperanza'})`
        : isTaoMode
          ? 'gancho con emoji ☯️ + nombra al maestro (Laozi / Zhuangzi / Liezi / Wang Chongyang / Maestros Celestiales) + narra su historia corta o frase real + conecta esa calma con quienes hoy solo ven prisa en redes/TikTok + pregunta para comentar + 5 hashtags (#Taoismo #Laozi #Zhuangzi #Liezi #EsperanzaReal)'
          : 'gancho con emoji + 2 párrafos concretos conectando la metáfora con la sabiduría de hoy + pregunta para comentar + 5 hashtags variados'
    }).`;
  }

  function normalizeOraclePayload(raw) {
    const gancho = String(raw.gancho || 'PARA CUANDO SIENTAS QUE EL DÍA PESA DEMASIADO')
      .trim()
      .toUpperCase();
    let frase = String(
      raw.frase ||
        'Incluso la noche más larga obedece al ritmo del universo y prepara en silencio la claridad de tu próximo amanecer.'
    )
      .replace(/\s*\.\.\.\s*$/, '')
      .trim();
    if (frase && !/[.!?]$/.test(frase)) {
      frase = `${frase.replace(/[,\s;:\-]+$/, '')}.`;
    }

    let palabras = Array.isArray(raw.palabras_clave) ? raw.palabras_clave : [];
    palabras = palabras
      .map((w) => String(w).trim())
      .filter(Boolean)
      .slice(0, 3);

    const rawAtm = String(raw.atmosfera || '').trim().toLowerCase();
    const atmosfera = VALID_ATMOSPHERES.includes(rawAtm)
      ? rawAtm
      : inferAtmosphereFromText(`${gancho} ${frase}`);

    const prompt_arte = String(
      raw.prompt_arte ||
        'Golden hopeful sunrise breaking over tranquil misty horizon, contemplative sage looking toward warm light, atmospheric background, no text'
    ).trim();

    const caption = String(raw.caption || `${gancho}\n\n${frase}`).trim();

    return { gancho, frase, palabras_clave: palabras, atmosfera, prompt_arte, caption };
  }

  async function requestGeminiJsonPayload(prompt, temperature = 1.1) {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('NO_API_KEY');
    }

    const buildBodyForModel = (modelName, includeThinking = true) => {
      const generationConfig = {
        temperature,
        topP: 0.96,
        maxOutputTokens: 700,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            gancho: { type: 'STRING' },
            frase: { type: 'STRING' },
            palabras_clave: { type: 'ARRAY', items: { type: 'STRING' } },
            atmosfera: { type: 'STRING', enum: VALID_ATMOSPHERES },
            caption: { type: 'STRING' }
          },
          required: ['gancho', 'frase', 'palabras_clave', 'atmosfera', 'caption']
        }
      };

      if (includeThinking) {
        if (/^gemini-3/i.test(modelName)) {
          generationConfig.thinkingConfig = { thinkingLevel: 'MINIMAL' };
        } else if (/^gemini-2\.5/i.test(modelName)) {
          generationConfig.thinkingConfig = { thinkingBudget: 0 };
        }
      }

      return {
        contents: [
          {
            role: 'user',
            parts: [{ text: prompt }]
          }
        ],
        generationConfig
      };
    };

    const callModel = async (modelName, includeThinking = true) => {
      const endpoint = `${GEMINI_BASE_URL}/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetchWithTimeout(
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(buildBodyForModel(modelName, includeThinking))
        },
        15000
      );

      // Si el modelo concreto rechaza thinkingConfig con 400, reintentar sin él de inmediato
      if (res.status === 400 && includeThinking) {
        const cloneData = await res.clone().json().catch(() => ({}));
        const msg400 = cloneData?.error?.message || '';
        if (/thinking/i.test(msg400)) {
          return callModel(modelName, false);
        }
      }
      return res;
    };

    let modelToUse = getActiveTextModel();
    let response = await callModel(modelToUse);

    // Si el modelo fue retirado o no está disponible para nuevos usuarios, autodescubrir el modelo activo
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const rawMsg = errData?.error?.message || `Error HTTP ${response.status} al consultar Gemini`;
      const isQuotaErr =
        response.status === 429 ||
        /quota|RESOURCE_EXHAUSTED|rate.?limit|billing|credit|exceeded/i.test(rawMsg);
      if (isQuotaErr) {
        const qErr = new Error(`QUOTA_EXCEEDED: ${rawMsg}`);
        qErr.code = 'QUOTA_EXCEEDED';
        qErr.status = response.status;
        throw qErr;
      }
      if (response.status === 404 || /no longer available|not found|deprecated/i.test(rawMsg)) {
        try {
          discoveredCache.ready = false;
          const info = await discoverAvailableModels(apiKey);
          if (info?.textModel && info.textModel !== modelToUse) {
            modelToUse = info.textModel;
            response = await callModel(modelToUse);
            if (!response.ok) {
              const retryErr = await response.json().catch(() => ({}));
              const retryMsg = retryErr?.error?.message || `Error HTTP ${response.status} en ${modelToUse}`;
              const retryIsQuota =
                response.status === 429 ||
                /quota|RESOURCE_EXHAUSTED|rate.?limit|billing|credit|exceeded/i.test(retryMsg);
              const e = new Error(retryIsQuota ? `QUOTA_EXCEEDED: ${retryMsg}` : retryMsg);
              if (retryIsQuota) e.code = 'QUOTA_EXCEEDED';
              throw e;
            }
          } else {
            throw new Error(rawMsg);
          }
        } catch (discoveryErr) {
          if (discoveryErr.code === 'QUOTA_EXCEEDED') throw discoveryErr;
          throw new Error(discoveryErr.message || rawMsg);
        }
      } else {
        throw new Error(rawMsg);
      }
    }

    const data = await response.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Gemini no devolvió contenido textual válido.');
    }

    let parsed;
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```$/i, '')
        .trim();
      parsed = JSON.parse(cleaned);
    } catch {
      throw new Error('La respuesta de Gemini no tuvo formato JSON válido.');
    }

    return normalizeOraclePayload(parsed);
  }

  async function generateOracleText(contexto) {
    const prompt = buildOraclePrompt(contexto);
    return requestGeminiJsonPayload(prompt, 1.1);
  }

  function buildEphemerisPrompt(ephemerisItem, contexto) {
    const targetAtm = VALID_ATMOSPHERES.includes(contexto.targetAtmosphere)
      ? contexto.targetAtmosphere
      : 'amanecer';
    const recentList = Array.isArray(contexto.recentMessages) ? contexto.recentMessages : [];
    const antiRepeat = recentList.length
      ? `\nEVITA REPETIR ESTAS FRASES PREVIAS:\n${recentList
          .slice(0, 4)
          .map((m) => `- "${m.gancho}"`)
          .join('\n')}`
      : '';

    const isChile = ephemerisItem?.kind === 'chile' || contexto.efemerideEnfoque === 'chile';
    const kindLabel = isChile
      ? `EFEMÉRIDE DE CHILE${ephemerisItem?.year ? ` (${ephemerisItem.year})` : ''}`
      : ephemerisItem?.kind === 'mundial'
        ? 'DÍA INTERNACIONAL / CONMEMORACIÓN MUNDIAL'
        : `HITO HISTÓRICO${ephemerisItem?.year ? ` (${ephemerisItem.year})` : ''}`;

    const hookHint = isChile
      ? `"CHILE · TAL DÍA COMO HOY${ephemerisItem?.year ? ` (${ephemerisItem.year})` : ''}" o nombre breve de la efeméride chilena`
      : `"TAL DÍA COMO HOY · ${ephemerisItem?.year || 'EFEMÉRIDE'}" o el nombre breve del Día Mundial`;
    const hashtagsHint = isChile
      ? '#EfemeridesDeChile #Chile #HistoriaDeChile #TalDiaComoHoy #CulturaChilena'
      : '#EfemeridesDeHoy #TalDiaComoHoy #HistoriaMundial #ConcienciaGlobal #Cultura';

    return `Eres un cronista cultural y humanista. Transforma este hecho REAL de hoy (${contexto.fechaTexto}) en una tarjeta visual elegante, veraz e inspiradora para redes sociales.

DATO VERIFICADO DE WIKIPEDIA (${kindLabel}):
- Hecho: ${ephemerisItem?.text || ''}
${ephemerisItem?.extract ? `- Contexto adicional: ${ephemerisItem.extract}` : ''}${antiRepeat}

DEVUELVE SOLO JSON VÁLIDO:
1. "gancho": Encabezado corto en MAYÚSCULAS (4 a 8 palabras, ej. ${hookHint}).
2. "frase": Explicación clara del acontecimiento real + 1 idea breve de valor humano para hoy en UNA o DOS ORACIONES COMPLETAS terminadas en punto final (15 a 24 palabras exactas, máximo 175 caracteres, sin frases cortadas ni puntos suspensivos).
3. "palabras_clave": 2 o 3 palabras EXACTAS de "frase" (ej. año, concepto clave) para resaltar en dorado.
4. "atmosfera": Usa exactamente "${targetAtm}".
5. "caption": Publicación completa en español para Instagram/Facebook/TikTok:
   - Encabezado con emoji (${isChile ? '🇨🇱 o 📅' : '📅 o 🌍'}) y el título del día/hecho.
   - 2 párrafos breves contando por qué este hecho o día importa hoy.
   - Pregunta breve para conversar en comentarios.
   - 5 hashtags relevantes (${hashtagsHint}).`;
  }

  async function generateEphemerisCard(ephemerisItem, contexto) {
    const prompt = buildEphemerisPrompt(ephemerisItem, contexto);
    return requestGeminiJsonPayload(prompt, 0.75);
  }

  async function generateOracleArt(promptArte, aspectRatio = '3:4') {
    const apiKey = getApiKey();
    if (!apiKey || imageDisabledForKey === apiKey) {
      return { imageDataUrl: null, source: 'procedural', reason: 'Renderizado rápido procedural' };
    }

    if (discoveredCache.apiKey !== apiKey || !discoveredCache.ready) {
      try {
        await discoverAvailableModels(apiKey);
      } catch {
        // Si falla el descubrimiento, evitar bucles lentos
      }
    }

    // Si la cuenta no tiene modelos de imagen habilitados, pasar directo a procedural en 0 ms
    const predictModel = discoveredCache.predictImageModels?.[0] || null;
    const contentModel = discoveredCache.contentImageModels?.[0] || null;

    if (discoveredCache.ready && !predictModel && !contentModel) {
      imageDisabledForKey = apiKey;
      return {
        imageDataUrl: null,
        source: 'procedural',
        reason: 'Tu API Key no incluye modelos de imagen; usando fondo adaptativo instantáneo.'
      };
    }

    if (predictModel) {
      try {
        const imagenUrl = `${GEMINI_BASE_URL}/${predictModel}:predict?key=${encodeURIComponent(apiKey)}`;
        const res = await fetchWithTimeout(
          imagenUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              instances: [{ prompt: promptArte }],
              parameters: {
                sampleCount: 1,
                aspectRatio: aspectRatio === '9:16' ? '9:16' : '3:4',
                personGeneration: 'allow_adult'
              }
            })
          },
          7000
        );

        if (res.ok) {
          const json = await res.json();
          const pred = json?.predictions?.[0];
          if (pred?.bytesBase64Encoded) {
            const mime = pred.mimeType || 'image/png';
            return {
              imageDataUrl: `data:${mime};base64,${pred.bytesBase64Encoded}`,
              source: predictModel
            };
          }
        } else if ([400, 403, 404, 429].includes(res.status)) {
          imageDisabledForKey = apiKey;
        }
      } catch (err) {
        console.warn(`[Oráculo] Modelo de imagen ${predictModel} omitido:`, err);
      }
    }

    if (contentModel) {
      try {
        const altUrl = `${GEMINI_BASE_URL}/${contentModel}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resAlt = await fetchWithTimeout(
          altUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [{ text: `Generate an atmospheric hopeful background artwork only (strictly NO text or letters): ${promptArte}` }]
                }
              ],
              generationConfig: {
                responseModalities: ['IMAGE']
              }
            })
          },
          7000
        );

        if (resAlt.ok) {
          const jsonAlt = await resAlt.json();
          const parts = jsonAlt?.candidates?.[0]?.content?.parts || [];
          const inlinePart = parts.find((p) => p.inlineData && p.inlineData.data);
          if (inlinePart) {
            const mime = inlinePart.inlineData.mimeType || 'image/png';
            return {
              imageDataUrl: `data:${mime};base64,${inlinePart.inlineData.data}`,
              source: contentModel
            };
          }
        } else if ([400, 403, 404, 429].includes(resAlt.status)) {
          imageDisabledForKey = apiKey;
        }
      } catch (err) {
        console.warn(`[Oráculo] Fallback de imagen ${contentModel} omitido:`, err);
      }
    }

    return {
      imageDataUrl: null,
      source: 'procedural',
      reason: 'Cuota o acceso de API de imagen no disponible; renderizado procedural activado.'
    };
  }

  /**
   * Mensajes de esperanza para Modo Demo Local o sin conexión, cubriendo las 6 atmósferas visuales.
   */
  function buildLocalOracleFallback(contexto) {
    const num = contexto.numerologiaDia;
    const ley = contexto.corrientesObj?.kybalion;
    const estoico = contexto.corrientesObj?.estoicismo;
    const historia = contexto.corrientesObj?.historia;
    const signo = contexto.corrientesObj?.astrologia;
    const taoPool = Array.isArray(contexto.corrientesObj?.taoismoPool)
      ? contexto.corrientesObj.taoismoPool
      : contexto.corrientesObj?.taoismo
        ? [contexto.corrientesObj.taoismo]
        : [];

    const stoicPool = Array.isArray(contexto.corrientesObj?.estoicismoPool)
      ? contexto.corrientesObj.estoicismoPool
      : estoico
        ? [estoico]
        : [];
    const filosofiaObj = contexto.corrientesObj?.filosofia;
    const filosofiaPool = Array.isArray(contexto.corrientesObj?.filosofiaPool)
      ? contexto.corrientesObj.filosofiaPool
      : filosofiaObj
        ? [filosofiaObj]
        : [];
    const kybalionPool = Array.isArray(contexto.corrientesObj?.kybalionPool)
      ? contexto.corrientesObj.kybalionPool
      : ley
        ? [ley]
        : [];

    const recentGanchos = new Set(
      (contexto.recentMessages || []).map((m) => String(m.gancho || '').toUpperCase().trim())
    );
    const recentFrases = new Set(
      (contexto.recentMessages || []).map((m) => String(m.frase || '').toLowerCase().slice(0, 48))
    );

    const lastHook = String(contexto.recentMessages?.[0]?.gancho || '').toUpperCase();
    const buildAuthorQuoteFallback = ({ liveQuote, pool, defaultAtm, emoji, label, hashtags }) => {
      const fresh = pool.filter(
        (s) => !recentFrases.has(String(s.maxima || '').toLowerCase().slice(0, 48))
      );
      const nonSameAuthor = fresh.filter(
        (s) => !lastHook || !lastHook.includes(String(s.autor || '').toUpperCase())
      );
      const candidates = nonSameAuthor.length ? nonSameAuthor : fresh.length ? fresh : pool;
      const useLiveQuote =
        liveQuote &&
        !recentFrases.has(String(liveQuote.maxima || '').toLowerCase().slice(0, 48)) &&
        Math.random() < 0.4;
      const picked = useLiveQuote
        ? liveQuote
        : candidates[Math.floor(Math.random() * candidates.length)];

      const autor = String(picked.autor || 'Sócrates').trim();
      const obra = String(picked.obra || 'Obra Filosófica').trim();
      const maxima = String(picked.maxima || '').trim();
      const gancho = picked.gancho_sugerido
        ? String(picked.gancho_sugerido).toUpperCase().trim()
        : `${autor.toUpperCase()} · ${obra.toUpperCase()}`;
      const words = maxima
        .split(/\s+/)
        .map((w) => w.replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñ]+|[^A-Za-zÁÉÍÓÚáéíóúÑñ]+$/g, ''))
        .filter((w) => w.length >= 5);
      const storyBlock = picked.historia ? `\n\n🌿 ${picked.historia}` : '';
      const extraBlock = picked.ensenanza
        ? `\n\n📖 ${label}: ${picked.ensenanza}\n🛡️ Práctica para hoy: ${picked.aplicacion_practica || ''}`
        : `\n\n🛡️ Reflexión para hoy: Lleva esta idea a un gesto concreto de escucha, dignidad o calma en tu día.`;
      const sourceBlock = picked.sourceUrl ? `\n🔗 Fuente Wikiquote: ${picked.sourceUrl}` : '';
      const caption =
        `${emoji} ${picked.gancho_sugerido || `${autor} (${obra})`}\n\n"${maxima}"${storyBlock}${extraBlock}${sourceBlock}\n\n` +
        `🤝 Volver a la humanidad más humana empieza en cómo tratas hoy al otro y cómo cuidas tu propia presencia.\n\n` +
        hashtags;

      const atm = VALID_ATMOSPHERES.includes(picked.atmosfera)
        ? picked.atmosfera
        : contexto.targetAtmosphere || defaultAtm;

      return {
        gancho,
        frase: maxima,
        palabras_clave: [...new Set(words)].slice(0, 3),
        atmosfera: atm,
        prompt_arte: `${label} ${atm} landscape`,
        caption
      };
    };

    if (contexto.filtro === 'estoicismo' && (contexto.webPulse?.stoicQuote || stoicPool.length > 0)) {
      return buildAuthorQuoteFallback({
        liveQuote: contexto.webPulse?.stoicQuote,
        pool: stoicPool,
        defaultAtm: 'fortaleza',
        emoji: '🏛️',
        label: 'Enseñanza estoica',
        hashtags: '#Estoicismo #Humanidad #MarcoAurelio #Seneca #Epicteto #ZenonDeCitio #SabiduriaEstoica'
      });
    }

    if (
      (contexto.filtro === 'filosofia' || (!contexto.filtro && filosofiaPool.length > 0)) &&
      (contexto.webPulse?.filosofiaQuote || filosofiaPool.length > 0)
    ) {
      return buildAuthorQuoteFallback({
        liveQuote: contexto.webPulse?.filosofiaQuote,
        pool: filosofiaPool,
        defaultAtm: 'amanecer',
        emoji: '🦉',
        label: 'Enseñanza filosófica',
        hashtags: '#Filosofia #Humanidad #Socrates #Aristoteles #Kant #HannahArendt #EckhartTolle'
      });
    }

    const sabHumBackup = [
      {
        autor: 'Sabiduría de Vida · Ley de Siembra',
        obra: 'Parábolas Humanas',
        gancho_sugerido: 'LO QUE PONES EN EL MUNDO VUELVE A TI',
        maxima: 'Todo lo que pones en circulación —palabras, calma, respeto o enojo— termina volviendo tarde o temprano a tu propia mesa.',
        historia: 'La vida funciona como un campo fértil: nadie siembra espinas esperando frutos dulces; cada gesto cotidiano deja una huella que regresa a tu propia vida.',
        ensenanza: 'Cuidar la forma en que tratas a los demás hoy es también cuidar la paz que recibirás mañana.',
        aplicacion_practica: 'Elige hoy sembrar un trato amable incluso en una fila o conversación apurada.',
        atmosfera: 'amanecer'
      },
      {
        autor: 'Ética de la Reciprocidad',
        obra: 'Lectura Humana Universal',
        gancho_sugerido: 'REGALA EL TRATO QUE QUIERES ENCONTRAR',
        maxima: 'Ofrece hoy a las personas exactamente el mismo respeto, paciencia y escucha que sueñas encontrar cuando estás agotado.',
        historia: 'En lugar de esperar a que el mundo cambie primero, esta enseñanza propone iniciar tú el clima humano que quieres habitar.',
        ensenanza: 'No puedes controlar cómo actúan todos afuera, pero sí puedes decidir qué calidad de ser humano encuentra quien se cruza contigo.',
        aplicacion_practica: 'Responde hoy con la delicadeza que te gustaría recibir en un mal día.',
        atmosfera: 'aurora'
      },
      {
        autor: 'Eclesiastés (Qohélet)',
        obra: 'Sabiduría Antigua · Cap. 3',
        gancho_sugerido: 'TODO TIENE SU TIEMPO BAJO EL CIELO',
        maxima: 'Todo bajo el sol tiene su estación: tiempo de llorar y tiempo de reír, tiempo de soltar y tiempo de volver a construir.',
        historia: 'La antigua poesía de Eclesiastés recuerda con serenidad que ninguna etapa dura para siempre y que cada ciclo humano cumple un aprendizaje.',
        ensenanza: 'No te exijas florecer en pleno invierno; respeta tu proceso porque tu primavera también llegará.',
        aplicacion_practica: 'Acepta con paciencia el momento que estás viviendo hoy sin castigarte.',
        atmosfera: 'serenidad'
      }
    ];

    const sabHumObj = contexto.corrientesObj?.sabiduriaHumana;
    const sabHumPool =
      Array.isArray(contexto.corrientesObj?.sabiduriaHumanaPool) &&
      contexto.corrientesObj.sabiduriaHumanaPool.length > 0
        ? contexto.corrientesObj.sabiduriaHumanaPool
        : sabHumObj
          ? [sabHumObj]
          : sabHumBackup;

    if (contexto.filtro === 'sabiduria_humana') {
      return buildAuthorQuoteFallback({
        liveQuote: null,
        pool: sabHumPool,
        defaultAtm: 'amanecer',
        emoji: '🕊️',
        label: 'Sabiduría práctica',
        hashtags: '#SabiduriaHumana #Humanidad #Empatia #Esperanza #VidaConsciente #OraculoCiberFilosofico'
      });
    }

    if (contexto.filtro === 'kybalion') {
      const maestrosPool = Array.isArray(contexto.corrientesObj?.kybalionMaestros)
        ? contexto.corrientesObj.kybalionMaestros
        : [];
      const leyesPool = kybalionPool.map((k) => ({
        autor: `Kybalion · Ley ${k.numero}`,
        obra: k.nombre,
        maxima: k.axioma,
        ensenanza: k.principio,
        aplicacion_practica: k.aplicacion_practica,
        atmosfera: 'cosmos'
      }));
      const combinedUniversalPool = [...maestrosPool, ...leyesPool];
      if (contexto.webPulse?.kybalionQuote || combinedUniversalPool.length > 0) {
        return buildAuthorQuoteFallback({
          liveQuote: contexto.webPulse?.kybalionQuote,
          pool: combinedUniversalPool,
          defaultAtm: 'cosmos',
          emoji: '🔺',
          label: 'Ley Universal',
          hashtags: '#LeyesUniversales #Kybalion #HermesTrismegisto #NevilleGoddard #WayneDyer #JoeDispenza #Humanidad'
        });
      }
    }

    if (contexto.filtro === 'taoismo' && (contexto.webPulse?.taoQuote || taoPool.length > 0)) {
      const liveTao = contexto.webPulse?.taoQuote;
      const useLive = liveTao && !recentFrases.has(String(liveTao.maxima || '').toLowerCase().slice(0, 48)) && Math.random() < 0.35;

      if (useLive) {
        const wordsT = String(liveTao.maxima || '')
          .split(/\s+/)
          .map((w) => w.replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñ]+|[^A-Za-zÁÉÍÓÚáéíóúÑñ]+$/g, ''))
          .filter((w) => w.length >= 5);
        const ganchoLive = `${String(liveTao.autor || 'TAOÍSMO').toUpperCase()} · ${String(liveTao.obra || 'TAO').toUpperCase()}`;
        const captionLive =
          `☯️ ${liveTao.autor} (${liveTao.obra})\n\n"${liveTao.maxima}"\n\n` +
          `🌿 Frente a la prisa y al ruido de las pantallas, estas palabras devuelven calma, raíz y esperanza real hoy.\n` +
          `🔗 Fuente Wikiquote: ${liveTao.sourceUrl}\n\n` +
          `#Taoismo #Laozi #Zhuangzi #Liezi #WangChongyang #MaestrosCelestiales #EsperanzaReal`;
        return {
          gancho: ganchoLive,
          frase: liveTao.maxima,
          palabras_clave: [...new Set(wordsT)].slice(0, 3),
          atmosfera: contexto.targetAtmosphere || 'serenidad',
          prompt_arte: `Calm Taoist ${contexto.targetAtmosphere || 'serenidad'} nature landscape`,
          caption: captionLive
        };
      }

      const freshTao = taoPool.filter(
        (t) => !recentGanchos.has(String(t.gancho_sugerido || t.titulo || '').toUpperCase().trim())
      );
      const poolTao = freshTao.length ? freshTao : taoPool;
      const pickedTao = poolTao[Math.floor(Math.random() * poolTao.length)];
      const ganchoTao = String(pickedTao.gancho_sugerido || pickedTao.titulo || 'SABIDURÍA DEL TAO').toUpperCase();
      const fraseTao = String(pickedTao.frase_corta || pickedTao.ensenanza || '').trim();
      const captionTao =
        `☯️ ${pickedTao.titulo} — ${pickedTao.maestro}\n\n` +
        `📖 ${pickedTao.historia}\n\n` +
        `💡 Esperanza para hoy: ${pickedTao.ensenanza}\n\n` +
        `Guarda esta imagen si hoy necesitabas bajar el ruido y volver a lo real. ¿Qué maestro te resonó más?\n\n` +
        `#Taoismo #Laozi #Zhuangzi #Liezi #WangChongyang #MaestrosCelestiales #HistoriasCortas`;

      return {
        gancho: ganchoTao,
        frase: fraseTao,
        palabras_clave: Array.isArray(pickedTao.palabras_clave) ? pickedTao.palabras_clave.slice(0, 3) : [],
        atmosfera: VALID_ATMOSPHERES.includes(pickedTao.atmosfera) ? pickedTao.atmosfera : 'serenidad',
        prompt_arte: `Calm Taoist ${pickedTao.atmosfera || 'serenidad'} nature landscape`,
        caption: captionTao
      };
    }

    const plantillas = [
      () => ({
        gancho: 'PARA CUANDO LA NOCHE PAREZCA DEMASIADO LARGA',
        frase:
          'Ninguna oscuridad es eterna: por ley del ritmo, cada prueba silenciosa ya está gestando la claridad de tu próximo amanecer.',
        palabras_clave: ['ritmo', 'claridad', 'amanecer'],
        atmosfera: 'amanecer',
        caption_cuerpo: `${ley ? `Bajo el ${ley.nombre} ("${ley.axioma}"), ` : ''}el péndulo siempre regresa hacia la luz. Hoy la vibración ${num.numero} (${num.titulo}) te recuerda que no caminas en círculo: estás tomando impulso.`
      }),
      () => ({
        gancho: 'SI HOY SIENTES QUE ALGO SE ROMPIÓ POR DENTRO',
        frase:
          'Las fracturas de tu camino no anuncian el final; son vetas abiertas para que entre oro nuevo y reconstruyas tu historia.',
        palabras_clave: ['fracturas', 'oro', 'historia'],
        atmosfera: 'renacimiento',
        caption_cuerpo: `${historia ? `Como enseña ${historia.personaje_o_evento}: ${historia.aplicacion} ` : ''}No escondas tus cicatrices: son la prueba viva de que sobreviviste y aún puedes florecer.`
      }),
      () => ({
        gancho: 'CUANDO EL MIEDO INTENTE ROBARTE EL MAÑANA',
        frase:
          'Respira hondo y vuelve a tu calma interior: lo que hoy pesa como tormenta pronto será solo memoria de tu paz.',
        palabras_clave: ['calma', 'tormenta', 'paz'],
        atmosfera: 'serenidad',
        caption_cuerpo: `${estoico ? `${estoico.autor} escribía: "${estoico.maxima}" ` : ''}En la quietud de tu mente siempre existe un refugio intacto. Hoy es un buen día para soltar la carga que no te pertenece.`
      }),
      () => ({
        gancho: 'PARA RECORDARTE DE QUÉ ESTÁS HECHO HOY',
        frase:
          'Aun cuando tiemblen tus certezas, conservas una fuerza serena capaz de encender fuego nuevo en medio del invierno más duro.',
        palabras_clave: ['fuerza', 'fuego', 'invierno'],
        atmosfera: 'fortaleza',
        caption_cuerpo: `${estoico ? `${estoico.ensenanza} ` : ''}La vibración ${num.numero} de hoy te invita a dar un solo paso valiente: ${num.consejo}`
      }),
      () => ({
        gancho: 'SI NECESITAS UNA SEÑAL PARA NO RENDIRTE',
        frase:
          'Todo en el universo vibra y responde cuando eliges seguir creyendo: cada pequeño acto de esperanza transforma invisiblemente tu destino.',
        palabras_clave: ['vibra', 'esperanza', 'destino'],
        atmosfera: 'aurora',
        caption_cuerpo: `${ley ? `${ley.principio} ` : ''}${signo ? `Bajo la luz del arquetipo de ${signo.nombre}: ${signo.sabiduria}` : ''}`
      }),
      () => ({
        gancho: 'CUANDO PIERDAS EL RUMBO EN MEDIO DEL RUIDO',
        frase:
          'Alza la vista hacia el cielo interior: las mismas estrellas que guiaron a los antiguos siguen iluminando tu camino presente.',
        palabras_clave: ['cielo', 'estrellas', 'camino'],
        atmosfera: 'cosmos',
        caption_cuerpo: `En el tejido del tiempo nada de lo que amaste o luchaste se pierde. La energía ${num.numero} (${num.esencia}) alinea hoy tus pasos con un propósito mayor.`
      }),
      () => ({
        gancho: 'PARA CUANDO CREAS QUE AVANZAS MUY LENTO',
        frase:
          'Las raíces más firmes crecen bajo tierra sin hacer ruido; lo que hoy parece pausa está preparando tu mejor cosecha.',
        palabras_clave: ['raíces', 'firme', 'cosecha'],
        atmosfera: 'aurora',
        caption_cuerpo: `No midas tu progreso por la prisa del mundo. ${estoico ? `${estoico.autor}: "${estoico.maxima}".` : 'Cada paso constante construye futuro.'}`
      }),
      () => ({
        gancho: 'SI HOY TE CUESTA SOLTAR LO QUE YA CAMBIÓ',
        frase:
          'Como el río que abraza la curva del valle, tu alma sabe encontrar cauce nuevo sin perder su esencia viva.',
        palabras_clave: ['río', 'cauce', 'esencia'],
        atmosfera: 'serenidad',
        caption_cuerpo: `${ley ? `Principio del ${ley.nombre}: ${ley.aplicacion_practica}` : 'Fluir con lucidez también es fortaleza.'}`
      }),
      () => ({
        gancho: 'UN RECORDATORIO PARA NO EXIGIRTE PERFECCIÓN',
        frase:
          'No necesitas tener todas las respuestas esta mañana; basta un paso honesto hoy para que el horizonte se abra mañana.',
        palabras_clave: ['honesto', 'horizonte', 'mañana'],
        atmosfera: 'amanecer',
        caption_cuerpo: `Hoy la vibración ${num.numero} (${num.titulo}) celebra el valor de avanzar con humildad y presencia.`
      }),
      () => ({
        gancho: 'CUANDO EL CANSANCIO NUBLE TU PROPÓSITO',
        frase:
          'Descansar no es rendirse: incluso los árboles más antiguos guardan savia en invierno para volver a florecer con más fuerza.',
        palabras_clave: ['descansar', 'florecer', 'fuerza'],
        atmosfera: 'fortaleza',
        caption_cuerpo: `${historia ? `En la historia, ${historia.personaje_o_evento} nos enseña: ${historia.aplicacion}` : 'Cuidar tu energía también es estrategia.'}`
      }),
      () => ({
        gancho: '¿QUIÉN SABE QUÉ ES SUERTE HOY?',
        frase:
          'Como en la parábola taoísta del caballo perdido, lo que hoy parece tropiezo muchas veces te resguarda en silencio para mañana.',
        palabras_clave: ['taoísta', 'resguarda', 'mañana'],
        atmosfera: 'amanecer',
        caption_cuerpo:
          '📖 Parábola Taoísta: Un anciano perdió su único caballo y no se lamentó; días después regresó con otros corceles salvajes. Lo que hoy juzgamos como pérdida suele ser apenas el primer capítulo.'
      }),
      () => ({
        gancho: 'LA FUERZA SILENCIOSA DEL AGUA',
        frase:
          'El agua no choca ni rompe de golpe: rodea con calma, insiste sin odio y termina abriendo camino entre rocas firmes.',
        palabras_clave: ['agua', 'calma', 'camino'],
        atmosfera: 'serenidad',
        caption_cuerpo:
          '☯️ Enseñanza de Lao Tse: Lo más suave y constante vence con el tiempo a lo más rígido. Hoy avanza con flexibilidad serena.'
      })
    ];

    const freshTemplates = plantillas.filter((fn) => {
      const sample = fn();
      return !recentGanchos.has(String(sample.gancho || '').toUpperCase().trim());
    });
    const pool = freshTemplates.length ? freshTemplates : plantillas;
    const picked = pool[Math.floor(Math.random() * pool.length)]();
    const webNote = contexto.webPulse?.summaryText
      ? `\n\n🌐 Pulso del mundo hoy: ${contexto.webPulse.summaryText.split('\n')[0]}`
      : '';
    const caption = `✨ ${picked.gancho}\n\n${picked.frase}\n\n${picked.caption_cuerpo}${webNote}\n\n🌅 Vibración de hoy (${num.numero}): ${num.consejo}\n\nSi este mensaje llegó justo cuando lo necesitabas, guarda esta imagen o compártela con alguien que hoy necesite un poco de luz.\n\n#Esperanza #OraculoCiberFilosofico #Estoicismo #Kybalion #LuzInterior #Resiliencia #Numerologia`;

    return {
      gancho: picked.gancho,
      frase: picked.frase,
      palabras_clave: picked.palabras_clave,
      atmosfera: picked.atmosfera,
      prompt_arte: `Hopeful ${picked.atmosfera} atmospheric background`,
      caption
    };
  }

  function fitCompleteEphemerisText(rawText, maxChars = 205) {
    let clean = String(rawText || '');
    const junkIdx = clean.search(/(?:[«"'(]\s*)?(?:copia archivada|archivado desde el original|consultado el \d|wayback machine)/i);
    if (junkIdx !== -1) clean = clean.slice(0, junkIdx);
    clean = clean.replace(/\[\d+\]/g, '').replace(/\s*\.\.\.\s*/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return 'Cada fecha guarda memoria viva que inspira conciencia en nuestro presente.';

    const sentences = clean
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

    let out = '';
    for (const s of sentences) {
      const candidate = out ? `${out} ${s}` : s;
      if (candidate.length <= maxChars) {
        out = candidate;
      } else {
        break;
      }
    }

    if (out) {
      return /[.!?]$/.test(out) ? out : `${out}.`;
    }

    if (clean.length <= maxChars) {
      return /[.!?]$/.test(clean) ? clean : `${clean}.`;
    }

    const slice = clean.slice(0, maxChars - 1);
    const clauseEnd = Math.max(slice.lastIndexOf('; '), slice.lastIndexOf(', '), slice.lastIndexOf(' — '));
    const trimmed =
      clauseEnd >= 85
        ? slice.slice(0, clauseEnd)
        : slice
            .replace(/\s+\S*$/, '')
            .replace(/\s+(?:el|la|los|las|un|una|unos|unas|de|del|al|en|y|o|e|con|por|para|sobre|entre|su|sus|que)$/i, '');
    return `${trimmed.replace(/[,\s;:\-]+$/, '')}.`;
  }

  function buildLocalEphemerisFallback(ephemerisItem, contexto) {
    const rawText = String(ephemerisItem?.text || '').replace(/\s+/g, ' ').trim();
    const shortFrase = fitCompleteEphemerisText(rawText, 205);
    const isChile = ephemerisItem?.kind === 'chile' || contexto.efemerideEnfoque === 'chile';
    const isWorldDay = ephemerisItem?.kind === 'mundial';
    const gancho = isChile
      ? `CHILE · ${ephemerisItem?.year ? `TAL DÍA COMO HOY (${ephemerisItem.year})` : `EFEMÉRIDE ${contexto.fecha.getDate()} ${contexto.fecha.toLocaleDateString('es-ES', { month: 'short' }).toUpperCase()}`}`
      : isWorldDay
        ? `EFEMÉRIDE MUNDIAL · ${contexto.fecha.getDate()} ${contexto.fecha
            .toLocaleDateString('es-ES', { month: 'short' })
            .toUpperCase()}`
        : `TAL DÍA COMO HOY${ephemerisItem?.year ? ` · ${ephemerisItem.year}` : ''}`;

    const words = shortFrase
      .split(/\s+/)
      .map((w) => w.replace(/^[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9]+|[^A-Za-zÁÉÍÓÚáéíóúÑñ0-9]+$/g, ''))
      .filter((w) => w.length >= 4);
    const keywords = [];
    if (ephemerisItem?.year) keywords.push(String(ephemerisItem.year));
    for (const w of words) {
      if (keywords.length >= 3) break;
      if (!keywords.includes(w)) keywords.push(w);
    }

    const atmosfera = contexto.targetAtmosphere || 'aurora';
    const extraContext = ephemerisItem?.extract ? `\n\n📖 Contexto: ${ephemerisItem.extract}` : '';
    const sourceLine = ephemerisItem?.sourceUrl ? `\n🔗 Fuente: ${ephemerisItem.sourceUrl}` : '';
    const caption = isChile
      ? `🇨🇱 ${gancho} (${contexto.fechaTexto})\n\n${rawText}${extraContext}${sourceLine}\n\n🏔️ Recordar la historia y el pulso vivo de Chile nos invita a construir un mejor presente juntos. ¿Conocías este hecho?\n\n#EfemeridesDeChile #Chile #HistoriaDeChile #TalDiaComoHoy #CulturaChilena`
      : `📅 ${gancho} (${contexto.fechaTexto})\n\n${rawText}${extraContext}${sourceLine}\n\n🌍 Cada fecha guarda memoria colectiva que nos invita a mirar el presente con mayor conciencia. ¿Conocías este dato de hoy?\n\n#EfemeridesDeHoy #TalDiaComoHoy #CulturaGeneral #HistoriaMundial #ConcienciaGlobal`;

    return {
      gancho,
      frase: shortFrase,
      palabras_clave: keywords.slice(0, 3),
      atmosfera,
      prompt_arte: `Atmospheric ${atmosfera} world heritage background`,
      caption
    };
  }

  global.OraculoGemini = {
    TEXT_MODEL,
    IMAGEN_MODEL,
    FALLBACK_IMAGE_MODEL,
    VALID_ATMOSPHERES,
    inferAtmosphereFromText,
    getApiKey,
    setApiKey,
    hasApiKey,
    testApiKey,
    getActiveTextModel,
    generateOracleText,
    generateEphemerisCard,
    generateOracleArt,
    buildLocalOracleFallback,
    buildLocalEphemerisFallback
  };
})(window);
