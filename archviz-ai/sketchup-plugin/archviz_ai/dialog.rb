# frozen_string_literal: true
require_relative 'api_client'
require_relative 'scene_capture'

module ArchVizAI
  class Dialog
    attr_reader :last_payload, :catalog

    def show
      if @dialog && @dialog.visible?
        @dialog.bring_to_front
        return
      end
      @dialog = UI::HtmlDialog.new(dialog_title: 'ArchViz AI', preferences_key: 'ArchVizAI.Dialog',
                                   scrollable: true, resizable: true, width: 660, height: 850,
                                   min_width: 420, min_height: 500, style: UI::HtmlDialog::STYLE_DIALOG)
      @dialog.add_action_callback('ready') { |_context| refresh_scene; connect }
      @dialog.add_action_callback('retry_engine') { |_context| connect }
      @dialog.add_action_callback('refresh_scene') { |_context| @last_payload = nil; refresh_scene }
      @dialog.add_action_callback('capture_scene') { |_context, settings| capture(settings) }
      @dialog.add_action_callback('render_scene') { |_context| render_job }
      @dialog.add_action_callback('invalidate_payload') { |_context| @last_payload = nil }
      @dialog.add_action_callback('log_scene') { |_context| log_scene }
      @dialog.add_action_callback('save_image') { |_context, base64| save_image(base64) }
      @dialog.add_action_callback('open_image') { |_context, base64| open_image(base64) }
      @dialog.set_on_closed do
        stop_polling
        @client&.close
        @dialog = nil
        @catalog = nil
        @last_payload = nil
        @job_id = nil
        @generation = (@generation || 0) + 1
      end
      @dialog.set_file(File.join(__dir__, 'ui', 'index.html'))
      @dialog.show
      ArchVizAI.log('dialog opened')
    end

    def emit(event, data)
      return unless @dialog

      json = JSON.generate({ event: event, data: data }).gsub('<', '\u003c').gsub('>', '\u003e')
      @dialog.execute_script("window.ArchVizAI.receive(#{json})")
    end

    def refresh_scene
      emit('scene', SceneReader.read)
    rescue StandardError => error
      emit('error', error.message)
    end

    def connect
      @generation = (@generation || 0) + 1
      generation = @generation
      stop_polling
      @client&.close
      @catalog = nil
      @last_payload = nil
      @job_id = nil
      emit('connecting', {})
      @client = ApiClient.new
      @client.get(:health) do |data, error|
        next unless generation == @generation && @dialog

        online = !data.nil?
        ArchVizAI.log(online ? 'engine online' : 'engine offline')
        emit('health', { online: online, error: error })
      end
      @client.get(:options) do |data, error|
        next unless generation == @generation && @dialog

        if error
          emit('catalog_error', error)
          next
        end
        begin
          validate_catalog(data)
          @catalog = data
          emit('catalog', data)
        rescue StandardError => problem
          emit('catalog_error', problem.message)
        end
      end
    rescue StandardError => error
      emit('health', { online: false, error: error.message })
    end

    def validate_catalog(data)
      raise 'Contrato de opções incompatível.' unless data['contractVersion'] == '1.0'
      options, defaults = data.values_at('options', 'defaults')
      raise 'Catálogo inválido.' unless options.is_a?(Hash) && defaults.is_a?(Hash) && options.length == 9

      options.each do |key, values|
        unless values.is_a?(Array) && !values.empty? && values.all? { |v| v.is_a?(String) } && values.include?(defaults[key])
          raise 'Opções do engine inválidas.'
        end
      end
      raise 'Observações padrão inválidas.' unless defaults['additionalInstructions'].is_a?(String)
    end

    def capture(settings_json)
      @last_payload = nil
      raise 'Conecte ao engine para carregar as opções antes de capturar.' unless @catalog

      settings = JSON.parse(settings_json)
      raise 'Configurações inválidas.' unless settings.is_a?(Hash)

      fields = {}
      @catalog.fetch('options').each do |key, values|
        raise "Configuração inválida: #{key}" unless values.include?(settings[key])

        fields[key] = settings[key]
      end
      notes = settings['additionalInstructions']
      raise 'Observações devem conter até 4000 caracteres.' unless notes.is_a?(String) && notes.encode('UTF-16LE').bytesize <= 8000

      fields['additionalInstructions'] = notes
      capture = SceneCapture.capture
      @last_payload = {
        image: { bytes: capture[:image], filename: 'scene.png', content_type: 'image/png' },
        fields: fields.merge('origin' => 'sketchup', 'scene' => JSON.generate(capture[:scene]))
      }
      emit('captured', { scene: capture[:scene], image: "data:image/png;base64,#{Base64.strict_encode64(capture[:image])}", bytes: capture[:image].bytesize })
    rescue StandardError => error
      emit('error', error.message)
    end

    def render_job
      raise 'Nenhum payload capturado.' unless @last_payload
      emit('render_status', { status: 'submitting', message: 'Enviando...' })
      @client.post_render(@last_payload) do |data, error|
        next unless @dialog
        if error
          emit('render_error', error)
        else
          @job_id = data['jobId']
          start_polling
        end
      end
    rescue StandardError => error
      emit('render_error', error.message)
    end

    def start_polling
      return unless @job_id
      @polling_fails = 0
      emit('render_status', { status: 'pending', message: 'Na fila...' })
      @polling_timer = UI.start_timer(3, true) do
        check_job_status
      end
    end

    def check_job_status
      @client.get_job_status(@job_id) do |data, error|
        next unless @dialog
        if error
          ArchVizAI.log("Falha temporária no polling: #{error}")
          @polling_fails ||= 0
          @polling_fails += 1
          if @polling_fails > 10
            stop_polling
            emit('render_error', 'Falha prolongada ao verificar status do render.')
          end
          next
        end

        @polling_fails = 0
        status = data['status']
        if status == 'pending'
          emit('render_status', { status: 'pending', message: 'Na fila...' })
        elsif status == 'processing'
          emit('render_status', { status: 'processing', message: 'Processando render...' })
        elsif status == 'completed'
          stop_polling
          emit('render_status', { status: 'completed', message: 'Render concluído. Baixando resultado...' })
          download_result
        elsif status == 'failed'
          stop_polling
          emit('render_error', data['error'] || 'Falha ao renderizar.')
        end
      end
    end

    def download_result
      @client.get_result(@job_id) do |image_bytes, error|
        next unless @dialog
        if error
          emit('render_error', "Erro ao baixar resultado: #{error}")
        else
          base64 = Base64.strict_encode64(image_bytes)
          emit('render_complete', { image: "data:image/png;base64,#{base64}" })
        end
      end
    end

    def stop_polling
      if @polling_timer
        UI.stop_timer(@polling_timer)
        @polling_timer = nil
      end
    end

    def log_scene
      return unless @last_payload

      json = @last_payload[:fields]['scene']
      if json.bytesize <= 12_000
        ArchVizAI.log("scene JSON: #{json}")
      else
        ArchVizAI.log('scene JSON > 12 KB; inspecione ArchVizAI.controller.last_payload[:fields]["scene"] no Ruby Console. Dump automático omitido.')
      end
    end

    def save_image(base64_data)
      path = UI.savepanel('Salvar Render', '', 'render.png')
      return unless path
      
      parts = base64_data.split(',')
      bytes = Base64.decode64(parts.last)
      File.binwrite(path, bytes)
    rescue StandardError => e
      ArchVizAI.log("Erro ao salvar: #{e.message}")
    end

    def open_image(base64_data)
      require 'tempfile'
      file = Tempfile.new(['render_preview', '.png'])
      parts = base64_data.split(',')
      file.binmode
      file.write(Base64.decode64(parts.last))
      file.close
      UI.openURL("file:///#{file.path}")
    rescue StandardError => e
      ArchVizAI.log("Erro ao abrir imagem: #{e.message}")
    end
  end

  def self.controller
    @controller
  end
end