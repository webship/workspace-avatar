Feature: The camera
  Once the plugin is activated and installed, the page carries the camera script and is told whether
  the camera is offered. The camera itself is never opened by a page load.

  Scenario: The page is told whether the camera is offered
    Given I am on "/fragments/p/avatar/camera/config"
     Then I should see "enabled"

  Scenario: The camera is off until its button is pressed
    Given I am on "/avatars"
     Then "script[src^='/plugin-js/avatar/camera.js']" should be attached
      And "html[data-camera='on']" should not be attached
      And ".ws-camera-video" should not be attached
