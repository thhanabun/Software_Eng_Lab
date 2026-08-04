# Lab 1 Tests

All tests are located under the `tests/lab-01` folder. Run them with:

```bash
# API tests (Supertest)
cd server && npm test

# UI tests (Vitest)
cd client && npm test
```

| Test File | Tool | Test Description |
|---|---|---|
| tests/lab-01/api-01-health.test.ts | Supertest | Health endpoint returns 200 and expected JSON |
| tests/lab-01/api-02-categories.test.ts | Supertest | Categories endpoint returns the four seeded categories |
| tests/lab-01/UI-01-heading.test.tsx | Vitest | TokTickIT heading renders |
| tests/lab-01/UI-02-loading-list.test.tsx | Vitest | Loading state changes to category list |
| tests/lab-01/UI-03-api-error.test.tsx | Vitest | API failure displays a useful error message |

_Test output evidence to be attached when tests pass on `main`._
