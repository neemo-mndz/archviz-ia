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
      ArchVizAI.log("HTTP: GET #{ROUTES.fetch(kind)} START")
      route = ROUTES.fetch(kind)
      request = Sketchup::Http::Request.new(@url + route, Sketchup::Http::GET)
      ArchVizAI.log("HTTP: request object_id=#{request.object_id}")
      entry = { request: request }
      @requests[request.object_id] = entry
      finish = lambda do |data, error|
        ArchVizAI.log("HTTP: callback received")
        next unless @requests.delete(request.object_id)
        UI.stop_timer(entry[:timer]) if entry[:timer]
        ArchVizAI.log("HTTP: finish success") if data
        callback.call(data, error)
      end
      entry[:timer] = UI.start_timer(10, false) do
        request.cancel
        ArchVizAI.log("HTTP: timer expired")
        finish.call(nil, 'ArchViz Engine offline: tempo de conexão excedido.')
      end
      started = request.start do |_req, response|
        begin
          ArchVizAI.log("HTTP: response block start")
          raise 'ArchViz Engine offline ou resposta indisponível.' unless response
          ArchVizAI.log("HTTP: status=#{response.status_code}")
          raise "Engine retornou HTTP #{response.status_code}." unless response.status_code == 200
          ArchVizAI.log("HTTP: body_bytes=#{response.body.bytesize}")
          raise 'Resposta do engine excede 1 MiB.' if response.body.bytesize > Config::MAX_SCENE_BYTES
          data = JSON.parse(response.body.dup.force_encoding('UTF-8'))
          ArchVizAI.log("HTTP: JSON parsed successfully")
          raise 'Resposta inválida do engine.' unless data.is_a?(Hash) && data['success'] == true
          finish.call(data, nil)
        rescue StandardError => error
          ArchVizAI.log("HTTP ERROR\nroute=#{route}\nclass=#{error.class}\nmessage=#{error.message}\nbacktrace=\n#{error.backtrace.first(10).join("\n")}")
          finish.call(nil, error.message)
        end
      end
      ArchVizAI.log("HTTP: request.start returned=#{started}")
      finish.call(nil, 'Não foi possível iniciar a conexão com o engine.') unless started
    rescue StandardError => error
      ArchVizAI.log("HTTP ERROR\nroute=#{route}\nclass=#{error.class}\nmessage=#{error.message}\nbacktrace=\n#{error.backtrace.first(10).join("\n")}")
      if defined?(finish) && finish
        finish.call(nil, error.message)
      else
        callback.call(nil, error.message)
      end
    end

    def post_render(payload, &callback)
      ArchVizAI.log("POST: /api/render START")
      boundary = "----RubyMultipartClient#{rand(1000000)}"
      body = String.new(encoding: Encoding::BINARY)
      
      payload[:fields].each do |k, v|
        body << "--#{boundary}\r\n".b
        body << "Content-Disposition: form-data; name=\"#{k}\"\r\n\r\n".b
        text = v.to_s.encode(Encoding::UTF_8, invalid: :replace, undef: :replace)
        body << text.b
        body << "\r\n".b
      end
      
      img = payload[:image]
      body << "--#{boundary}\r\n".b
      body << "Content-Disposition: form-data; name=\"image\"; filename=\"#{img[:filename]}\"\r\n".b
      body << "Content-Type: #{img[:content_type]}\r\n\r\n".b
      body << img[:bytes].b
      body << "\r\n".b
      geometry = payload[:geometry]
      if geometry
        body << "--#{boundary}\r\n".b
        body << "Content-Disposition: form-data; name=\"geometry\"; filename=\"#{geometry[:filename]}\"\r\n".b
        body << "Content-Type: #{geometry[:content_type]}\r\n\r\n".b
        body << geometry[:bytes].b
        body << "\r\n".b
      end
      solid_geometry = payload[:solid_geometry]
      if solid_geometry
        body << "--#{boundary}\r\n".b
        body << "Content-Disposition: form-data; name=\"solidGeometry\"; filename=\"#{solid_geometry[:filename]}\"\r\n".b
        body << "Content-Type: #{solid_geometry[:content_type]}\r\n\r\n".b
        body << solid_geometry[:bytes].b
        body << "\r\n".b
      end
      depth = payload[:depth]
      if depth
        body << "--#{boundary}\r\n".b
        body << "Content-Disposition: form-data; name=\"depth\"; filename=\"#{depth[:filename]}\"\r\n".b
        body << "Content-Type: #{depth[:content_type]}\r\n\r\n".b
        body << depth[:bytes].b
        body << "\r\n".b
      end
      body << "--#{boundary}--\r\n".b

      scene_bytes = payload[:fields] && payload[:fields]['scene'] ? payload[:fields]['scene'].bytesize : 0
      img_bytes = img && img[:bytes] ? img[:bytes].bytesize : 0
      geometry_bytes = geometry && geometry[:bytes] ? geometry[:bytes].bytesize : 0
      solid_geometry_bytes = solid_geometry && solid_geometry[:bytes] ? solid_geometry[:bytes].bytesize : 0
      depth_bytes = depth && depth[:bytes] ? depth[:bytes].bytesize : 0
      ArchVizAI.log("POST: multipart bytes=#{body.bytesize}")
      ArchVizAI.log("POST: image bytes=#{img_bytes}")
      ArchVizAI.log("POST: geometry bytes=#{geometry_bytes}")
      ArchVizAI.log("POST: solid geometry bytes=#{solid_geometry_bytes}")
      ArchVizAI.log("POST: depth bytes=#{depth_bytes}")
      ArchVizAI.log("POST: scene bytes=#{scene_bytes}")

      request = Sketchup::Http::Request.new(@url + '/api/render', Sketchup::Http::POST)
      request.headers = { 'Content-Type' => "multipart/form-data; boundary=#{boundary}" }
      request.body = body
      
      entry = { request: request }
      @requests[request.object_id] = entry
      finish = lambda do |data, error|
        ArchVizAI.log("POST: callback received")
        next unless @requests.delete(request.object_id)
        UI.stop_timer(entry[:timer]) if entry[:timer]
        callback.call(data, error)
      end
      entry[:timer] = UI.start_timer(30, false) do
        request.cancel
        ArchVizAI.log("POST: timer expired")
        finish.call(nil, 'Tempo limite excedido ao enviar render.')
      end
      started = request.start do |_req, response|
        begin
          raise 'Engine offline ou sem resposta.' unless response
          ArchVizAI.log("POST: HTTP status=#{response.status_code}")
          resp_body = response.body ? response.body.dup.force_encoding('UTF-8') : ''
          truncated_body = resp_body.bytesize > 2048 ? "#{resp_body[0...2048]}... (truncated)" : resp_body
          ArchVizAI.log("POST: response body=#{truncated_body}")
          data = JSON.parse(resp_body)
          if response.status_code == 200 || data['success']
            finish.call(data, nil)
          else
            finish.call(nil, data['error'] || "Engine retornou erro #{response.status_code}.")
          end
        rescue StandardError => error
          ArchVizAI.log("POST ERROR\nclass=#{error.class}\nmessage=#{error.message}\nbacktrace=\n#{error.backtrace ? error.backtrace.first(10).join("\n") : 'none'}")
          finish.call(nil, error.message)
        end
      end
      ArchVizAI.log("POST: request.start returned=#{started}")
      finish.call(nil, 'Falha ao iniciar envio.') unless started
    rescue StandardError => error
      ArchVizAI.log("POST ERROR\nclass=#{error.class}\nmessage=#{error.message}\nbacktrace=\n#{error.backtrace ? error.backtrace.first(10).join("\n") : 'none'}")
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
