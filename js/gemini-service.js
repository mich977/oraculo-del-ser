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
    const estiloBase =
      'serene atmospheric nature landscape photography, luminous hopeful sky or natural light, tranquil mountain or forest or water horizon, clean soft negative space in upper-left for crisp white typography, strictly NO text, NO letters, NO words, NO watermarks';

    const webPulseBlock = contexto.webPulse?.summaryText
      ? `\nPULSO REAL DE LA WEB EN VIVO (Úsalo como chispa o metáfora contemporánea conectada con la sabiduría ancestral):\n${contexto.webPulse.summaryText}\n`
      : '';

    const recentList = Array.isArray(contexto.recentMessages) ? contexto.recentMessages : [];
    const antiRepeatBlock = recentList.length
      ? `\nMENSAJES YA MOSTRADOS (PROHIBIDO REPETIR O PARAFRASEAR — debes crear una metáfora, gancho y vocabulario 100% nuevos):\n${recentList
          .slice(0, 6)
          .map((m, i) => `${i + 1}. "${m.gancho}" — "${m.frase}"`)
          .join('\n')}\n`
      : '';

    const enfoques = [
      'la paciencia silenciosa de las semillas bajo tierra antes de brotar',
      'el coraje sereno de volver a empezar sin rencor',
      'la belleza imperfecta que renace tras las crisis',
      'la claridad interior cuando todo alrededor parece incierto',
      'el valor de avanzar un paso honesto hoy sin cargar el mañana',
      'el asombro y la gratitud frente a un horizonte abierto'
    ];
    const enfoqueRandom = enfoques[Math.floor(Math.random() * enfoques.length)];

    return `Actúa como el Oráculo Ciber-Filosófico: un guía sabio, compasivo y luminoso cuya MISIÓN PRINCIPAL es SEMBRAR ESPERANZA REAL, consuelo lúcido y fuerza interior en quien lee el mensaje hoy, fusionando sabiduría ancestral (Kybalion, Hermetismo, Estoicismo, Numerología, Astrología e Historia) con información viva del mundo real.

SEMILLA CREATIVA ÚNICA: #${Date.now()}-${Math.floor(Math.random() * 99999)} · Enfoque sugerido: ${enfoqueRandom}.

FECHA ACTUAL Y NUMEROLOGÍA DEL DÍA:
- Fecha: ${contexto.fechaTexto}
- Vibración Numerológica del Día: ${contexto.numerologiaDia.numero} (${contexto.numerologiaDia.titulo})
- Esencia del Número: ${contexto.numerologiaDia.esencia}
- Consejo Numerológico: ${contexto.numerologiaDia.consejo}

CORRIENTES SELECCIONADAS PARA ESTA INVOCACIÓN (Filtro: ${contexto.filtroLabel}):
${contexto.resumenCorrientes}${webPulseBlock}${antiRepeatBlock}

INSTRUCCIONES ESTRICTAS DE SALIDA (JSON):
1. "gancho": Un título corto, humano, original y psicológico en MAYÚSCULAS que abrace a alguien que está pasando un momento difícil y detenga el scroll (entre 4 y 9 palabras, completamente distinto a los mensajes recientes).
2. "frase": El mensaje central ORIGINAL de ESPERANZA y sabiduría (entre 15 y 28 palabras exactas). Debe sentirse cálido, honesto, profundo y restaurador (sin toxicidad positiva vacía, sino esperanza real anclada en filosofía). Evita clichés repetidos como "noche más larga".
3. "palabras_clave": Array de 2 o 3 palabras EXACTAS tal como aparecen escritas en "frase" que transmitan luz, fuerza o esperanza y deban resaltarse en color dorado.
4. "atmosfera": Elige exactamente UNA palabra entre ["amanecer", "aurora", "fortaleza", "renacimiento", "serenidad", "cosmos"] que mejor represente el paisaje emocional de tu "frase":
   - "amanecer": nuevos comienzos, salida tras la oscuridad, primer rayo de luz.
   - "aurora": sanación, esperanza suave, flujo, alivio espiritual.
   - "fortaleza": resiliencia, valentía, fuego interior, sostenerse en pie.
   - "renacimiento": kintsugi, heridas convertidas en oro y belleza, volver a empezar.
   - "serenidad": calma mental, silencio protector, paz en medio del ruido.
   - "cosmos": propósito mayor, destino, estrellas que guían en la noche.
5. "prompt_arte": Descripción poética y visual en INGLÉS de un FONDO ESCÉNICO ESPERANZADOR que ilustre literalmente la metáfora de "frase" y su "atmosfera". Integra este estilo: "${estiloBase}". PROHIBIDO incluir texto, letras o palabras.
6. "caption": Texto completo listo para publicar en redes sociales en español:
   - Primera línea: gancho empático con emoji luminoso.
   - Desarrollo filosófico esperanzador (2 a 3 párrafos breves conectando la frase con las corrientes invocadas y la energía numérica ${contexto.numerologiaDia.numero} de hoy).
   - Pregunta cálida o llamado a la acción para acompañar a la comunidad en comentarios.
   - Bloque final con 6 a 8 hashtags relevantes (#Esperanza #Estoicismo #Kybalion #SabiduriaAncestral #Resiliencia #Numerologia #LuzInterior).`;
  }

  function normalizeOraclePayload(raw) {
    const gancho = String(raw.gancho || 'PARA CUANDO SIENTAS QUE EL DÍA PESA DEMASIADO')
      .trim()
      .toUpperCase();
    const frase = String(
      raw.frase ||
        'Incluso la noche más larga obedece al ritmo del universo y prepara en silencio la claridad de tu próximo amanecer.'
    ).trim();

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

  async function generateOracleText(contexto, tema = 'ciber') {
    const apiKey = getApiKey();
    if (!apiKey) {
      throw new Error('NO_API_KEY');
    }

    const prompt = buildOraclePrompt(contexto, tema);
    const body = {
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 1.05,
        topP: 0.96,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            gancho: { type: 'STRING' },
            frase: { type: 'STRING' },
            palabras_clave: { type: 'ARRAY', items: { type: 'STRING' } },
            atmosfera: { type: 'STRING', enum: VALID_ATMOSPHERES },
            prompt_arte: { type: 'STRING' },
            caption: { type: 'STRING' }
          },
          required: ['gancho', 'frase', 'palabras_clave', 'atmosfera', 'prompt_arte', 'caption']
        }
      }
    };

    const callModel = async (modelName) => {
      const endpoint = `${GEMINI_BASE_URL}/${modelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
      return fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
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
      })
    ];

    const recentGanchos = new Set(
      (contexto.recentMessages || []).map((m) => String(m.gancho || '').toUpperCase().trim())
    );
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
    generateOracleArt,
    buildLocalOracleFallback
  };
})(window);
