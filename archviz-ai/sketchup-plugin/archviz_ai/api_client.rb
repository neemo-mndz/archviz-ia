# frozen_string_literal: true
require 'json'
require_relative 'config'

module ArchVizAI
  class ApiClient
    ROUTES = { health: '/api/health', options: '/api/render/options' }.freeze

    def initialize(url = Config.engine_url)
      @url = Config.validate_url(url)
      @requests = {}
    end

    # Phase 2 intentionally exposes GET diagnostics only. No render endpoint.
    def get(kind, &callback)
      route = ROUTES.fetch(kind)
      request = Sketchup::Http::Request.new(@url + route, Sketchup::Http::GET)
      entry = { request: request }
      @requests[request.object_id] = entry
      finish = lambda do |data, error|
        next unless @requests.delete(request.object_id)

        UI.stop_timer(entry[:timer]) if entry[:timer]
        callback.call(data, error)
      end
      entry[:timer] = UI.start_timer(10, false) do
        request.cancel
        finish.call(nil, 'ArchViz Engine offline: tempo de conexão excedido.')
      end
      started = request.start do |_req, response|
        # Do not call cancel from a response callback (SketchUp API restriction).
        begin
          raise 'ArchViz Engine offline ou resposta indisponível.' unless response
          raise "Engine retornou HTTP #{response.status_code}." unless response.status_code == 200
          raise 'Resposta do engine excede 1 MiB.' if response.body.bytesize > Config::MAX_SCENE_BYTES

          data = JSON.parse(response.body.dup.force_encoding('UTF-8'))
          raise 'Resposta inválida do engine.' unless data.is_a?(Hash) && data['success'] == true

          finish.call(data, nil)
        rescue StandardError => error
          finish.call(nil, error.message)
        end
      end
      finish.call(nil, 'Não foi possível iniciar a conexão com o engine.') unless started
    rescue StandardError => error
      if defined?(finish) && finish
        finish.call(nil, error.message)
      else
        callback.call(nil, error.message)
      end
    end

    def close
      entries = @requests.values
      @requests.clear
      entries.each do |entry|
        UI.stop_timer(entry[:timer]) if entry[:timer]
        entry[:request].cancel
      end
    end
  end
end
