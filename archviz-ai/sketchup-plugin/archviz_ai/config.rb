# frozen_string_literal: true
require 'uri'

module ArchVizAI
  module Config
    PREF_KEY = 'ArchVizAI'.freeze
    DEFAULT_URL = 'http://127.0.0.1:3000'.freeze
    MAX_IMAGE_BYTES = 20 * 1024 * 1024
    MAX_SCENE_BYTES = 1024 * 1024
    MAX_PIXELS = 16_000_000

    def self.engine_url
      url = Sketchup.read_default(PREF_KEY, 'engine_url', DEFAULT_URL)
      if url == 'http://127.0.0.1:3001'
        url = DEFAULT_URL
        Sketchup.write_default(PREF_KEY, 'engine_url', url)
      end
      validate_url(url)
    end

    # Explicit reset also replaces a URL persisted by development sessions.
    def self.reset_engine_url!
      Sketchup.write_default(PREF_KEY, 'engine_url', DEFAULT_URL)
      engine_url
    end

    def self.validate_url(value)
      uri = URI.parse(value.to_s)
      unless uri.scheme == 'http' && %w[localhost 127.0.0.1 ::1].include?(uri.hostname) &&
             uri.userinfo.nil? && uri.query.nil? && uri.fragment.nil? &&
             ['', '/'].include?(uri.path) && uri.port.between?(1, 65_535)
        raise ArgumentError, 'URL do engine deve ser HTTP em localhost, 127.0.0.1 ou ::1.'
      end
      uri.to_s.sub(%r{/$}, '')
    rescue URI::InvalidURIError
      raise ArgumentError, 'URL local do engine inválida.'
    end
  end

  def self.log(message)
    puts "ArchVizAI: #{message}"
  end
end
