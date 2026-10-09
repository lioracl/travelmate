#!/usr/bin/env ruby
require 'xcodeproj'

root = File.expand_path('..', __dir__)
project_path = File.join(root, 'ios', 'App', 'App.xcodeproj')
project = Xcodeproj::Project.open(project_path)
app = project.targets.find { |target| target.name == 'App' } or abort 'App target not found'
app_group = project.main_group.groups.find { |group| group.display_name == 'App' } or abort 'App group not found'

widget_name = 'TravelMateBudgetWidget'
widget_group = project.main_group.groups.find { |group| group.display_name == widget_name } || project.main_group.new_group(widget_name, widget_name)
widget = project.targets.find { |target| target.name == widget_name } || project.new_target(:app_extension, widget_name, :ios, '15.0')

def add_source(group, target, path)
  ref = group.files.find { |file| file.path == path } || group.new_file(path)
  target.source_build_phase.add_file_reference(ref, true) unless target.source_build_phase.files_references.include?(ref)
end

add_source(app_group, app, 'TravelMateWidgetBridgePlugin.swift')
add_source(app_group, app, 'TravelMateBridgeViewController.swift')
add_source(widget_group, widget, 'TravelMateBudgetWidget.swift')
add_source(widget_group, widget, 'TravelMateLiveTodayWidget.swift')

app.build_configurations.each do |config|
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'App/App.entitlements'
  config.build_settings['MARKETING_VERSION'] = '2.21.0'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '22100'
end

widget.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.travelmate.app.budgetwidget'
  config.build_settings['PRODUCT_NAME'] = '$(TARGET_NAME)'
  config.build_settings['INFOPLIST_FILE'] = 'TravelMateBudgetWidget/Info.plist'
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'TravelMateBudgetWidget/TravelMateBudgetWidget.entitlements'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
  config.build_settings['MARKETING_VERSION'] = '2.21.0'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '22100'
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['SKIP_INSTALL'] = 'YES'
  config.build_settings['APPLICATION_EXTENSION_API_ONLY'] = 'YES'
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
end

unless app.dependencies.any? { |dependency| dependency.target == widget }
  app.add_dependency(widget)
end

embed = app.copy_files_build_phases.find { |phase| phase.name == 'Embed App Extensions' } || app.new_copy_files_build_phase('Embed App Extensions')
embed.dst_subfolder_spec = '13'
embed.add_file_reference(widget.product_reference, true) unless embed.files_references.include?(widget.product_reference)

frameworks = project.frameworks_group
['WidgetKit.framework', 'SwiftUI.framework'].each do |name|
  ref = frameworks.files.find { |file| file.path&.end_with?(name) } || frameworks.new_file("System/Library/Frameworks/#{name}")
  widget.frameworks_build_phase.add_file_reference(ref, true) unless widget.frameworks_build_phase.files_references.include?(ref)
  app.frameworks_build_phase.add_file_reference(ref, true) if name == 'WidgetKit.framework' && !app.frameworks_build_phase.files_references.include?(ref)
end

project.save
puts "Configured #{widget_name} target with Budget and Live Today widgets"
