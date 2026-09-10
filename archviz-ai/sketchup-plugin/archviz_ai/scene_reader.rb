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
        'materials' => model.materials.take(200).map { |item| material(item) }, 'objects' => objects
      }
      raise 'Metadados da cena excedem 1 MiB.' if JSON.generate(scene).bytesize > Config::MAX_SCENE_BYTES

      scene
    end
  end
end
