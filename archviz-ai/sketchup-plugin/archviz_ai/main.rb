# frozen_string_literal: true
require 'sketchup.rb'
require_relative 'dialog'

module ArchVizAI
  def self.show_dialog
    @controller ||= Dialog.new
    @controller.show
  end

  unless file_loaded?(__FILE__)
    UI.menu('Extensions').add_item('ArchViz AI') { show_dialog }
    file_loaded(__FILE__)
  end
end
