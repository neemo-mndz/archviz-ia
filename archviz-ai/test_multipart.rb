require 'json'

# Mock Sketchup classes so we can load the file
module Sketchup
  module Http
    class Request
      attr_accessor :headers, :body
      def initialize(url, method)
      end
    end
    POST = :post
    GET = :get
  end
end

module UI
  def self.start_timer(*args)
  end
  def self.stop_timer(*args)
  end
end

module ArchVizAI
  def self.log(msg)
    puts "[LOG] #{msg}"
  end
  
  module Config
    MAX_SCENE_BYTES = 1024 * 1024
    def self.engine_url
      'http://127.0.0.1:3000'
    end
    def self.validate_url(u)
      u
    end
  end
end

require_relative 'sketchup-plugin/archviz_ai/api_client'

puts "Running test..."

# 1. Fake PNG bytes (random bytes to simulate binary image)
fake_png = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 255, 128, 0, 10, 200].pack('C*')
fake_png.force_encoding(Encoding::ASCII_8BIT)

# 2. ASCII field
ascii_field = "simple text"

# 3. UTF-8 field with accents
utf8_field = "Iluminação natural no período da tarde"

# 4. JSON field with unicode
scene_json = JSON.generate({ "nome" => "Vista 1 \u2728", "descrição" => "Árvores" })

payload = {
  fields: {
    ascii: ascii_field,
    notes: utf8_field,
    scene: scene_json
  },
  image: {
    filename: "render.png",
    content_type: "image/png",
    bytes: fake_png
  }
}

client = ArchVizAI::ApiClient.new

captured_request = nil

# intercept Sketchup::Http::Request.new
module Sketchup
  module Http
    class Request
      alias_method :original_initialize, :initialize
      def initialize(url, method)
        $captured_request = self
        original_initialize(url, method)
      end
      
      def start
        # fake start
      end
    end
  end
end

client.post_render(payload) do |data, error|
end

body = $captured_request.body

puts "Body encoding: #{body.encoding}"
puts "Body bytesize: #{body.bytesize}"
puts "Image bytesize: #{fake_png.bytesize}"

# verify that body contains exact bytes
if body.include?(fake_png)
  puts "SUCCESS: exact image bytes found in body"
else
  puts "FAIL: exact image bytes NOT found in body"
end
