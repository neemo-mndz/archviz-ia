# frozen_string_literal: true
require 'json'
require_relative 'config'

module ArchVizAI
  module SceneReader
    def self.text(value)
      # Match the backend's UTF-16 length limit, including non-BMP names.
      result = value.to_s.encode('UTF-8', invalid: :replace, undef: :replace)
      result = result[0...-1] while result.encode('UTF-16LE').bytesize > 512
      result
    end

    def self.dimensions(view)
      if view.respond_to?(:device_width)
        [view.device_width, view.device_height]
      else
        [view.vpwidth.round, view.vpheight.round]
      end
    end

    def self.camera(view)
      camera = view.camera
      {
        'eye' => camera.eye.to_a.map(&:to_f), 'target' => camera.target.to_a.map(&:to_f),
        'up' => camera.up.to_a.map(&:to_f), 'perspective' => camera.perspective?,
        'fovDegrees' => camera.perspective? ? camera.fov.to_f : nil,
        'aspectRatio' => camera.aspect_ratio.to_f
      }
    end

    def self.material(item)
      color = item.color
      texture = item.texture
      {
        'name' => text(item.name),
        'color' => format('#%02X%02X%02X', color.red, color.green, color.blue),
        'opacity' => item.alpha.to_f,
        'texture' => texture ? {
          'name' => text(File.basename(texture.filename.to_s.tr('\\', '/'))),
          'width' => texture.width.to_f, 'height' => texture.height.to_f
        } : nil
      }
    end

    def self.visible_drawing_element?(entity)
      return false if entity.respond_to?(:hidden?) && entity.hidden?
      return false if entity.respond_to?(:visible?) && !entity.visible?
      layer = entity.respond_to?(:layer) ? entity.layer : nil
      return false if layer && layer.respond_to?(:visible?) && !layer.visible?

      true
    end

    def self.screen_bounds(face, transform, view, width, height)
      xs = []
      ys = []
      face.vertices.each do |vertex|
        point = vertex.position.transform(transform)
        screen = view.screen_coords(point)
        xs << (screen.x.to_f / width)
        ys << (screen.y.to_f / height)
      end
      return nil if xs.empty? || ys.empty?

      {
        'xMin' => [[xs.min, 0.0].max, 1.0].min.round(4),
        'yMin' => [[ys.min, 0.0].max, 1.0].min.round(4),
        'xMax' => [[xs.max, 0.0].max, 1.0].min.round(4),
        'yMax' => [[ys.max, 0.0].max, 1.0].min.round(4)
      }
    rescue StandardError
      nil
    end

    def self.face_fact(face, transform, scope, view = nil, width = nil, height = nil)
      normal = face.normal.transform(transform)
      normal.normalize! if normal.length.positive?
      loops = face.loops
      fact = {
        'id' => face.respond_to?(:persistent_id) ? face.persistent_id.to_s : face.entityID.to_s,
        'scope' => scope,
        'area' => face.area(transform).to_f.round(4),
        'normal' => normal.to_a.map { |value| value.to_f.round(6) },
        'loopCount' => loops.length,
        'innerLoopCount' => [loops.length - 1, 0].max
      }
      bounds = screen_bounds(face, transform, view, width, height) if view && width && height
      fact['screenBounds'] = bounds if bounds
      fact
    end

    def self.collect_face_facts(model)
      started = Process.clock_gettime(Process::CLOCK_MONOTONIC)
      limit = 200
      candidates = []
      view = model.active_view
      width, height = dimensions(view)
      model.entities.each do |entity|
        next unless visible_drawing_element?(entity)

        if entity.is_a?(Sketchup::Face)
          candidates << face_fact(entity, Geom::Transformation.new, 'root', view, width, height)
        elsif entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)
          transform = entity.transformation
          entities = entity.is_a?(Sketchup::Group) ? entity.entities : entity.definition.entities
          scope_name = text(entity.name.to_s.empty? ? entity.definition.name : entity.name)
          entities.each do |child|
            next unless child.is_a?(Sketchup::Face) && visible_drawing_element?(child)

            fact = face_fact(child, transform, entity.is_a?(Sketchup::Group) ? 'group' : 'component', view, width, height)
            fact['ownerName'] = scope_name unless scope_name.empty?
            fact['tag'] = text(entity.layer.name) if entity.layer && !entity.layer.name.to_s.empty?
            candidates << fact
          end
        end
      end

      sorted = candidates.sort_by { |fact| -fact['area'] }
      surfaces = sorted.first(limit)
      {
        'surfaceCount' => candidates.length,
        'reportedSurfaceCount' => surfaces.length,
        'surfacesWithInnerLoops' => candidates.count { |fact| fact['innerLoopCount'].positive? },
        'continuousSurfaces' => candidates.count { |fact| fact['innerLoopCount'].zero? },
        'collectionLimit' => limit,
        'analysisMs' => ((Process.clock_gettime(Process::CLOCK_MONOTONIC) - started) * 1000).round,
        'strategy' => 'root faces plus first-level visible group/component faces, sorted by area; no occlusion culling',
        'surfaces' => surfaces
      }
    end

    def self.selected_face_fact(model = Sketchup.active_model)
      face = model.selection.find { |entity| entity.is_a?(Sketchup::Face) }
      raise 'Select one SketchUp::Face first.' unless face

      width, height = dimensions(model.active_view)
      face_fact(face, Geom::Transformation.new, 'selected', model.active_view, width, height)
    end

    def self.read(model = Sketchup.active_model)
      raise 'Nenhum modelo aberto.' unless model

      ArchVizAI.log('reading scene')
      width, height = dimensions(model.active_view)
      objects = []
      count = 0
      model.entities.each do |entity|
        next unless entity.is_a?(Sketchup::Group) || entity.is_a?(Sketchup::ComponentInstance)

        count += 1
        next if objects.length >= 1000

        objects << {
          'name' => text(entity.name), 'definitionName' => text(entity.definition.name),
          'type' => entity.is_a?(Sketchup::Group) ? 'group' : 'component',
          'material' => entity.material ? text(entity.material.name) : '',
          'tag' => entity.layer ? text(entity.layer.name) : '', 'hidden' => entity.hidden?
        }
      end
      scene = {
        'schemaVersion' => '1.0', 'source' => 'sketchup', 'units' => 'inch',
        'viewport' => { 'width' => width, 'height' => height },
        'camera' => camera(model.active_view),
        'scene' => { 'name' => model.pages.selected_page ? text(model.pages.selected_page.name) : nil },
        'model' => { 'name' => text(model.name), 'materialCount' => model.materials.length, 'objectCount' => count },
        'materials' => model.materials.take(200).map { |item| material(item) }, 'objects' => objects,
        'geometryFacts' => collect_face_facts(model)
      }
      raise 'Metadados da cena excedem 1 MiB.' if JSON.generate(scene).bytesize > Config::MAX_SCENE_BYTES

      scene
    end
  end
end
