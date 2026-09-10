/* global sketchup */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const labels = {
    lighting: 'ILUMINAÇÃO', weather: 'CLIMA', people: 'PESSOAS', vehicles: 'VEÍCULOS',
    vegetation: 'VEGETAÇÃO', fidelity: 'FIDELIDADE', materialCondition: 'CONDIÇÃO DOS MATERIAIS',
    aspectRatio: 'PROPORÇÃO', resolution: 'RESOLUÇÃO'
  };
  let catalog = null;
  let online = false;
  let busy = false;
  function enable() {
    $('settings').disabled = !catalog || busy;
    $('capture').disabled = !catalog || !online || busy;
  }
  function invalidate() {
    $('result').hidden = true;
    $('preview').removeAttribute('src');
    $('message').textContent = '';
    sketchup.invalidate_payload();
  }
  function scene(data) {
    $('scene-name').textContent = data.scene.name || 'Vista atual';
    $('viewport').textContent = `${data.viewport.width} × ${data.viewport.height}`;
    $('materials').textContent = data.model.materialCount;
    $('objects').textContent = data.model.objectCount;
    $('partial').textContent = (data.materials.length < data.model.materialCount || data.objects.length < data.model.objectCount)
      ? `Resumo limitado a ${data.materials.length} materiais e ${data.objects.length} objetos de primeiro nível.` : '';
  }
  window.ArchVizAI = {
    receive({ event, data }) {
      if (event === 'connecting') {
        online = false; catalog = null;
        $('health').textContent = 'Conectando ao ArchViz Engine…';
        $('connection-detail').textContent = '';
        invalidate();
      } else if (event === 'health') {
        online = data.online;
        $('health').textContent = online ? '● Engine online' : '● ArchViz Engine offline';
        $('health').className = online ? 'online' : 'offline';
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
        $('options').replaceChildren();
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
          container.append(select); $('options').append(container);
        });
      } else if (event === 'scene') {
        scene(data);
      } else if (event === 'captured') {
        busy = false; scene(data.scene);
        $('preview').src = data.image;
        $('result').hidden = false;
        const summary = data.scene;
        $('payload-summary').textContent = `Payload pronto para renderização. Imagem: ${summary.viewport.width} × ${summary.viewport.height}. Cena: ${summary.scene.name || 'Vista atual'}. Materiais: ${summary.model.materialCount}. Objetos: ${summary.model.objectCount}. Origin: sketchup.`;
        $('message').textContent = 'Cena capturada com sucesso.';
      } else if (event === 'error') {
        busy = false; $('message').textContent = data;
      }
      enable();
    }
  };
  $('retry').addEventListener('click', () => sketchup.retry_engine());
  $('refresh').addEventListener('click', () => { invalidate(); sketchup.refresh_scene(); });
  $('notes').addEventListener('input', invalidate);
  $('log').addEventListener('click', () => sketchup.log_scene());
  $('capture').addEventListener('click', () => {
    if (!catalog || !online || busy) return;
    invalidate(); busy = true; enable();
    $('message').textContent = 'Capturando a viewport atual…';
    const settings = { additionalInstructions: $('notes').value };
    document.querySelectorAll('#options select').forEach(select => { settings[select.name] = select.value; });
    sketchup.capture_scene(JSON.stringify(settings));
  });
  sketchup.ready();
})();
