```markdown
# manju_flow Development Patterns

> Auto-generated skill from repository analysis

## Overview
This skill teaches the core development patterns and conventions used in the `manju_flow` Go codebase. You'll learn about file naming, import/export styles, commit message conventions, and how to write and run tests. While no specific framework or automated workflows were detected, this guide will help you maintain consistency and quality in your contributions.

## Coding Conventions

### File Naming
- Use **camelCase** for file names.
  - Example: `myHandler.go`, `userService.go`

### Import Style
- Use **relative imports** for referencing local packages.
  - Example:
    ```go
    import "../utils"
    ```

### Export Style
- Use **named exports** for functions, types, and variables.
  - Example:
    ```go
    package mypackage

    func MyExportedFunction() {
        // ...
    }
    ```

### Commit Messages
- Follow **conventional commit** style.
- Use the `feat` prefix for new features.
- Keep commit messages concise (average ~47 characters).
  - Example:
    ```
    feat: add user authentication middleware
    ```

## Workflows

### Feature Development
**Trigger:** When adding a new feature  
**Command:** `/feature-dev`

1. Create a new branch for your feature.
2. Implement the feature using camelCase file naming and relative imports.
3. Export functions/types as needed using named exports.
4. Write or update tests in a corresponding `*.test.*` file.
5. Commit changes with a `feat:` prefix and a concise message.
6. Open a pull request for review.

### Code Testing
**Trigger:** When verifying code correctness  
**Command:** `/run-tests`

1. Locate or create a test file matching `*.test.*`.
2. Write tests for your code (testing framework is unspecified).
3. Run the tests using Go's testing tools or your preferred method.
4. Ensure all tests pass before merging.

## Testing Patterns

- Test files follow the pattern: `*.test.*` (e.g., `userService.test.go`).
- The specific testing framework is **unknown**; use standard Go testing or project conventions.
- Example test file:
  ```go
  package mypackage

  import "testing"

  func TestMyExportedFunction(t *testing.T) {
      // test logic here
  }
  ```

## Commands
| Command         | Purpose                                 |
|-----------------|-----------------------------------------|
| /feature-dev    | Start a new feature development workflow |
| /run-tests      | Run all tests in the codebase           |
```
