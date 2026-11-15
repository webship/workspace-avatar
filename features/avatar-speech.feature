Feature: Speech for the AI Assistant
  Once the plugin is activated and installed, the assistant's page carries the speech scripts and is
  told which parts of speech are switched on. The microphone itself is never opened by a page load.

  Scenario: The page is told which parts of speech are on
    Given I am on "/fragments/p/avatar/speech/config"
     Then I should see "microphone"
      And I should see "speaking"
      And I should see "bargeIn"
      And I should see "sttEngine"
      And I should see "cmd-tools-avatar-speech.sh"

  Scenario: The speech scripts are loaded with the assistant
    Given I am on "/avatars"
     Then "script[src^='/plugin-js/avatar/speech-core.js']" should be attached
      And "script[src^='/plugin-js/avatar/speech-speak.js']" should be attached
      And "script[src^='/plugin-js/avatar/speech-loop.js']" should be attached
      And ".ws-speech" should be attached

  Scenario: Nothing listens until a talk button is pressed
    Given I am on "/avatars"
     Then "html[data-speech='off']" should be attached
      And ".ws-speech.is-open" should not be attached
