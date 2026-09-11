# frozen_string_literal: true
require 'tmpdir'
require 'fileutils'
require 'base64'
require_relative 'scene_reader'

module ArchVizAI
  module SceneCapture
    GEOMETRY_RENDERING_OPTIONS = {
      'RenderMode' => 1,
      'Texture' => false,
      'DisplayColorByLayer' => false,
      'DisplayFog' => false,
      'DisplayWatermarks' => false,
      'DrawGround' => false,
      'DrawHorizon' => false,
      'DrawUnderground' => false,
      'DrawHidden' => false,
      'DrawBackEdges' => false,
      'DrawSilhouettes' => true,
      'DrawProfilesOnly' => false,
      'DrawDepthQue' => false,
      'EdgeType' => 0,
      'EdgeColorMode' => 0,
      'EdgeDisplayMode' => 0,
      'JitterEdges' => false,
      'ExtendLines' => false,
      'LineExtension' => 0,
      'LineEndWidth' => 0,
      'DepthQueWidth' => 1,
      'SilhouetteWidth' => 2,
      'BackgroundColor' => Sketchup::Color.new(245, 245, 245),
      'SkyColor' => Sketchup::Color.new(245, 245, 245),
      'FaceFrontColor' => Sketchup::Color.new(235, 235, 235),
      'FaceBackColor' => Sketchup::Color.new(220, 220, 220)
    }.freeze
    SOLID_GEOMETRY_RENDERING_OPTIONS = GEOMETRY_RENDERING_OPTIONS.merge(
      'DrawSilhouettes' => false,
      'SilhouetteWidth' => 1,
      'EdgeDisplayMode' => 1,
      'FaceFrontColor' => Sketchup::Color.new(210, 210, 210),
      'FaceBackColor' => Sketchup::Color.new(200, 200, 200)
    ).freeze
    GEOMETRY_PASS_VERSION = '4B-solid-geometry-pass-1'

    # Only directories created by this module can be cleaned up.
    @owned_directories = []

    def self.capture(model = Sketchup.active_model)
      scene = SceneReader.read(model)
      width, height = scene.fetch('viewport').values_at('width', 'height')
      unless width.positive? && height.positive? && width <= 16_000 && height <= 16_000 && width * height <= Config::MAX_PIXELS
        raise 'Viewport exceeds the 16 million pixel limit or has invalid dimensions. Resize the window and try again.'
      end
      directory = Dir.mktmpdir('archviz-ai-capture-')
      @owned_directories << directory
      filename = File.join(directory, 'scene.png')
      geometry_filename = File.join(directory, 'geometry.png')
      solid_geometry_filename = File.join(directory, 'solid_geometry.png')
      ArchVizAI.log("capturing viewport (#{GEOMETRY_PASS_VERSION})")
      # Dump the current framebuffer: no camera/style/selection edits and no resampling.
      success = model.active_view.write_image(filename: filename, source: :framebuffer)
      raise 'SketchUp could not capture the viewport.' unless success && File.file?(filename)
      raise 'PNG exceeds 20 MiB. Resize the window and try again.' if File.size(filename) > Config::MAX_IMAGE_BYTES

      bytes = File.binread(filename)
      actual_width, actual_height = png_dimensions(bytes)
      unless [actual_width, actual_height] == [width, height]
        raise "Capture #{actual_width} x #{actual_height} differs from viewport #{width} x #{height}. No crop was applied."
      end
      raise 'Camera changed during capture. Try again.' unless SceneReader.camera(model.active_view) == scene['camera']

      camera_before_geometry = SceneReader.camera(model.active_view)
      geometry_bytes = capture_geometry_pass(model, geometry_filename, width, height, camera_before_geometry)
      geometry_width, geometry_height = png_dimensions(geometry_bytes)
      unless [geometry_width, geometry_height] == [actual_width, actual_height]
        raise "geometry.png #{geometry_width} x #{geometry_height} differs from scene.png #{actual_width} x #{actual_height}."
      end
      camera_after_geometry = SceneReader.camera(model.active_view)
      raise 'Camera changed during geometry.png capture.' unless camera_after_geometry == camera_before_geometry

      camera_before_solid = SceneReader.camera(model.active_view)
      solid_geometry_bytes = capture_rendering_pass(model, solid_geometry_filename, width, height, camera_before_solid, SOLID_GEOMETRY_RENDERING_OPTIONS, 'solid geometry')
      solid_width, solid_height = png_dimensions(solid_geometry_bytes)
      unless [solid_width, solid_height] == [actual_width, actual_height]
        raise "solid_geometry.png #{solid_width} x #{solid_height} differs from scene.png #{actual_width} x #{actual_height}."
      end
      camera_after_solid = SceneReader.camera(model.active_view)
      raise 'Camera changed during solid_geometry.png capture.' unless camera_after_solid == camera_before_solid

      ArchVizAI.log("capture completed (#{width}x#{height}, scene=#{bytes.bytesize} bytes, geometry=#{geometry_bytes.bytesize} bytes, solid=#{solid_geometry_bytes.bytesize} bytes)")
      {
        scene: scene,
        image: bytes,
        geometry_image: geometry_bytes,
        solid_geometry_image: solid_geometry_bytes,
        filename: 'scene.png',
        geometry_filename: 'geometry.png',
        solid_geometry_filename: 'solid_geometry.png',
        mime_type: 'image/png',
        geometry_mime_type: 'image/png',
        solid_geometry_mime_type: 'image/png',
        validation: {
          camera_before_geometry: camera_before_geometry,
          camera_after_geometry: camera_after_geometry,
          camera_before_solid_geometry: camera_before_solid,
          camera_after_solid_geometry: camera_after_solid,
          scene_dimensions: { width: actual_width, height: actual_height },
          geometry_dimensions: { width: geometry_width, height: geometry_height },
          solid_geometry_dimensions: { width: solid_width, height: solid_height },
          geometry_options: GEOMETRY_RENDERING_OPTIONS.keys,
          solid_geometry_options: SOLID_GEOMETRY_RENDERING_OPTIONS.keys
        }
      }
    ensure
      cleanup(directory) if directory
    end

    def self.capture_geometry_pass(model, filename, width, height, camera_before)
      capture_rendering_pass(model, filename, width, height, camera_before, GEOMETRY_RENDERING_OPTIONS, 'geometry')
    end

    def self.capture_rendering_pass(model, filename, width, height, camera_before, rendering_options, label)
      view = model.active_view
      options = model.rendering_options
      available = options.keys
      saved = {}
      changed = []
      rendering_options.each do |key, value|
        next unless available.include?(key)

        saved[key] = options[key]
        options[key] = value
        changed << key
      rescue ArgumentError => error
        ArchVizAI.log("#{label} option skipped #{key}: #{error.message}")
      end
      ArchVizAI.log("#{label} pass changed options: #{changed.join(', ')}")
      view.refresh
      success = view.write_image(filename: filename, width: width, height: height, antialias: false, compression: 1.0)
      raise "SketchUp could not capture #{File.basename(filename)}." unless success && File.file?(filename)
      raise "#{File.basename(filename)} exceeds 20 MiB. Resize the window and try again." if File.size(filename) > Config::MAX_IMAGE_BYTES
      raise "Camera changed during #{label} pass setup." unless SceneReader.camera(view) == camera_before

      File.binread(filename)
    ensure
      if saved
        saved.each { |key, value| options[key] = value }
        view.refresh if view
      end
    end

    def self.png_dimensions(bytes)
      unless bytes.start_with?("\x89PNG\r\n\x1A\n".b) && bytes.bytesize >= 24
        raise 'SketchUp returned an invalid PNG.'
      end
      bytes.byteslice(16, 8).unpack('NN')
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
