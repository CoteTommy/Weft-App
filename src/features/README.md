# Features Module Boundaries

Each feature should use the following boundary layout:

- `api/`: external I/O and runtime integration
- `domain/`: pure business logic and data transformations
- `ui/`: React view components/pages
- `state/`: client-side state management
- `tests/`: feature tests

Migration note: legacy folders (`services`, `hooks`, `components`, `types`, `utils`) are being incrementally moved to this boundary model.
