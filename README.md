# Oráculo Ciber-Filosófico

Aplicación Web Progresiva (PWA) sin dependencias ni paso de compilación (*build*) que genera tarjetas inspiradoras en alta resolución (`4:5` y `9:16`) combinando sabiduría ancestral (Estoicismo, Kybalion, Numerología e Historia/Arquetipos), contexto web en vivo y fondos aleatorios de naturaleza.

## Características principales

- **Motor gráfico HTML5 Canvas (`js/canvas-engine.js`):** Renderizado HD (`1080×1350` y `1080×1920`) con fotografía a pantalla completa, velo de legibilidad, tipografía de esperanza y respaldo ilustrado offline (`drawProceduralNatureLandscape`).
- **Modo Efeméride Mundial (`js/web-pulse.js` + `js/gemini-service.js`):** Alterna entre mensajes de apoyo/conciencia y **Efemérides & Días Internacionales reales de la fecha** obtenidos desde Wikipedia/Wikimedia (con imagen temática o paisaje natural aleatorio).
- **Paisajes naturales aleatorios (`js/nature-service.js`):** Selección aleatoria de fotografías de naturaleza desde Wikimedia Commons con verificación CORS para descarga directa en PNG HD.
- **Pulso Web en Vivo (`js/web-pulse.js` + `api/web-pulse.js`):** Conexión opcional a Wikipedia/Wikiquote y Google Search (vía Gemini) para nutrir los mensajes con contexto actual.
- **Generación con Google Gemini (`js/gemini-service.js`):** Compatible con API Key ingresada por el usuario desde el modal de configuración (guardada localmente en `localStorage`, nunca en el código fuente) y con modo local offline (`data/sabiduria.js`).
- **PWA Instalable (`manifest.json`, `sw.js`, `vercel.json`):** Funciona tanto en Vercel / servidor local HTTP como abriendo `index.html` directamente (`file://`).

## Estructura del proyecto

```text
├── index.html             # Interfaz principal y carga secuencial de scripts
├── manifest.json          # Metadatos PWA
├── sw.js                  # Service Worker para caché offline
├── vercel.json            # Cabeceras para /sw.js y /manifest.json en Vercel
├── iniciar-local.bat      # Servidor local rápido con Python en http://localhost:8080
├── api/
│   └── web-pulse.js       # Función serverless de respaldo para Vercel
├── data/
│   ├── sabiduria.js       # Base filosófica para uso directo (incluyendo file://)
│   └── sabiduria.json     # Base filosófica en JSON
├── icons/
│   ├── icon.svg
│   ├── icon-192.png
│   └── icon-512.png
└── js/
    ├── app.js             # Controlador principal, historial y exportación PNG
    ├── canvas-engine.js   # Renderizado HD en Canvas
    ├── gemini-service.js  # Integración con Gemini API y modo local
    ├── nature-service.js  # Paisajes aleatorios de naturaleza (Wikimedia Commons)
    ├── qr-generator.js    # Generador QR offline para instalar la PWA en móvil
    └── web-pulse.js       # Contexto web en vivo
```

## Uso rápido

- **Directo en navegador:** Abre `index.html`.
- **Servidor local (Windows):** Ejecuta `iniciar-local.bat` o `python -m http.server 8080`.
- **Publicación web:** Compatible con **GitHub Pages** (sitio estático directo desde la rama principal) y **Vercel** (incluye `/api/web-pulse` y cabeceras PWA en `vercel.json`).
