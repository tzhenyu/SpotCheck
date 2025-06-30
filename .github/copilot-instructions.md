---
applyTo: "**"
---
# Project general coding standards

## Naming Conventions
- Use PascalCase for component names, interfaces, and type aliases
- Use camelCase for variables, functions, and methods
- Prefix private class members with underscore (_)
- Use ALL_CAPS for constants

## General Principles
- Always verify information before presenting it. Do not make assumptions or speculate without clear evidence.
- Only implement changes explicitly requested; do not invent changes.
- Make changes file by file and provide all edits for a file in a single chunk.
- Allow for review of mistakes; do not remove unrelated code or functionalities—preserve existing structures.
- Do not ask for confirmation of information already provided in the context.
- Do not suggest updates, changes, or whitespace modifications if there are no actual required edits.
- Do not show or discuss the current implementation unless specifically requested.
- Do not summarize changes made.
- Do not give feedback about understanding in comments or documentation.
- Never use apologies in responses or documentation.
- Always provide links to real files, not context-generated or x.md files.
- Do not consider previous x.md files in memory; treat each run independently.

## Code Quality
- Prefer descriptive, explicit variable names for readability.
- Adhere to the existing coding style in the project.
- Prioritize code performance and security in suggestions.
- Implement robust error handling and logging where necessary.
- Encourage modular design for maintainability and reusability.
- Ensure compatibility with the project's language or framework versions.
- Replace hardcoded values with named constants.
- Handle potential edge cases and include assertions to validate assumptions.