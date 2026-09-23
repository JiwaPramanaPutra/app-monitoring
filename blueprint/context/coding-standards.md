# Coding Standards

Follow these conventions for all code changes.

## Writing
- Prioritize readability over cleverness.
- Use descriptive names: `getTrafficSamples` not `getTraf`.
- Keep functions small and focused on a single responsibility.
- Write pure functions where practical. Keep state and side-effects at the edges.

## Comments
- Write comments to explain *why*, not *what*. Code explains what.
- Use comments for non-obvious business logic, regex, or workarounds.
- Omit comments that just restate the code.

## Types and Interfaces
- Use TypeScript strictly on the frontend (Angular). Use clear interfaces for API responses and component states.
- Backend is JavaScript. Use Mongoose schemas to enforce structure and validation.

## Backend (Node.js, Express, MongoDB)
- Ensure API routes return consistent JSON structures (e.g., `{ success: true, data: ... }` or `{ success: false, message: ... }`).
- Do not expose sensitive credentials (e.g., router credentials, SSH passwords) to the frontend.
- Handle external network requests (Ping, SSH, RouterOS API) with proper error handling and timeouts to prevent hanging processes.

## Frontend (Angular)
- Use Standalone Components (no NgModules unless explicitly required for legacy dependencies).
- Use Angular Services to handle HTTP API calls and state management. Components should be lean and focused on presentation.
- Use RxJS observables for state management and async operations where appropriate.
- Manage styling with standard CSS/Tailwind (as per current project setup).

## Testing
- Unit testing is available on the frontend using Vitest (`npm test` in the `frontend` directory).
- Write tests for core business logic when applicable.
