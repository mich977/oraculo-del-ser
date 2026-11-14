/**
 * nature-service.js
 * Obtiene fotografías reales y aleatorias de naturaleza desde Wikimedia Commons (CORS abierto para Canvas HD)
 * sintonizadas con la atmósfera emocional del mensaje.
 */
(function (global) {
  'use strict';

  const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';

  // Categorías reales de paisajes y naturaleza en Wikimedia Commons
  const NATURE_CATEGORIES = {
    amanecer: [
      'Category:Sunrises',
      'Category:Dawn',
      'Category:Golden_hour_(photography)',
      'Category:Morning_mist'
    ],
    aurora: [
      'Category:Aurora',
      'Category:Forests',
      'Category:Mosses',
      'Category:Waterfalls'
    ],
    fortaleza: [
      'Category:Mountain_peaks',
      'Category:Cliffs',
      'Category:Clouds_at_sunset',
      'Category:Canyons'
    ],
    renacimiento: [
      'Category:Sunbeams',
      'Category:Wildflowers',
      'Category:Spring_(season)',
      'Category:Rainbows'
    ],
    serenidad: [
      'Category:Lakes',
      'Category:Ocean_waves',
      'Category:Misty_landscapes',
      'Category:Calm_water'
    ],
    cosmos: [
      'Category:Milky_Way',
      'Category:Night_sky',
      'Category:Starry_sky',
      'Category:Astrophotography'
    ]
  };

  const FALLBACK_CATEGORIES = [
    'Category:Landscapes',
    'Category:Nature',
    'Category:Mountains',
    'Category:Sunsets',
    'Category:Forests'
  ];

  // Caché en memoria de fotos descubiertas por categoría para cambios instantáneos
  const categoryPhotoCache = new Map();

  function jsonpRequest(url, timeoutMs = 4200) {
    return new Promise((resolve, reject) => {
      const cbName = `__oraculoNature_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      let done = false;

      const cleanup = () => {
        if (script.parentNode) script.parentNode.removeChild(script);
        try {
          delete global[cbName];
        } catch {
          global[cbName] = undefined;
        }
      };

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        cleanup();
        reject(new Error('Timeout consultando paisajes en Wikimedia Commons'));
      }, timeoutMs);

      global[cbName] = (data) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        resolve(data);
      };

      const sep = url.includes('?') ? '&' : '?';
      script.src = `${url}${sep}callback=${cbName}`;
      script.async = true;
      script.onerror = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        cleanup();
        reject(new Error('Error de red cargando paisaje de Wikimedia Commons'));
      };

      document.head.appendChild(script);
    });
  }

  async function fetchCategoryPhotos(categoryTitle) {
    if (categoryPhotoCache.has(categoryTitle)) {
      return categoryPhotoCache.get(categoryTitle);
    }

    const url =
      `${COMMONS_API}?action=query&generator=categorymembers` +
      `&gcmtitle=${encodeURIComponent(categoryTitle)}` +
      `&gcmtype=file&gcmlimit=40` +
      `&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1200&format=json`;

    const data = await jsonpRequest(url, 4200);
    const pages = Object.values(data?.query?.pages || {});

    const validPhotos = pages
      .map((p) => {
        const info = p.imageinfo?.[0];
        if (!info) return null;
        const mime = (info.mime || '').toLowerCase();
        if (mime !== 'image/jpeg' && mime !== 'image/png') return null;
        const thumbUrl = info.thumburl || info.url;
        if (!thumbUrl) return null;
        return {
          title: (p.title || '').replace(/^File:/i, '').replace(/\.[^.]+$/, ''),
          url: thumbUrl,
          pageUrl: info.descriptionurl || ''
        };
      })
      .filter(Boolean);

    if (validPhotos.length > 0) {
      categoryPhotoCache.set(categoryTitle, validPhotos);
    }
    return validPhotos;
  }

  /**
   * Pre-carga y verifica que la imagen cargue correctamente con crossOrigin='anonymous'
   * para no contaminar el Canvas al exportar PNG HD.
   */
  function verifyCorsImage(url, timeoutMs = 4500) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Timeout descargando imagen de naturaleza'));
      }, timeoutMs);

      img.onload = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(img);
      };

      img.onerror = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error('No se pudo cargar imagen CORS'));
      };

      img.src = url;
    });
  }

  /**
   * Devuelve una fotografía aleatoria de naturaleza lista para dibujar en Canvas.
   */
  async function fetchRandomNaturePhoto(atmosfera = 'amanecer', excludeUrl = '') {
    const moodPool = NATURE_CATEGORIES[atmosfera] || FALLBACK_CATEGORIES;
    const combinedPool = [...moodPool, ...FALLBACK_CATEGORIES];
    const pickedCategory = moodPool[Math.floor(Math.random() * moodPool.length)];

    const tryCategories = [
      pickedCategory,
      combinedPool[Math.floor(Math.random() * combinedPool.length)]
    ];

    for (const cat of tryCategories) {
      try {
        const list = await fetchCategoryPhotos(cat);
        if (!list.length) continue;

        const candidates = list.filter((item) => item.url !== excludeUrl);
        const pool = candidates.length ? candidates : list;
        const chosen = pool[Math.floor(Math.random() * pool.length)];

        // Verificar carga CORS antes de devolver para que canvas.toBlob() funcione siempre
        await verifyCorsImage(chosen.url, 4500);

        return {
          imageDataUrl: chosen.url,
          title: chosen.title,
          pageUrl: chosen.pageUrl,
          source: 'Naturaleza (Wikimedia)'
        };
      } catch (err) {
        console.warn(`[NatureService] Reintentando otra categoría tras fallo en ${cat}:`, err);
      }
    }

    return {
      imageDataUrl: null,
      title: 'Paisaje Procedural',
      source: 'procedural'
    };
  }

  global.OraculoNature = {
    fetchRandomNaturePhoto
  };
})(window);
