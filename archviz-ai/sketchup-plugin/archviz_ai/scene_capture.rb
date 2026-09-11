# frozen_string_literal: true
require 'tmpdir'
require 'fileutils'
require 'base64'
require 'zlib'
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
    DEPTH_MAX_WIDTH = 512
    GEOMETRY_PASS_VERSION = '4B.1-structural-truth-1'

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
      depth_filename = File.join(directory, 'depth.png')
      ArchVizAI.log("capturing viewport (#{GEOMETRY_PASS_VERSION})")
      timings = {}
      started = monotonic_ms
      # Dump the current framebuffer: no camera/style/selection edits and no resampling.
      success = model.active_view.write_image(filename: filename, source: :framebuffer)
      timings[:scene_capture_ms] = monotonic_ms - started
      raise 'SketchUp could not capture the viewport.' unless success && File.file?(filename)
      raise 'PNG exceeds 20 MiB. Resize the window and try again.' if File.size(filename) > Config::MAX_IMAGE_BYTES

      bytes = File.binread(filename)
      actual_width, actual_height = png_dimensions(bytes)
      unless [actual_width, actual_height] == [width, height]
        raise "Capture #{actual_width} x #{actual_height} differs from viewport #{width} x #{height}. No crop was applied."
      end
      raise 'Camera changed during capture. Try again.' unless SceneReader.camera(model.active_view) == scene['camera']

      camera_before_geometry = SceneReader.camera(model.active_view)
      started = monotonic_ms
      geometry_bytes = capture_geometry_pass(model, geometry_filename, width, height, camera_before_geometry)
      timings[:geometry_capture_ms] = monotonic_ms - started
      geometry_width, geometry_height = png_dimensions(geometry_bytes)
      unless [geometry_width, geometry_height] == [actual_width, actual_height]
        raise "geometry.png #{geometry_width} x #{geometry_height} differs from scene.png #{actual_width} x #{actual_height}."
      end
      camera_after_geometry = SceneReader.camera(model.active_view)
      raise 'Camera changed during geometry.png capture.' unless camera_after_geometry == camera_before_geometry

      camera_before_solid = SceneReader.camera(model.active_view)
      started = monotonic_ms
      ray_passes = generate_ray_passes(model, solid_geometry_filename, depth_filename, width, height, camera_before_solid)
      timings[:solid_capture_ms] = ray_passes[:solid_ms]
      timings[:depth_generation_ms] = ray_passes[:depth_ms]
      timings[:ray_cast_ms] = ray_passes[:ray_ms]
      solid_geometry_bytes = ray_passes[:solid_bytes]
      depth_bytes = ray_passes[:depth_bytes]
      solid_width, solid_height = png_dimensions(solid_geometry_bytes)
      unless [solid_width, solid_height] == [actual_width, actual_height]
        raise "solid_geometry.png #{solid_width} x #{solid_height} differs from scene.png #{actual_width} x #{actual_height}."
      end
      depth_width, depth_height = png_dimensions(depth_bytes)
      unless [depth_width, depth_height] == [actual_width, actual_height]
        raise "depth.png #{depth_width} x #{depth_height} differs from scene.png #{actual_width} x #{actual_height}."
      end
      camera_after_solid = SceneReader.camera(model.active_view)
      raise 'Camera changed during ray passes.' unless camera_after_solid == camera_before_solid
      diff = compare_pngs(geometry_bytes, solid_geometry_bytes)
      ArchVizAI.log(format('Geometry/Solid difference: %.2f%%, mean delta: %.2f, Solid occupancy: %.2f%%',
                           diff[:different_percent], diff[:mean_delta], ray_passes[:solid_occupancy_percent]))
      ArchVizAI.log(format('Depth: min=%.4f max=%.4f generation=%dms resolution=%dx%d encoding=near-white far-black',
                           ray_passes[:min_depth] || 0.0, ray_passes[:max_depth] || 0.0,
                           timings[:depth_generation_ms], ray_passes[:ray_width], ray_passes[:ray_height]))

      ArchVizAI.log("capture completed (#{width}x#{height}, scene=#{bytes.bytesize} bytes, geometry=#{geometry_bytes.bytesize} bytes, solid=#{solid_geometry_bytes.bytesize} bytes, depth=#{depth_bytes.bytesize} bytes)")
      {
        scene: scene,
        image: bytes,
        geometry_image: geometry_bytes,
        solid_geometry_image: solid_geometry_bytes,
        depth_image: depth_bytes,
        filename: 'scene.png',
        geometry_filename: 'geometry.png',
        solid_geometry_filename: 'solid_geometry.png',
        depth_filename: 'depth.png',
        mime_type: 'image/png',
        geometry_mime_type: 'image/png',
        solid_geometry_mime_type: 'image/png',
        depth_mime_type: 'image/png',
        validation: {
          camera_before_geometry: camera_before_geometry,
          camera_after_geometry: camera_after_geometry,
          camera_before_solid_geometry: camera_before_solid,
          camera_after_solid_geometry: camera_after_solid,
          scene_dimensions: { width: actual_width, height: actual_height },
          geometry_dimensions: { width: geometry_width, height: geometry_height },
          solid_geometry_dimensions: { width: solid_width, height: solid_height },
          depth_dimensions: { width: depth_width, height: depth_height },
          geometry_options: GEOMETRY_RENDERING_OPTIONS.keys,
          solid_geometry_strategy: 'ray casting occupancy mask',
          depth_strategy: 'SketchUp view.pickray + model.raytest at reduced resolution, nearest-neighbor upscale',
          geometry_solid_difference: diff,
          solid_occupancy_percent: ray_passes[:solid_occupancy_percent],
          depth_min: ray_passes[:min_depth],
          depth_max: ray_passes[:max_depth],
          depth_ray_resolution: { width: ray_passes[:ray_width], height: ray_passes[:ray_height] },
          timings: timings
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

    def self.generate_ray_passes(model, solid_filename, depth_filename, width, height, camera_before)
      view = model.active_view
      ray_width = [DEPTH_MAX_WIDTH, width].min
      ray_height = [(height.to_f * ray_width / width).round, 1].max
      camera_eye = view.camera.eye
      depths = Array.new(ray_width * ray_height)
      hits = Array.new(ray_width * ray_height, false)
      min_depth = nil
      max_depth = nil
      ray_started = monotonic_ms
      ray_height.times do |y|
        sy = ((y + 0.5) * height / ray_height.to_f)
        ray_width.times do |x|
          sx = ((x + 0.5) * width / ray_width.to_f)
          ray = view.pickray(sx, sy)
          result = model.raytest(ray, true)
          next unless result && result[0]

          point = result[0]
          depth = camera_eye.distance(point).to_f
          index = y * ray_width + x
          hits[index] = true
          depths[index] = depth
          min_depth = depth if min_depth.nil? || depth < min_depth
          max_depth = depth if max_depth.nil? || depth > max_depth
        end
      end
      ray_ms = monotonic_ms - ray_started
      raise 'Camera changed during depth ray casting.' unless SceneReader.camera(view) == camera_before

      solid_started = monotonic_ms
      solid_pixels = upscale_pixels(ray_width, ray_height, width, height) do |index|
        hits[index] ? [32, 32, 32] : [255, 255, 255]
      end
      solid_bytes = encode_png_rgb(width, height, solid_pixels)
      File.binwrite(solid_filename, solid_bytes)
      solid_ms = monotonic_ms - solid_started

      depth_started = monotonic_ms
      range = max_depth && min_depth && max_depth > min_depth ? max_depth - min_depth : 1.0
      depth_pixels = upscale_pixels(ray_width, ray_height, width, height) do |index|
        if hits[index] && depths[index]
          value = (255 - (((depths[index] - min_depth) / range) * 255)).round
          value = [[value, 0].max, 255].min
          [value, value, value]
        else
          [0, 0, 0]
        end
      end
      depth_bytes = encode_png_rgb(width, height, depth_pixels)
      File.binwrite(depth_filename, depth_bytes)
      depth_ms = (monotonic_ms - depth_started) + ray_ms

      occupancy = hits.count(true) * 100.0 / hits.length
      {
        solid_bytes: solid_bytes,
        depth_bytes: depth_bytes,
        solid_ms: solid_ms,
        depth_ms: depth_ms,
        ray_ms: ray_ms,
        ray_width: ray_width,
        ray_height: ray_height,
        min_depth: min_depth,
        max_depth: max_depth,
        solid_occupancy_percent: occupancy
      }
    end

    def self.upscale_pixels(source_width, source_height, target_width, target_height)
      rows = []
      target_height.times do |y|
        source_y = [(y * source_height / target_height.to_f).floor, source_height - 1].min
        row = String.new(encoding: Encoding::BINARY)
        target_width.times do |x|
          source_x = [(x * source_width / target_width.to_f).floor, source_width - 1].min
          row << yield(source_y * source_width + source_x).pack('C3')
        end
        rows << row
      end
      rows
    end

    def self.encode_png_rgb(width, height, rows)
      raw = String.new(encoding: Encoding::BINARY)
      rows.each { |row| raw << "\x00".b << row }
      png = "\x89PNG\r\n\x1A\n".b
      png << png_chunk('IHDR', [width, height, 8, 2, 0, 0, 0].pack('NNCCCCC'))
      png << png_chunk('IDAT', Zlib::Deflate.deflate(raw, Zlib::BEST_SPEED))
      png << png_chunk('IEND', ''.b)
      png
    end

    def self.png_chunk(type, data)
      [data.bytesize].pack('N') + type + data + [Zlib.crc32(type + data)].pack('N')
    end

    def self.compare_pngs(first, second)
      a = decode_png_rgb(first)
      b = decode_png_rgb(second)
      return { different_percent: 100.0, mean_delta: 255.0 } unless a && b && a[:width] == b[:width] && a[:height] == b[:height]

      sample_step = [[(a[:width] * a[:height] / 200_000.0).ceil, 1].max, 16].min
      different = 0
      total = 0
      delta_sum = 0.0
      index = 0
      pixel_count = a[:width] * a[:height]
      while index < pixel_count
        offset = index * 3
        delta = ((a[:pixels].getbyte(offset) - b[:pixels].getbyte(offset)).abs +
                 (a[:pixels].getbyte(offset + 1) - b[:pixels].getbyte(offset + 1)).abs +
                 (a[:pixels].getbyte(offset + 2) - b[:pixels].getbyte(offset + 2)).abs) / 3.0
        different += 1 if delta > 8
        delta_sum += delta
        total += 1
        index += sample_step
      end
      { different_percent: different * 100.0 / total, mean_delta: delta_sum / total }
    rescue StandardError => error
      ArchVizAI.log("PNG comparison skipped: #{error.message}")
      { different_percent: 0.0, mean_delta: 0.0 }
    end

    def self.decode_png_rgb(bytes)
      return nil unless bytes.start_with?("\x89PNG\r\n\x1A\n".b)

      offset = 8
      width = height = bit_depth = color_type = nil
      idat = String.new(encoding: Encoding::BINARY)
      while offset < bytes.bytesize
        length = bytes.byteslice(offset, 4).unpack1('N')
        type = bytes.byteslice(offset + 4, 4)
        data = bytes.byteslice(offset + 8, length)
        case type
        when 'IHDR'
          width, height, bit_depth, color_type = data.unpack('NNCC')
        when 'IDAT'
          idat << data
        when 'IEND'
          break
        end
        offset += 12 + length
      end
      return nil unless width && height && bit_depth == 8

      channels = { 0 => 1, 2 => 3, 6 => 4 }[color_type]
      return nil unless channels

      scanline = width * channels
      raw = Zlib::Inflate.inflate(idat)
      previous = Array.new(scanline, 0)
      pixels = String.new(encoding: Encoding::BINARY)
      pos = 0
      height.times do
        filter = raw.getbyte(pos)
        pos += 1
        line = raw.byteslice(pos, scanline).bytes
        pos += scanline
        line.each_index do |i|
          left = i >= channels ? line[i - channels] : 0
          up = previous[i]
          up_left = i >= channels ? previous[i - channels] : 0
          line[i] = (line[i] + png_filter_value(filter, left, up, up_left)) & 0xff
        end
        width.times do |x|
          base = x * channels
          value = color_type == 0 ? line[base] : nil
          pixels << [(value || line[base]), (value || line[base + 1]), (value || line[base + 2])].pack('C3')
        end
        previous = line
      end
      { width: width, height: height, pixels: pixels }
    end

    def self.png_filter_value(filter, left, up, up_left)
      case filter
      when 0 then 0
      when 1 then left
      when 2 then up
      when 3 then ((left + up) / 2).floor
      when 4
        p = left + up - up_left
        pa = (p - left).abs
        pb = (p - up).abs
        pc = (p - up_left).abs
        pa <= pb && pa <= pc ? left : (pb <= pc ? up : up_left)
      else 0
      end
    end

    def self.png_dimensions(bytes)
      unless bytes.start_with?("\x89PNG\r\n\x1A\n".b) && bytes.bytesize >= 24
        raise 'SketchUp returned an invalid PNG.'
      end
      bytes.byteslice(16, 8).unpack('NN')
    end

    def self.monotonic_ms
      (Process.clock_gettime(Process::CLOCK_MONOTONIC) * 1000).round
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
