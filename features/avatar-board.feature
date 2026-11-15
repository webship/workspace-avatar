Feature: The board's tools
  Once the plugin is activated and installed, the page carries the board's tools: they join the
  assistant's board when it is opened. Nothing is saved until someone presses a save button.

  Scenario: The board tools are loaded with the assistant
    Given I am on "/avatars"
     Then "script[src^='/plugin-js/avatar/board-core.js']" should be attached
      And "script[src^='/plugin-js/avatar/board-tools.js']" should be attached

  Scenario: A board is not saved by asking for it
    Given I am on "/actions/p/avatar/board-save"
     Then I should not see "saved"
