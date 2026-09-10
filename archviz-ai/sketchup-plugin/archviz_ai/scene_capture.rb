# frozen_string_literal: true
require 'tmpdir'
require 'fileutils'
require 'base64'
require_relative 'scene_reader'

module ArchVizAI
  module SceneCapture
    # Only directories created by this module can be cleaned up.
    @owned_directories = []

    def self.capture(model = Sketchup.active_model)
      scene = SceneReader.read(model)
      width, height = scene.fetch('viewport').values_at('width', 'height')
      unless width.positive? && height.positive? && width <= 16_000 && height <= 16_000 && width * height <= Config::MAX_PIXELS
        raise 'Viewport excede o limite de 16 milhões de pixels ou possui dimensões inválidas. Redimensione a janela e tente novamente.'
      end
      directory = Dir.mktmpdir('archviz-ai-capture-')
      @owned_directories << directory
      filename = File.join(directory, 'scene.png')
      ArchVizAI.log('capturing viewport')
      # Dump the current framebuffer: no camera/style/selection edits and no resampling.
      success = model.active_view.write_image(filename: filename, source: :framebuffer)
      raise 'SketchUp não conseguiu capturar a viewport.' unless success && File.file?(filename)
      raise 'PNG excede 20 MiB. Redimensione a janela e tente novamente.' if File.size(filename) > Config::MAX_IMAGE_BYTES

      bytes = File.binread(filename)
      unless bytes.start_with?("\x89PNG\r\n\x1A\n".b) && bytes.bytesize >= 24
        raise 'SketchUp retornou um PNG inválido.'
      end
      actual_width, actual_height = bytes.byteslice(16, 8).unpack('NN')
      unless [actual_width, actual_height] == [width, height]
        raise "Captura #{actual_width} × #{actual_height} difere da viewport #{width} × #{height}. Nenhum recorte foi aplicado."
      end
      raise 'A câmera mudou durante a captura. Tente novamente.' unless SceneReader.camera(model.active_view) == scene['camera']

      ArchVizAI.log("capture completed (#{width}x#{height}, #{bytes.bytesize} bytes)")
      { scene: scene, image: bytes, filename: 'scene.png', mime_type: 'image/png' }
    ensure
      cleanup(directory) if directory
    end

    def self.cleanup(directory)
      path = File.expand_path(directory)
      return unless @owned_directories.include?(path)
      return unless File.dirname(path) == File.expand_path(Dir.tmpdir) && File.basename(path).start_with?('archviz-ai-capture-')

      FileUtils.remove_entry(path) if File.directory?(path)
      @owned_directories.delete(path)
    end
  end
end
