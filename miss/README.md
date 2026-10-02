# Sosiego · estudia con calma

Una app de estudio que corre **en tu computadora** con [Gemma](https://ai.google.dev/gemma) a través de [Ollama](https://ollama.com). Lee tus PDFs, los divide en secciones y te ayuda a aprender de forma progresiva:

- **Resumen** de cada sección con ejemplos cotidianos.
- **Tarjetas de repaso** con repetición espaciada (cajas de Leitner).
- **Quiz** de 5 preguntas por sección; al superarlo (60 %) la sección queda "dominada".
- **Preguntar** a tu material: busca los fragmentos relevantes y Gemma responde con ellos.
- **Temporizador de concentración** (25/30/45/50 min) que te pide una intención al empezar y te pregunta si la lograste al terminar.
- **Racha y XP** para mantener el hábito.
- Diseño de contraste moderado, colores apagados y tema claro/oscuro para no cansar la vista.

Todo se guarda en el `localStorage` de tu navegador. No hay servidor ni cuentas.

## Requisitos

1. [Ollama](https://ollama.com/download) instalado y abierto.
2. Un modelo Gemma:
   ```bash
   ollama pull gemma3:4b
   ```
   Si tu compu tiene poca RAM usa `gemma3:1b`; si tiene bastante, `gemma3:12b` da mejores resultados.
3. Un navegador moderno (Chrome, Edge, Firefox, Safari).
4. Internet la primera vez, para cargar la tipografía y pdf.js desde una CDN.

## Cómo ejecutarlo

No hay paso de compilación. Desde esta carpeta:

```bash
python -m http.server 8000
```

y abre <http://localhost:8000>. (También sirve `npx serve`.) No abras `index.html` con doble clic: los módulos JS necesitan un servidor.

Arriba a la derecha verás un punto verde cuando Ollama esté conectado. Si está rojo, abre Ollama y pulsa **Reconectar**.

## Estructura

```
index.html        interfaz
css/styles.css    diseño y temas
js/app.js         pestañas, documento, resumen, preguntar
js/timer.js       temporizador de concentración
js/study.js       tarjetas y quiz
js/llm.js         cliente de Ollama (chat en streaming y JSON estructurado)
js/docs.js        lectura de PDF, secciones y búsqueda de fragmentos
js/store.js       progreso guardado en localStorage
js/util.js        utilidades (markdown seguro, avisos)
```

## Subirlo a GitHub

```bash
git init
git add .
git commit -m "Primera versión de Sosiego"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/sosiego.git
git push -u origin main
```

### Que otras personas lo usen

Cada persona necesita **su propio Ollama con Gemma** (la IA corre en su computadora, no en la tuya). Lo más simple es que clonen el repo y sigan los pasos de arriba.

Si quieres publicarlo con GitHub Pages, el navegador de quien lo abra intentará conectarse a *su* Ollama local, y Ollama debe permitir ese origen:

```bash
# macOS / Linux
OLLAMA_ORIGINS="https://TU_USUARIO.github.io" ollama serve
```

En Windows define la variable de entorno `OLLAMA_ORIGINS` y reinicia Ollama. Algunos navegadores piden permiso para conectar con `localhost` desde una página https.

## Limitaciones actuales

- Los PDFs escaneados (solo imagen) no se pueden leer todavía; Gemma 3 entiende imágenes y se podría añadir lectura por página.
- La búsqueda dentro del documento usa coincidencia de palabras (TF-IDF), no embeddings.
- No busca en internet: un navegador no puede consultar buscadores directamente (CORS), así que necesita un pequeño servidor intermedio.

## Próximos pasos

1. Detector de somnolencia con cámara (MediaPipe, todo en el navegador).
2. Búsqueda web para traer ejemplos extra (mini-servidor local con Tavily o DuckDuckGo).
3. Modo Feynman: explicas el concepto con tus palabras y Gemma te corrige.
4. Mapa de progreso por tema y más retos.
5. Instalable como PWA.

## Licencia

MIT
