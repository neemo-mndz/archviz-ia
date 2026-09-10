# frozen_string_literal: true
require 'sketchup.rb'
require 'extensions.rb'

module ArchVizAI
  unless file_loaded?(__FILE__)
    extension = SketchupExtension.new('ArchViz AI', 'archviz_ai/main')
    extension.description = 'Captura da cena e diagnóstico do ArchViz Engine. Fase 2: sem envio de render.'
    extension.version = '0.2.0'
    extension.creator = 'ArchViz AI'
    Sketchup.register_extension(extension, true)
    file_loaded(__FILE__)
  end
end
