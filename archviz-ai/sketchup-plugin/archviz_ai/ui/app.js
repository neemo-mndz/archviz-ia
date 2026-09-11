/* global sketchup */
(() => {
  'use strict';
  console.log('[ArchVizAI] app.js started');
  if (typeof sketchup !== 'undefined' && sketchup.js_stage) sketchup.js_stage('app.js started');
  window.onerror = function(msg, url, line, col, error) {
    sketchup.log_js_error(`Global Error: ${msg} at ${url}:${line}:${col}`);
  };
  window.onunhandledrejection = function(event) {
    sketchup.log_js_error(`Unhandled Promise: ${event.reason}`);
  };
  const $ = id => document.getElementById(id);
  const labels = {
    lighting: 'ILUMINAÇÃO', weather: 'CLIMA', people: 'PESSOAS', vehicles: 'VEÍCULOS',
    vegetation: 'VEGETAÇÃO', fidelity: 'FIDELIDADE', materialCondition: 'CONDIÇÃO DOS MATERIAIS',
    aspectRatio: 'PROPORÇÃO', resolution: 'RESOLUÇÃO'
  };
  let catalog = null;
  let online = false;
  let busy = false;
  let lastBase64Render = null;

  function enable() {
    settings.disabled = !catalog || busy;
    capture.disabled = !catalog || !online || busy;
    render.disabled = busy;
  }

  function invalidate() {
    result.hidden = true;
    $('render-result').hidden = true;
    preview.removeAttribute('src');
    $('geometry-preview').removeAttribute('src');
    $('geometry-preview').hidden = false;
    $('geometry-missing').hidden = true;
    $('solid-preview').removeAttribute('src');
    $('solid-preview').hidden = false;
    $('solid-missing').hidden = true;
    $('render-preview').removeAttribute('src');
    message.textContent = '';
    sketchup.invalidate_payload();
  }

  function scene(data) {
    $('scene-name').textContent = (data.scene && data.scene.name) || 'Vista atual';
    viewport.textContent = `${data.viewport.width} x ${data.viewport.height}`;
    materials.textContent = data.model.materialCount;
    objects.textContent = data.model.objectCount;
    partial.textContent = (data.materials.length < data.model.materialCount || data.objects.length < data.model.objectCount)
      ? `Resumo limitado a ${data.materials.length} materiais e ${data.objects.length} objetos de primeiro nivel.` : '';
  }

  function optionalPreview(imageId, missingId, dataUrl) {
    const image = $(imageId);
    const missing = $(missingId);
    if (dataUrl) {
      image.src = dataUrl;
      image.hidden = false;
      missing.hidden = true;
    } else {
      image.removeAttribute('src');
      image.hidden = true;
      missing.hidden = false;
    }
  }

  window.ArchVizAI = {
    receive({ event, data }) {
      console.log('[ArchVizAI] event received', event, data);
      if (event === 'connecting') {
        online = false; catalog = null;
        health.textContent = 'Conectando ao ArchViz Engine…';
        $('connection-detail').textContent = '';
        invalidate();
      } else if (event === 'health') {
        online = data.online;
        health.textContent = online ? '● Engine online' : '● ArchViz Engine offline';
        health.className = online ? 'online' : 'offline';
        if (!online) $('connection-detail').textContent = data.error || 'Inicie o engine e tente novamente.';
      } else if (event === 'catalog_error') {
        catalog = null;
        $('connection-detail').textContent = `Catálogo indisponível: ${data}`;
      } else if (event === 'catalog') {
        const keys = Object.keys(data.options);
        if (keys.length !== Object.keys(labels).length || keys.some(key => !Object.hasOwn(labels, key))) {
          $('connection-detail').textContent = 'Catálogo incompatível com esta versão da extensão.';
          catalog = null; enable(); return;
        }
        const previous = {};
        document.querySelectorAll('#options select').forEach(select => { previous[select.name] = select.value; });
        catalog = data;
        options.replaceChildren();
        Object.entries(labels).forEach(([key, label]) => {
          const container = document.createElement('label');
          container.textContent = label;
          const select = document.createElement('select');
          select.name = key;
          data.options[key].forEach(value => {
            const option = document.createElement('option'); option.value = value; option.textContent = value; select.append(option);
          });
          select.value = data.options[key].includes(previous[key]) ? previous[key] : data.defaults[key];
          select.addEventListener('change', invalidate);
          container.append(select); options.append(container);
        });
      } else if (event === 'scene') {
        scene(data);
      } else if (event === 'captured') {
        busy = false; scene(data.scene);
        preview.src = data.image;
        optionalPreview('geometry-preview', 'geometry-missing', data.geometryImage);
        optionalPreview('solid-preview', 'solid-missing', data.solidGeometryImage);
        result.hidden = false;
        $('render-result').hidden = true;
        const summary = data.scene;
        const sceneName = (summary.scene && summary.scene.name) || 'Vista atual';
        const facts = summary.geometryFacts || {};
        const faceText = Number.isFinite(facts.surfaceCount)
          ? ` Faces analisadas: ${facts.surfaceCount}. Com inner loops: ${facts.surfacesWithInnerLoops || 0}.`
          : '';
        $('payload-summary').textContent = `Payload pronto para renderizacao. Imagem: ${summary.viewport.width} x ${summary.viewport.height}. Cena: ${sceneName}. Materiais: ${summary.model.materialCount}. Objetos: ${summary.model.objectCount}.${faceText} Origin: sketchup.`;
        message.textContent = 'Cena capturada com sucesso.';
      } else if (event === 'error') {
        busy = false; message.textContent = data;
      } else if (event === 'render_status') {
        message.textContent = data.message;
      } else if (event === 'render_error') {
        busy = false;
        message.textContent = `Erro no render: ${data}`;
      } else if (event === 'render_complete') {
        busy = false;
        message.textContent = 'Renderização concluída.';
        $('render-preview').src = data.image;
        lastBase64Render = data.image;
        $('render-result').hidden = false;
        // Scroll para o resultado
        $('render-result').scrollIntoView({ behavior: 'smooth' });
      }
      enable();
    }
  };
  console.log('[ArchVizAI] app.js: window.ArchVizAI created');
  if (typeof sketchup !== 'undefined' && sketchup.js_stage) sketchup.js_stage('window.ArchVizAI created');

  retry.addEventListener('click', () => sketchup.retry_engine());
  refresh.addEventListener('click', () => { invalidate(); sketchup.refresh_scene(); });
  notes.addEventListener('input', invalidate);
  log.addEventListener('click', () => sketchup.log_scene());
  capture.addEventListener('click', () => {
    if (!catalog || !online || busy) return;
    invalidate(); busy = true; enable();
    message.textContent = 'Capturando a viewport atual…';
    const settings = { additionalInstructions: notes.value };
    document.querySelectorAll('#options select').forEach(select => { settings[select.name] = select.value; });
    sketchup.capture_scene(JSON.stringify(settings));
  });
  
  render.addEventListener('click', () => {
    if (busy) return;
    busy = true; enable();
    message.textContent = 'Iniciando render...';
    sketchup.render_scene();
  });

  $('save-image').addEventListener('click', () => {
    if (lastBase64Render) sketchup.save_image(lastBase64Render);
  });

  $('open-image').addEventListener('click', () => {
    if (lastBase64Render) sketchup.open_image(lastBase64Render);
  });

  console.log('[ArchVizAI] app.js: calling sketchup.ready()');
  if (typeof sketchup !== 'undefined' && sketchup.js_stage) sketchup.js_stage('calling sketchup.ready()');
  sketchup.ready();
})();
