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

    def post_render(payload, &callback)
      boundary = "----RubyMultipartClient#{rand(1000000)}"
      body = []
      payload[:fields].each do |k, v|
        body << "--#{boundary}\r\nContent-Disposition: form-data; name=\"#{k}\"\r\n\r\n#{v}\r\n"
      end
      img = payload[:image]
      body << "--#{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"#{img[:filename]}\"\r\nContent-Type: #{img[:content_type]}\r\n\r\n#{img[:bytes]}\r\n"
      body << "--#{boundary}--\r\n"

      request = Sketchup::Http::Request.new(@url + '/api/render', Sketchup::Http::POST)
      request.headers = { 'Content-Type' => "multipart/form-data; boundary=#{boundary}" }
      request.body = body.join
      
      entry = { request: request }
      @requests[request.object_id] = entry
      finish = lambda do |data, error|
        next unless @requests.delete(request.object_id)
        UI.stop_timer(entry[:timer]) if entry[:timer]
        callback.call(data, error)
      end
      entry[:timer] = UI.start_timer(30, false) do
        request.cancel
        finish.call(nil, 'Tempo limite excedido ao enviar render.')
      end
      started = request.start do |_req, response|
        begin
          raise 'Engine offline ou sem resposta.' unless response
          data = JSON.parse(response.body.dup.force_encoding('UTF-8'))
          if response.status_code == 200 || data['success']
            finish.call(data, nil)
          else
            finish.call(nil, data['error'] || "Engine retornou erro #{response.status_code}.")
          end
        rescue StandardError => error
          finish.call(nil, error.message)
        end
      end
      finish.call(nil, 'Falha ao iniciar envio.') unless started
    rescue StandardError => error
      if defined?(finish) && finish
        finish.call(nil, error.message)
      else
        callback.call(nil, error.message)
      end
    end

    def get_job_status(job_id, &callback)
      request = Sketchup::Http::Request.new(@url + "/api/render/#{job_id}", Sketchup::Http::GET)
      entry = { request: request }
      @requests[request.object_id] = entry
      finish = lambda do |data, error|
        next unless @requests.delete(request.object_id)
        UI.stop_timer(entry[:timer]) if entry[:timer]
        callback.call(data, error)
      end
      entry[:timer] = UI.start_timer(10, false) do
        request.cancel
        finish.call(nil, 'Tempo excedido ao verificar status.')
      end
      started = request.start do |_req, response|
        begin
          raise 'Sem resposta' unless response
          data = JSON.parse(response.body.dup.force_encoding('UTF-8'))
          if response.status_code == 200 || data['success']
            finish.call(data, nil)
          else
            finish.call(nil, data['error'] || "HTTP #{response.status_code}")
          end
        rescue StandardError => error
          finish.call(nil, error.message)
        end
      end
      finish.call(nil, 'Falha ao iniciar verificação.') unless started
    rescue StandardError => error
      if defined?(finish) && finish
        finish.call(nil, error.message)
      else
        callback.call(nil, error.message)
      end
    end

    def get_result(job_id, &callback)
      request = Sketchup::Http::Request.new(@url + "/api/render/#{job_id}/result", Sketchup::Http::GET)
      entry = { request: request }
      @requests[request.object_id] = entry
      finish = lambda do |data, error|
        next unless @requests.delete(request.object_id)
        UI.stop_timer(entry[:timer]) if entry[:timer]
        callback.call(data, error)
      end
      entry[:timer] = UI.start_timer(30, false) do
        request.cancel
        finish.call(nil, 'Tempo excedido ao baixar resultado.')
      end
      started = request.start do |_req, response|
        begin
          raise 'Sem resposta' unless response
          if response.status_code == 200
            finish.call(response.body, nil)
          else
            finish.call(nil, "HTTP #{response.status_code}")
          end
        rescue StandardError => error
          finish.call(nil, error.message)
        end
      end
      finish.call(nil, 'Falha ao iniciar download.') unless started
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