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
      @dialog.add_action_callback('invalidate_payload') { |_context| @last_payload = nil }
      @dialog.add_action_callback('log_scene') { |_context| log_scene }
      @dialog.set_on_closed do
        @client&.close
        @dialog = nil
        @catalog = nil
        @last_payload = nil
        @generation = (@generation || 0) + 1
      end
      @dialog.set_file(File.join(__dir__, 'ui', 'index.html'))
      @dialog.show
      ArchVizAI.log('dialog opened')
    end

    def emit(event, data)
      return unless @dialog

      json = JSON.generate({ event: event, data: data }).gsub('<', '\\u003c').gsub('>', '\\u003e')
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
      @client&.close
      @catalog = nil
      @last_payload = nil
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
      # Exact multipart parts for Phase 3, held in Ruby memory only. No POST exists here.
      @last_payload = {
        image: { bytes: capture[:image], filename: 'scene.png', content_type: 'image/png' },
        fields: fields.merge('origin' => 'sketchup', 'scene' => JSON.generate(capture[:scene]))
      }
      emit('captured', { scene: capture[:scene], image: "data:image/png;base64,#{Base64.strict_encode64(capture[:image])}", bytes: capture[:image].bytesize })
    rescue StandardError => error
      emit('error', error.message)
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
  end

  def self.controller
    @controller
  end
end
