# frozen_string_literal: true
require 'sketchup.rb'
require 'extensions.rb'

module ArchVizAI
  unless file_loaded?(__FILE__)
    extension = SketchupExtension.new('ArchViz AI', 'archviz_ai/main')
    extension.description = 'Integração de render AI no SketchUp via ArchViz Engine. Fase 3: Render pipeline conectado.'
    extension.version = '0.3.0'
    extension.creator = 'ArchViz AI'
    Sketchup.register_extension(extension, true)
    file_loaded(__FILE__)
  end
end
