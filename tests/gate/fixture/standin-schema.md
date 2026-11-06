One finding.

```json
[
  {
    "file": "schema/config.json",
    "line": 30,
    "summary": "The schema's `retryPolicy` enum allows only two values.",
    "failure_scenario": "A config with retryPolicy set to exponential is rejected by the schema."
  }
]
```
