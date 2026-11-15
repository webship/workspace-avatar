Feature: What the assistant can do here
  Once the plugin is activated and installed, the assistant is told what it can do in this workspace,
  role by role, from the folders and commands that are here. The same list can be read by a person.

  Scenario: The roles are listed with what this workspace has for each
    Given I am on "/fragments/p/avatar/roles"
     Then I should see "Development"
      And I should see "Testing"
      And I should see "Design"
      And I should see "Video production"
      And I should see "Audio production"
      And I should see "Documents"
