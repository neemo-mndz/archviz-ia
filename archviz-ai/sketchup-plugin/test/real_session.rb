# frozen_string_literal: true
# Explicit developer harness, launched with -RubyStartup. Never loaded by the extension.
# Commands are fixed test actions; no eval, render POST, or changes to a saved user model.
require 'json'
require 'fileutils'

module ArchVizAIPhase2Test
  OUTPUT = ENV.fetch('ARCHVIZ_TEST_OUTPUT')
  FileUtils.mkdir_p(OUTPUT)
  @seen = nil

  def self.write(name, value)
    File.write(File.join(OUTPUT, name), JSON.pretty_generate(value))
  end

  def self.snapshot
    model = Sketchup.active_model
    {
      camera: ArchVizAI::SceneReader.camera(model.active_view),
      modified: model.modified?, entity_count: model.entities.length,
      selection: model.selection.map(&:entityID),
      page: model.pages.selected_page&.name,
      style: model.styles.selected_style.name
    }
  end

  def self.probe
    dialog = ArchVizAI.controller.instance_variable_get(:@dialog)
    # Use an already bound bridge name: callbacks added after page load aren't
    # exposed to JS in all HtmlDialog versions. Restore the production handler.
    dialog.add_action_callback('log_scene') do |_ctx, data|
      write('ui.json', JSON.parse(data))
      dialog.add_action_callback('log_scene') { |_context| ArchVizAI.controller.log_scene }
    end
    dialog.execute_script(<<~JS)
      sketchup.log_scene(JSON.stringify({
        title: document.title,
        health: document.getElementById('health').textContent,
        detail: document.getElementById('connection-detail').textContent,
        scene: document.getElementById('scene-name').textContent,
        viewport: document.getElementById('viewport').textContent,
        selects: document.querySelectorAll('select').length,
        captureDisabled: document.getElementById('capture').disabled,
        message: document.getElementById('message').textContent,
        previewWidth: document.getElementById('preview').naturalWidth,
        previewHeight: document.getElementById('preview').naturalHeight,
        payloadSummary: document.getElementById('payload-summary').textContent
      }));
    JS
  end

  def self.dispatch(command)
    case command.fetch('action')
    when 'open'
      @original_url ||= Sketchup.read_default('ArchVizAI', 'engine_url', ArchVizAI::Config::DEFAULT_URL)
      Sketchup.write_default('ArchVizAI', 'engine_url', command.fetch('url', 'http://127.0.0.1:3001'))
      ArchVizAI.show_dialog
    when 'synthetic'
      model = Sketchup.active_model
      raise 'Synthetic tests require an unsaved document.' unless model.path.empty?

      @synthetic = true
      group = model.entities.add_group
      group.name = 'FACHADA_ACM'
      material = model.materials.add('ACM vermelho')
      material.color = Sketchup::Color.new(180, 30, 36)
      group.material = material
      face = group.entities.add_face([0, 0, 0], [100, 0, 0], [100, 100, 0], [0, 100, 0])
      face.pushpull(120)
      model.active_view.camera = Sketchup::Camera.new([300, -500, 250], [50, 50, 60], [0, 0, 1], true, 47.2)
      model.active_view.refresh
      write('synthetic.json', { ok: true, page: model.pages.selected_page&.name })
    when 'parallel', 'move_camera'
      raise 'Camera test only allowed in synthetic unsaved document.' unless @synthetic && Sketchup.active_model.path.empty?

      model = Sketchup.active_model
      model.active_view.camera = Sketchup::Camera.new([-300, -400, 200], [50, 50, 60], [0, 0, 1], command['action'] != 'parallel', 47.2)
      model.active_view.refresh
    when 'capture'
      @before = snapshot
      @case = command.fetch('case', 'capture').gsub(/[^a-z0-9_-]/i, '')
      ArchVizAI.controller.instance_variable_get(:@dialog).execute_script("document.getElementById('capture').click()")
      UI.start_timer(4, false) do
        begin
          payload = ArchVizAI.controller.last_payload
          raise 'No prepared payload' unless payload

          data = JSON.parse(payload[:fields]['scene'])
          write("#{@case}-scene.json", data)
          File.binwrite(File.join(OUTPUT, "#{@case}.png"), payload[:image][:bytes])
          after = snapshot
          write("#{@case}-result.json", { unchanged: @before == after, before: @before, after: after,
                                         image_bytes: payload[:image][:bytes].bytesize, viewport: data['viewport'],
                                         fields: payload[:fields].keys, mime: payload[:image][:content_type] })
          probe
        rescue StandardError => error
          write('error.json', { message: error.message, backtrace: error.backtrace.first(6) })
        end
      end
    when 'engine'
      Sketchup.write_default('ArchVizAI', 'engine_url', command.fetch('url'))
      ArchVizAI.controller.connect
    when 'probe'
      probe
    when 'checks'
      require_relative 'ruby_checks'
      write('ruby-checks.json', ArchVizAIPhase2Checks.run)
    when 'close'
      ArchVizAI.controller.instance_variable_get(:@dialog).close
    when 'restore_config'
      Sketchup.write_default('ArchVizAI', 'engine_url', @original_url || ArchVizAI::Config::DEFAULT_URL)
    else
      raise 'Unknown test action'
    end
  end

  UI.start_timer(2, true) do
    begin
      unless @started
        write('runtime.json', { sketchup: Sketchup.version, ruby: RUBY_VERSION, platform: RUBY_PLATFORM,
                                chromium: UI::HtmlDialog::CHROME_VERSION, cef: UI::HtmlDialog::CEF_VERSION })
        @started = true
      end
      command_path = File.join(OUTPUT, 'command.json')
      next unless File.file?(command_path)

      command = JSON.parse(File.read(command_path))
      next if command['id'] == @seen

      @seen = command['id']
      dispatch(command)
      write('last-action.json', { id: @seen, action: command['action'], ok: true })
    rescue StandardError, LoadError => error
      write('error.json', { message: error.message, backtrace: error.backtrace.first(6) })
    end
  end
end
