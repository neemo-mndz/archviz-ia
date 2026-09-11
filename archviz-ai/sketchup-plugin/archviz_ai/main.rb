# frozen_string_literal: true
require 'sketchup.rb'
require 'json'
require_relative 'dialog'
require_relative 'scene_reader'

module ArchVizAI
  def self.show_dialog
    @controller ||= Dialog.new
    @controller.show
  end

  def self.log_selected_face
    fact = SceneReader.selected_face_fact
    log("Selected Face\n#{JSON.pretty_generate(fact)}")
    fact
  rescue StandardError => error
    log("Selected Face ERROR: #{error.message}")
    nil
  end

  unless file_loaded?(__FILE__)
    UI.menu('Extensions').add_item('ArchViz AI') { show_dialog }
    file_loaded(__FILE__)
  end
end
