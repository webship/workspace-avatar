Feature: The reading window's tools
  Once the plugin is activated and installed, the page carries the reading tools and is told which
  sites are this workspace's own. A picture and the tests are for those sites only.

  Scenario: The reading tools are loaded with the assistant
    Given I am on "/avatars"
     Then "script[src^='/plugin-js/avatar/browser-core.js']" should be attached
      And "script[src^='/plugin-js/avatar/browser-tools.js']" should be attached

  Scenario: The page is told which sites are this workspace's own
    Given I am on "/fragments/p/avatar/sites"
     Then I should see "sites"
