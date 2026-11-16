/**
 * canvas-engine.js
 * Motor gráfico HTML5 Canvas de alta resolución para "Oráculo Ciber-Filosófico".
 * Renderiza fotografía natural aleatoria (o paisaje atmosférico de respaldo) a pantalla
 * completa con tipografía de esperanza limpia y legible, sin marcos ni líneas de libreta.
 * Soporta formatos 4:5 (1080x1350) y 9:16 (1080x1920).
 */
(function (global) {
  'use strict';

  const FORMAT_DIMENSIONS = {
    '4:5': { width: 1080, height: 1350, label: '4:5 Feed (1080×1350)' },
    '9:16': { width: 1080, height: 1920, label: '9:16 Historia/Reel (1080×1920)' }
  };

  const ATMOSPHERE_PALETTES = {
    amanecer: {
      label: '🌅 Amanecer de Esperanza',
      ciberStops: ['#070B1E', '#19193D', '#3D2134'],
      ciberAccent: '#FBBF24',
      ciberGlowPrimary: 'rgba(251, 191, 36, 0.24)',
      ciberGlowSecondary: 'rgba(255, 107, 74, 0.18)'
    },
    aurora: {
      label: '🌌 Aurora de Sanación',
      ciberStops: ['#030D14', '#08262E', '#04121F'],
      ciberAccent: '#2DD4BF',
      ciberGlowPrimary: 'rgba(45, 212, 191, 0.22)',
      ciberGlowSecondary: 'rgba(56, 189, 248, 0.16)'
    },
    fortaleza: {
      label: '🔥 Fuego y Fortaleza',
      ciberStops: ['#09070F', '#211119', '#0E0A14'],
      ciberAccent: '#FF6B3D',
      ciberGlowPrimary: 'rgba(255, 77, 45, 0.22)',
      ciberGlowSecondary: 'rgba(245, 158, 11, 0.15)'
    },
    renacimiento: {
      label: '✨ Renacimiento Kintsugi',
      ciberStops: ['#080514', '#1B1136', '#070B19'],
      ciberAccent: '#F59E0B',
      ciberGlowPrimary: 'rgba(245, 158, 11, 0.22)',
      ciberGlowSecondary: 'rgba(167, 139, 250, 0.16)'
    },
    serenidad: {
      label: '🌊 Serenidad Lunar',
      ciberStops: ['#030918', '#0B203F', '#040C1C'],
      ciberAccent: '#38BDF8',
      ciberGlowPrimary: 'rgba(56, 189, 248, 0.20)',
      ciberGlowSecondary: 'rgba(148, 163, 184, 0.14)'
    },
    cosmos: {
      label: '🌠 Cosmos y Propósito',
      ciberStops: ['#040614', '#13193E', '#061124'],
      ciberAccent: '#00F0FF',
      ciberGlowPrimary: 'rgba(0, 240, 255, 0.20)',
      ciberGlowSecondary: 'rgba(129, 140, 248, 0.16)'
    }
  };

  function hashString(str) {
    let h = 2166136261;
    const s = String(str || 'oraculo');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return Math.abs(h) || 4219;
  }

  function createSeededRandom(seedInt) {
    let seed = (seedInt % 2147483646) + 1;
    return () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }

  async function ensureFontsLoaded() {
    if (!document.fonts) return;
    try {
      const fontsPromise = Promise.all([
        document.fonts.load('700 44px "Space Grotesk"'),
        document.fonts.load('700 64px "Patrick Hand"'),
        document.fonts.load('700 68px "Caveat"'),
        document.fonts.load('500 24px "JetBrains Mono"'),
        document.fonts.ready
      ]);
      const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1500));
      await Promise.race([fontsPromise, timeoutPromise]);
    } catch (err) {
      console.warn('[CanvasEngine] Advertencia cargando fuentes:', err);
    }
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
      img.src = src;
    });
  }

  function normalizeToken(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/^[^a-z0-9ñ]+|[^a-z0-9ñ]+$/gi, '');
  }

  function buildKeywordChecker(palabrasClave = []) {
    const normalizedKeywords = new Set();
    for (const kw of palabrasClave) {
      const clean = String(kw || '').trim();
      if (!clean) continue;
      clean.split(/\s+/).forEach((part) => {
        const n = normalizeToken(part);
        if (n.length >= 2) normalizedKeywords.add(n);
      });
    }
    return (word) => normalizedKeywords.has(normalizeToken(word));
  }

  function wrapPlainText(ctx, text, maxWidth) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let current = '';

    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width <= maxWidth) {
        current = test;
      } else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
    return lines;
  }

  function wrapRichTokens(ctx, text, maxWidth, isKeywordFn) {
    const rawWords = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let currentLine = [];
    let currentWidth = 0;
    const spaceWidth = ctx.measureText(' ').width;

    for (const word of rawWords) {
      const wordWidth = ctx.measureText(word).width;
      const needed = currentLine.length > 0 ? spaceWidth + wordWidth : wordWidth;

      if (currentWidth + needed <= maxWidth) {
        currentLine.push({ text: word, width: wordWidth, isKeyword: isKeywordFn(word) });
        currentWidth += needed;
      } else {
        if (currentLine.length > 0) {
          lines.push({ tokens: currentLine, totalWidth: currentWidth });
        }
        currentLine = [{ text: word, width: wordWidth, isKeyword: isKeywordFn(word) }];
        currentWidth = wordWidth;
      }
    }

    if (currentLine.length > 0) {
      lines.push({ tokens: currentLine, totalWidth: currentWidth });
    }
    return lines;
  }

  /**
   * Integra la fotografía de naturaleza o arte IA a pantalla completa
   * con un velo atmosférico suave para mantener el texto legible sin ocultar el paisaje.
   */
  function drawDynamicAIArtworkBackdrop(ctx, img, W, H) {
    const scale = Math.max(W / img.width, H / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    const dx = (W - dw) * 0.5;
    const dy = (H - dh) * 0.5;

    ctx.save();
    ctx.drawImage(img, dx, dy, dw, dh);

    // Velo cinematográfico suave para contraste perfecto sobre cualquier foto natural
    const scrim = ctx.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, 'rgba(4, 9, 20, 0.52)');
    scrim.addColorStop(0.45, 'rgba(4, 9, 20, 0.46)');
    scrim.addColorStop(0.78, 'rgba(4, 9, 20, 0.28)');
    scrim.addColorStop(1, 'rgba(4, 9, 20, 0.36)');
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  /**
   * Pinta motivos atmosféricos (sol, aurora, kintsugi, fuego, luna o estrellas)
   * cuando no hay fotografía cargada o como respaldo offline.
   */
  function drawAtmosphereMotifs(ctx, W, H, atmosfera, rand) {
    ctx.save();

    if (atmosfera === 'amanecer') {
      const sunX = W * 0.78;
      const sunY = H * 0.74;
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 16, sunX, sunY, W * 0.62);
      sunGlow.addColorStop(0, 'rgba(253, 224, 71, 0.38)');
      sunGlow.addColorStop(0.28, 'rgba(251, 146, 60, 0.24)');
      sunGlow.addColorStop(0.65, 'rgba(244, 63, 94, 0.08)');
      sunGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 7; i++) {
        const angle = -Math.PI * 0.92 + i * 0.16;
        ctx.beginPath();
        ctx.moveTo(sunX, sunY);
        ctx.lineTo(sunX + Math.cos(angle) * W, sunY + Math.sin(angle) * W);
        ctx.lineTo(sunX + Math.cos(angle + 0.06) * W, sunY + Math.sin(angle + 0.06) * W);
        ctx.closePath();
        ctx.fillStyle = 'rgba(253, 224, 71, 0.045)';
        ctx.fill();
      }
    } else if (atmosfera === 'aurora') {
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        const baseY = H * (0.28 + r * 0.18);
        ctx.moveTo(0, baseY);
        for (let x = 0; x <= W; x += 60) {
          const wave = Math.sin(x * 0.005 + r * 1.4) * 75 + Math.cos(x * 0.009 - r) * 35;
          ctx.lineTo(x, baseY + wave);
        }
        ctx.lineTo(W, baseY + 260);
        ctx.lineTo(0, baseY + 260);
        ctx.closePath();
        const aurGrad = ctx.createLinearGradient(0, baseY - 80, 0, baseY + 240);
        aurGrad.addColorStop(0, 'rgba(45, 212, 191, 0)');
        aurGrad.addColorStop(0.45, r % 2 === 0 ? 'rgba(45, 212, 191, 0.13)' : 'rgba(56, 189, 248, 0.11)');
        aurGrad.addColorStop(1, 'rgba(45, 212, 191, 0)');
        ctx.fillStyle = aurGrad;
        ctx.fill();
      }
    } else if (atmosfera === 'renacimiento') {
      for (let v = 0; v < 5; v++) {
        let vx = rand() * W * 0.4 + W * 0.45;
        let vy = rand() * H * 0.35 + H * 0.35;
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        for (let s = 0; s < 8; s++) {
          vx += (rand() - 0.32) * 140;
          vy += (rand() - 0.35) * 140;
          ctx.lineTo(vx, vy);
        }
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.36)';
        ctx.lineWidth = 2.4;
        ctx.shadowColor = 'rgba(245, 158, 11, 0.65)';
        ctx.shadowBlur = 12;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    } else if (atmosfera === 'fortaleza') {
      const fireGlow = ctx.createRadialGradient(W * 0.76, H * 0.82, 20, W * 0.76, H * 0.82, W * 0.58);
      fireGlow.addColorStop(0, 'rgba(255, 77, 45, 0.25)');
      fireGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fireGlow;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 42; i++) {
        const sx = W * 0.3 + rand() * W * 0.7;
        const sy = H * 0.25 + rand() * H * 0.72;
        const sr = rand() * 3.2 + 1;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(251, 191, 36, ${(0.25 + rand() * 0.55).toFixed(2)})`;
        ctx.fill();
      }
    } else if (atmosfera === 'serenidad') {
      const moonX = W * 0.8;
      const moonY = H * 0.27;
      const moonHalo = ctx.createRadialGradient(moonX, moonY, 8, moonX, moonY, 210);
      moonHalo.addColorStop(0, 'rgba(186, 230, 253, 0.26)');
      moonHalo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = moonHalo;
      ctx.fillRect(0, 0, W, H);

      for (let c = 1; c <= 5; c++) {
        ctx.beginPath();
        ctx.ellipse(W * 0.74, H * 0.86, c * 110, c * 28, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.14)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    } else {
      const pts = [];
      for (let i = 0; i < 48; i++) {
        const x = rand() * W;
        const y = rand() * H;
        const r = rand() * 2.2 + 0.6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(224, 242, 254, ${(0.2 + rand() * 0.65).toFixed(2)})`;
        ctx.fill();
        if (i < 10) pts.push([x, y]);
      }
      ctx.beginPath();
      pts.forEach(([px, py], idx) => (idx === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawScenicBaseBackground(ctx, W, H, atmosfera, rand) {
    const pal = ATMOSPHERE_PALETTES[atmosfera] || ATMOSPHERE_PALETTES.amanecer;
    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, pal.ciberStops[0]);
    bg.addColorStop(0.5, pal.ciberStops[1]);
    bg.addColorStop(1, pal.ciberStops[2]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glowTop = ctx.createRadialGradient(W * 0.18, H * 0.16, 20, W * 0.18, H * 0.16, W * 0.72);
    glowTop.addColorStop(0, pal.ciberGlowPrimary);
    glowTop.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowTop;
    ctx.fillRect(0, 0, W, H);

    const glowBottom = ctx.createRadialGradient(W * 0.82, H * 0.8, 10, W * 0.82, H * 0.8, W * 0.62);
    glowBottom.addColorStop(0, pal.ciberGlowSecondary);
    glowBottom.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = glowBottom;
    ctx.fillRect(0, 0, W, H);

    drawAtmosphereMotifs(ctx, W, H, atmosfera, rand);
  }

  /**
   * Respaldo offline: dibuja un paisaje natural en capas (montañas con neblina, sol/luna y pinos).
   */
  function drawProceduralNatureLandscape(ctx, W, H, atmosfera = 'amanecer', rand = Math.random) {
    const pal = ATMOSPHERE_PALETTES[atmosfera] || ATMOSPHERE_PALETTES.amanecer;
    ctx.save();

    const sunX = W * 0.74;
    const sunY = H * 0.64;
    const sunR = W * 0.08;
    const halo = ctx.createRadialGradient(sunX, sunY, sunR * 0.2, sunX, sunY, W * 0.42);
    halo.addColorStop(0, atmosfera === 'serenidad' ? 'rgba(224, 242, 254, 0.55)' : 'rgba(253, 224, 71, 0.48)');
    halo.addColorStop(0.35, pal.ciberGlowPrimary);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, W * 0.42, 0, Math.PI * 2);
    ctx.fill();

    const ridgeConfigs = [
      { baseY: H * 0.72, amp: 95, alpha: 0.34 },
      { baseY: H * 0.79, amp: 75, alpha: 0.54 },
      { baseY: H * 0.86, amp: 55, alpha: 0.78 }
    ];

    ridgeConfigs.forEach((cfg, idx) => {
      ctx.beginPath();
      ctx.moveTo(0, H);
      ctx.lineTo(0, cfg.baseY);
      const segments = 10;
      for (let i = 1; i <= segments; i++) {
        const px = (W / segments) * i;
        const py = cfg.baseY - Math.sin(i * 0.9 + idx * 1.8) * cfg.amp - rand() * 28;
        ctx.lineTo(px, py);
      }
      ctx.lineTo(W, H);
      ctx.closePath();

      ctx.fillStyle = `rgba(8, 15, 32, ${cfg.alpha})`;
      ctx.fill();
      ctx.strokeStyle = pal.ciberAccent;
      ctx.globalAlpha = 0.15 + idx * 0.08;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    for (let i = 0; i < 16; i++) {
      const tx = W * 0.35 + i * (W * 0.044) + (rand() - 0.5) * 14;
      const treeH = 52 + rand() * 58;
      const treeY = H - 10;
      ctx.beginPath();
      ctx.moveTo(tx, treeY - treeH);
      ctx.lineTo(tx - treeH * 0.24, treeY);
      ctx.lineTo(tx + treeH * 0.24, treeY);
      ctx.closePath();
      ctx.fillStyle = 'rgba(4, 8, 18, 0.88)';
      ctx.fill();
    }

    ctx.restore();
  }

  function drawRoundedRect(ctx, x, y, w, h, r) {
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawHeaderHUD(ctx, W, H, meta, pal) {
    const now = meta.fecha || new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());

    ctx.save();

    const boxH = 52;
    const boxW_D = 66;
    const boxW_M = 66;
    const boxW_A = 94;
    const gap = 8;
    const totalW = boxW_D + boxW_M + boxW_A + gap * 2;
    const startX = W - 76 - totalW;
    const startY = 68;

    const cells = [
      { label: 'D', val: dd, w: boxW_D, x: startX },
      { label: 'M', val: mm, w: boxW_M, x: startX + boxW_D + gap },
      { label: 'A', val: yyyy, w: boxW_A, x: startX + boxW_D + boxW_M + gap * 2 }
    ];

    for (const c of cells) {
      ctx.fillStyle = 'rgba(6, 12, 24, 0.45)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.lineWidth = 1.3;

      drawRoundedRect(ctx, c.x, startY, c.w, boxH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = '600 12px "JetBrains Mono", monospace';
      ctx.fillStyle = pal.ciberAccent;
      ctx.textAlign = 'center';
      ctx.fillText(c.label, c.x + c.w / 2, startY + 16);

      ctx.font = '700 22px "JetBrains Mono", monospace';
      ctx.fillStyle = '#F8FAFC';
      ctx.fillText(c.val, c.x + c.w / 2, startY + 42);
    }

    ctx.restore();
  }

  function drawVerticalSignature(ctx, H, firma) {
    const cleanFirma = (firma || 'By Michael_NB-γ').trim();
    ctx.save();
    ctx.translate(46, H * 0.56);
    ctx.rotate(-Math.PI / 2);
    ctx.font = '500 19px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(241, 245, 249, 0.78)';
    ctx.fillText(cleanFirma, 0, 0);
    ctx.restore();
  }

  async function renderOracleCanvas(canvas, payload, options = {}) {
    await ensureFontsLoaded();

    const formato = FORMAT_DIMENSIONS[options.formato] ? options.formato : '4:5';
    const { width: W, height: H } = FORMAT_DIMENSIONS[formato];

    // Determinar atmósfera visual a partir del payload o inferirla del texto
    let atmosfera = payload?.atmosfera;
    if (!ATMOSPHERE_PALETTES[atmosfera]) {
      const inferFn = global.OraculoGemini?.inferAtmosphereFromText;
      atmosfera = inferFn ? inferFn(`${payload?.gancho || ''} ${payload?.frase || ''}`) : 'amanecer';
    }
    const pal = ATMOSPHERE_PALETTES[atmosfera] || ATMOSPHERE_PALETTES.amanecer;
    const rand = createSeededRandom(hashString(`${payload?.gancho || ''}${payload?.frase || ''}`));

    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // 1. Fondo base atmosférico (visible mientras carga o cuando no hay conexión)
    drawScenicBaseBackground(ctx, W, H, atmosfera, rand);

    // 2. Fotografía de naturaleza aleatoria o paisaje ilustrado de respaldo
    let artRendered = false;
    if (payload?.imageDataUrl) {
      try {
        const img = await loadImage(payload.imageDataUrl);
        drawDynamicAIArtworkBackdrop(ctx, img, W, H);
        artRendered = true;
      } catch (err) {
        console.warn('[CanvasEngine] No se pudo decodificar la imagen de fondo, usando paisaje procedural.', err);
      }
    }
    if (!artRendered) {
      drawProceduralNatureLandscape(ctx, W, H, atmosfera, rand);
    }

    // 3. Fecha discreta D | M | A
    drawHeaderHUD(ctx, W, H, options, pal);

    // 4. Gancho psicológico en la zona superior sobre el paisaje
    const contentLeft = 104;
    const contentWidth = W - contentLeft - 88;
    const isReel = formato === '9:16';

    ctx.save();
    ctx.font = `700 ${isReel ? 40 : 37}px "Space Grotesk", sans-serif`;
    ctx.textAlign = 'left';
    const hookLines = wrapPlainText(ctx, payload?.gancho || '', contentWidth);
    let cursorY = isReel ? 280 : 245;
    const hookLineHeight = isReel ? 52 : 48;

    for (const line of hookLines.slice(0, 3)) {
      ctx.shadowColor = 'rgba(0, 0, 0, 0.78)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 2;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(line, contentLeft, cursorY);
      cursorY += hookLineHeight;
    }

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.beginPath();
    const barY = cursorY - 12;
    ctx.moveTo(contentLeft, barY);
    ctx.lineTo(contentLeft + 140, barY);
    ctx.strokeStyle = pal.ciberAccent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // 5. Frase central con resaltado de palabras clave y sombra nítida sobre la naturaleza
    const fraseTopY = barY + (isReel ? 120 : 84);
    const maxFraseBottomY = H * (isReel ? 0.69 : 0.70);
    const fraseWidth = contentWidth - 12;

    let fontSize = isReel ? 66 : 60;
    const isKeywordFn = buildKeywordChecker(payload?.palabras_clave || []);
    let richLines = [];

    while (fontSize >= 32) {
      ctx.font = `700 ${fontSize}px "Patrick Hand", "Caveat", cursive, sans-serif`;
      richLines = wrapRichTokens(ctx, payload?.frase || '', fraseWidth, isKeywordFn);
      const totalHeight = richLines.length * (fontSize * 1.28);
      if (fraseTopY + totalHeight <= maxFraseBottomY) {
        break;
      }
      fontSize -= 3;
    }

    const lineHeight = Math.round(fontSize * 1.28);
    const blockHeight = richLines.length * lineHeight;
    const availableSpace = maxFraseBottomY - fraseTopY;
    let textY = fraseTopY + Math.max(20, (availableSpace - blockHeight) * 0.42) + fontSize * 0.85;

    ctx.save();
    ctx.font = `700 ${fontSize}px "Patrick Hand", "Caveat", cursive, sans-serif`;
    ctx.textAlign = 'left';
    const spaceW = ctx.measureText(' ').width;

    for (const line of richLines) {
      let curX = contentLeft;
      for (const token of line.tokens) {
        if (token.isKeyword) {
          ctx.fillStyle = '#FBBF24';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetY = 2;
          ctx.fillText(token.text, curX, textY);
        } else {
          ctx.fillStyle = '#FFFFFF';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = 14;
          ctx.shadowOffsetY = 2;
          ctx.fillText(token.text, curX, textY);
        }
        curX += token.width + spaceW;
      }
      textY += lineHeight;
    }
    ctx.restore();

    // 6. Firma vertical discreta en margen izquierdo
    drawVerticalSignature(ctx, H, options.firma);
  }

  global.OraculoCanvas = {
    FORMAT_DIMENSIONS,
    ATMOSPHERE_PALETTES,
    ensureFontsLoaded,
    renderOracleCanvas
  };
})(window);
