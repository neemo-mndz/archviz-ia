# frozen_string_literal: true
# Execute inside SketchUp's Ruby interpreter, not an imitation of the API.
module ArchVizAIPhase2Checks
  def self.run
    results = []
    check = lambda do |name, &block|
      raise "FAILED: #{name}" unless block.call

      results << name
    end
    Dir.glob(File.expand_path('../**/*.rb', __dir__)).each { |file| RubyVM::InstructionSequence.compile_file(file) }
    check.call('all Ruby files compile') { true }
    %w[http://127.0.0.1:3000 http://localhost:3001 http://[::1]:3000].each do |url|
      check.call("loopback #{url}") { ArchVizAI::Config.validate_url(url) == url }
    end
    %w[https://localhost:3000 http://example.com http://localhost.evil.test http://127.0.0.2 http://user@localhost http://localhost/jobs http://localhost/?x=1 file:///etc/passwd].each do |url|
      rejected = false
      begin
        ArchVizAI::Config.validate_url(url)
      rescue ArgumentError
        rejected = true
      end
      check.call("reject #{url}") { rejected }
    end
    check.call('Unicode names respect backend UTF-16 limit') do
      ArchVizAI::SceneReader.text('😀' * 300).encode('UTF-16LE').bytesize == 512
    end
    check.call('only diagnostic routes available') do
      ArchVizAI::ApiClient::ROUTES.values.sort == ['/api/health', '/api/render/options']
    end
    controller = ArchVizAI.controller
    original = controller.instance_variable_get(:@dialog)
    ArchVizAI.show_dialog
    check.call('opening twice reuses same HtmlDialog') { controller.instance_variable_get(:@dialog).equal?(original) }
    check.call('catalog from engine has nine option lists') { controller.catalog && controller.catalog['options'].length == 9 }
    { passed: results.length, checks: results }
  end
end
