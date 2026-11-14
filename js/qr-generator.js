/**
 * qr-generator.js
 * Generador estándar ISO/IEC 18004 de códigos QR (Byte Mode, ECC Level M, Versiones 1–10)
 * 100% offline y sin dependencias externas, compatible con file:// y HTTP/HTTPS.
 */
(function (global) {
  'use strict';

  // Tabla ISO 18004 para Nivel M (15% corrección): [totalCodewords, [[count, dataWords, eccWords], ...], alignmentCoords]
  const QR_VERSIONS_M = {
    1:  { total: 26,  blocks: [[1, 16, 10]], align: [] },
    2:  { total: 44,  blocks: [[1, 28, 16]], align: [6, 18] },
    3:  { total: 70,  blocks: [[1, 44, 26]], align: [6, 22] },
    4:  { total: 100, blocks: [[2, 32, 18]], align: [6, 26] },
    5:  { total: 134, blocks: [[2, 43, 24]], align: [6, 30] },
    6:  { total: 172, blocks: [[4, 27, 16]], align: [6, 34] },
    7:  { total: 196, blocks: [[4, 31, 18]], align: [6, 22, 38] },
    8:  { total: 242, blocks: [[2, 38, 22], [2, 39, 22]], align: [6, 24, 42] },
    9:  { total: 292, blocks: [[3, 36, 22], [2, 37, 22]], align: [6, 26, 46] },
    10: { total: 346, blocks: [[4, 43, 26], [1, 44, 26]], align: [6, 28, 50] }
  };

  // Aritmética GF(256) con polinomio primitivo 0x11d (285)
  const GF_EXP = new Uint8Array(512);
  const GF_LOG = new Uint8Array(256);
  (function initGF() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      GF_EXP[i] = x;
      GF_LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i++) {
      GF_EXP[i] = GF_EXP[i - 255];
    }
  })();

  function gfMul(a, b) {
    if (a === 0 || b === 0) return 0;
    return GF_EXP[GF_LOG[a] + GF_LOG[b]];
  }

  function rsGeneratorPoly(eccCount) {
    let poly = [1];
    for (let i = 0; i < eccCount; i++) {
      const next = new Array(poly.length + 1).fill(0);
      const root = GF_EXP[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] ^= poly[j];
        next[j + 1] ^= gfMul(poly[j], root);
      }
      poly = next;
    }
    return poly;
  }

  function rsComputeEcc(data, eccCount) {
    const gen = rsGeneratorPoly(eccCount);
    const res = new Uint8Array(data.length + eccCount);
    res.set(data, 0);
    for (let i = 0; i < data.length; i++) {
      const factor = res[i];
      if (factor !== 0) {
        for (let j = 0; j < gen.length; j++) {
          res[i + j] ^= gfMul(gen[j], factor);
        }
      }
    }
    return Array.from(res.slice(data.length));
  }

  function encodeUtf8Bytes(str) {
    if (typeof TextEncoder !== 'undefined') {
      return Array.from(new TextEncoder().encode(str));
    }
    const encoded = unescape(encodeURIComponent(str));
    const out = [];
    for (let i = 0; i < encoded.length; i++) {
      out.push(encoded.charCodeAt(i));
    }
    return out;
  }

  function pickVersion(byteLen) {
    for (let v = 1; v <= 10; v++) {
      const spec = QR_VERSIONS_M[v];
      const dataCapacity = spec.blocks.reduce((acc, [cnt, dw]) => acc + cnt * dw, 0);
      const countBits = v <= 9 ? 8 : 16;
      const neededBits = 4 + countBits + byteLen * 8;
      if (neededBits <= dataCapacity * 8) {
        return { version: v, spec, dataCapacity, countBits };
      }
    }
    throw new Error('La URL excede la capacidad máxima (213 bytes) del generador QR.');
  }

  function buildDataCodewords(bytes, version, dataCapacity, countBits) {
    const bits = [];
    const pushBits = (val, len) => {
      for (let i = len - 1; i >= 0; i--) {
        bits.push((val >>> i) & 1);
      }
    };

    pushBits(0b0100, 4); // Modo Byte
    pushBits(bytes.length, countBits);
    for (const b of bytes) pushBits(b, 8);

    const maxBits = dataCapacity * 8;
    const termLen = Math.min(4, maxBits - bits.length);
    pushBits(0, termLen);

    while (bits.length % 8 !== 0) bits.push(0);

    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byteVal = 0;
      for (let b = 0; b < 8; b++) byteVal = (byteVal << 1) | bits[i + b];
      codewords.push(byteVal);
    }

    const pads = [0xec, 0x11];
    let padIdx = 0;
    while (codewords.length < dataCapacity) {
      codewords.push(pads[padIdx % 2]);
      padIdx++;
    }
    return codewords;
  }

  function interleaveBlocks(codewords, spec) {
    const dataBlocks = [];
    const eccBlocks = [];
    let offset = 0;

    for (const [count, dataLen, eccLen] of spec.blocks) {
      for (let i = 0; i < count; i++) {
        const block = codewords.slice(offset, offset + dataLen);
        offset += dataLen;
        dataBlocks.push(block);
        eccBlocks.push(rsComputeEcc(block, eccLen));
      }
    }

    const result = [];
    const maxDataLen = Math.max(...dataBlocks.map((b) => b.length));
    for (let col = 0; col < maxDataLen; col++) {
      for (const blk of dataBlocks) {
        if (col < blk.length) result.push(blk[col]);
      }
    }
    const maxEccLen = Math.max(...eccBlocks.map((b) => b.length));
    for (let col = 0; col < maxEccLen; col++) {
      for (const blk of eccBlocks) {
        if (col < blk.length) result.push(blk[col]);
      }
    }
    return result;
  }

  function createEmptyMatrix(size) {
    const modules = Array.from({ length: size }, () => new Uint8Array(size));
    const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
    return { size, modules, isFunc };
  }

  function setFuncModule(m, r, c, dark) {
    if (r < 0 || r >= m.size || c < 0 || c >= m.size) return;
    m.modules[r][c] = dark ? 1 : 0;
    m.isFunc[r][c] = 1;
  }

  function drawFinder(m, top, left) {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const r = top + dr;
        const c = left + dc;
        if (r < 0 || r >= m.size || c < 0 || c >= m.size) continue;
        const inOuter = dr >= 0 && dr <= 6 && (dc === 0 || dc === 6);
        const inTopBot = dc >= 0 && dc <= 6 && (dr === 0 || dr === 6);
        const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4;
        setFuncModule(m, r, c, inOuter || inTopBot || inCore);
      }
    }
  }

  function drawAlignment(m, centerR, centerC) {
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const dist = Math.max(Math.abs(dr), Math.abs(dc));
        setFuncModule(m, centerR + dr, centerC + dc, dist !== 1);
      }
    }
  }

  function drawFunctionPatterns(m, version, alignCoords) {
    const N = m.size;
    drawFinder(m, 0, 0);
    drawFinder(m, 0, N - 7);
    drawFinder(m, N - 7, 0);

    for (let i = 8; i < N - 8; i++) {
      const dark = i % 2 === 0;
      setFuncModule(m, 6, i, dark);
      setFuncModule(m, i, 6, dark);
    }

    if (alignCoords.length > 0) {
      for (const ar of alignCoords) {
        for (const ac of alignCoords) {
          const overlapsFinder =
            (ar <= 8 && ac <= 8) ||
            (ar <= 8 && ac >= N - 9) ||
            (ar >= N - 9 && ac <= 8);
          if (!overlapsFinder) drawAlignment(m, ar, ac);
        }
      }
    }

    // Reservar áreas de formato (alrededor de los 3 finders) y módulo oscuro obligatorio
    for (let i = 0; i <= 8; i++) {
      if (i !== 6) {
        setFuncModule(m, 8, i, false);
        setFuncModule(m, i, 8, false);
      }
    }
    for (let i = N - 8; i < N; i++) {
      setFuncModule(m, 8, i, false);
      setFuncModule(m, i, 8, false);
    }
    setFuncModule(m, 4 * version + 9, 8, true);

    if (version >= 7) {
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 3; j++) {
          setFuncModule(m, i, N - 11 + j, false);
          setFuncModule(m, N - 11 + j, i, false);
        }
      }
    }
  }

  function placeDataBits(m, allCodewords) {
    const N = m.size;
    let bitIndex = 0;
    const totalBits = allCodewords.length * 8;
    let upward = true;

    for (let right = N - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < N; step++) {
        const r = upward ? N - 1 - step : step;
        for (let offset = 0; offset < 2; offset++) {
          const c = right - offset;
          if (!m.isFunc[r][c]) {
            let bit = 0;
            if (bitIndex < totalBits) {
              const cw = allCodewords[bitIndex >>> 3];
              bit = (cw >>> (7 - (bitIndex & 7))) & 1;
            }
            m.modules[r][c] = bit;
            bitIndex++;
          }
        }
      }
      upward = !upward;
    }
  }

  function applyMaskPattern(m, maskId) {
    const N = m.size;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (m.isFunc[r][c]) continue;
        let invert = false;
        switch (maskId) {
          case 0: invert = (r + c) % 2 === 0; break;
          case 1: invert = r % 2 === 0; break;
          case 2: invert = c % 3 === 0; break;
          case 3: invert = (r + c) % 3 === 0; break;
          case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
          case 5: invert = ((r * c) % 2) + ((r * c) % 3) === 0; break;
          case 6: invert = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          case 7: invert = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
        }
        if (invert) m.modules[r][c] ^= 1;
      }
    }
  }

  function drawFormatInfo(m, maskId) {
    // ECC Level M = 00 -> 5 bits: (0 << 3) | maskId
    const data = maskId & 0x7;
    let rem = data << 10;
    for (let i = 4; i >= 0; i--) {
      if ((rem >>> (i + 10)) & 1) rem ^= 0x537 << i;
    }
    const formatBits = ((data << 10) | rem) ^ 0x5412;
    const N = m.size;
    const bitAt = (idx) => (formatBits >>> idx) & 1;

    // Copia 1 alrededor del finder superior izquierdo (bit 14 MSB en (8,0) .. bit 0 LSB en (0,8))
    for (let c = 0; c <= 5; c++) setFuncModule(m, 8, c, bitAt(14 - c));
    setFuncModule(m, 8, 7, bitAt(8));
    setFuncModule(m, 8, 8, bitAt(7));
    setFuncModule(m, 7, 8, bitAt(6));
    for (let r = 5; r >= 0; r--) setFuncModule(m, r, 8, bitAt(r));

    // Copia 2 dividida entre inferior izquierdo (bits 14..8) y superior derecho (bits 7..0)
    for (let i = 0; i < 7; i++) setFuncModule(m, N - 1 - i, 8, bitAt(14 - i));
    setFuncModule(m, N - 8, 8, 1); // Módulo oscuro fijo ISO 18004
    for (let i = 0; i < 8; i++) setFuncModule(m, 8, N - 8 + i, bitAt(7 - i));
  }

  function drawVersionInfo(m, version) {
    if (version < 7) return;
    let rem = version << 12;
    for (let i = 5; i >= 0; i--) {
      if ((rem >>> (i + 12)) & 1) rem ^= 0x1f25 << i;
    }
    const bits = (version << 12) | rem;
    const N = m.size;
    for (let i = 0; i < 18; i++) {
      const bit = (bits >>> i) & 1;
      const a = N - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFuncModule(m, b, a, bit);
      setFuncModule(m, a, b, bit);
    }
  }

  function evaluatePenalty(m) {
    const N = m.size;
    let score = 0;

    for (let r = 0; r < N; r++) {
      let runColor = m.modules[r][0];
      let runLen = 1;
      for (let c = 1; c < N; c++) {
        if (m.modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = m.modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }

    for (let c = 0; c < N; c++) {
      let runColor = m.modules[0][c];
      let runLen = 1;
      for (let r = 1; r < N; r++) {
        if (m.modules[r][c] === runColor) {
          runLen++;
        } else {
          if (runLen >= 5) score += 3 + (runLen - 5);
          runColor = m.modules[r][c];
          runLen = 1;
        }
      }
      if (runLen >= 5) score += 3 + (runLen - 5);
    }

    for (let r = 0; r < N - 1; r++) {
      for (let c = 0; c < N - 1; c++) {
        const v = m.modules[r][c];
        if (v === m.modules[r + 1][c] && v === m.modules[r][c + 1] && v === m.modules[r + 1][c + 1]) {
          score += 3;
        }
      }
    }

    let darkCount = 0;
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) darkCount += m.modules[r][c];
    }
    const percent = (darkCount * 100) / (N * N);
    score += Math.floor(Math.abs(percent - 50) / 5) * 10;
    return score;
  }

  function cloneMatrix(m) {
    return {
      size: m.size,
      modules: m.modules.map((row) => new Uint8Array(row)),
      isFunc: m.isFunc
    };
  }

  function encodeQRMatrix(text) {
    const bytes = encodeUtf8Bytes(String(text || '').trim() || 'https://github.com');
    const { version, spec, dataCapacity, countBits } = pickVersion(bytes.length);
    const dataCodewords = buildDataCodewords(bytes, version, dataCapacity, countBits);
    const fullStream = interleaveBlocks(dataCodewords, spec);

    const N = 17 + 4 * version;
    const base = createEmptyMatrix(N);
    drawFunctionPatterns(base, version, spec.align);
    placeDataBits(base, fullStream);

    let bestMask = 0;
    let bestScore = Infinity;
    let bestMatrix = null;

    for (let maskId = 0; maskId < 8; maskId++) {
      const candidate = cloneMatrix(base);
      applyMaskPattern(candidate, maskId);
      drawFormatInfo(candidate, maskId);
      drawVersionInfo(candidate, version);
      const penalty = evaluatePenalty(candidate);
      if (penalty < bestScore) {
        bestScore = penalty;
        bestMask = maskId;
        bestMatrix = candidate;
      }
    }

    return {
      version,
      mask: bestMask,
      size: N,
      modules: bestMatrix.modules
    };
  }

  function renderQRCodeToCanvas(canvas, urlText, pixelSize = 260) {
    const qr = encodeQRMatrix(urlText);
    const quiet = 4;
    const totalModules = qr.size + quiet * 2;
    const scale = Math.max(4, Math.floor(pixelSize / totalModules));
    const finalSize = totalModules * scale;

    canvas.width = finalSize;
    canvas.height = finalSize;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, finalSize, finalSize);

    ctx.fillStyle = '#090D16';
    for (let r = 0; r < qr.size; r++) {
      for (let c = 0; c < qr.size; c++) {
        if (qr.modules[r][c]) {
          ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
        }
      }
    }

    return qr;
  }

  global.OraculoQR = {
    encodeQRMatrix,
    renderQRCodeToCanvas
  };
})(window);
