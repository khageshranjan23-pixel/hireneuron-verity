# Real-data evaluation input

Create a private JSON file with this shape, filling it only with collected observations. Empty lists are allowed; missing data returns null, not fabricated metrics.

```json
{
  "speech": [{"reference": "human checked transcript", "hypothesis": "actual STT output"}],
  "latency_ms": [],
  "scores": [{"human": 3, "model": 3}],
  "events": {
    "truth": [{"session": "actual-id", "role": "secondary", "type": "MULTIPLE_PERSONS", "start": 15, "end": 20}],
    "predicted": [],
    "benign_hours": 0
  }
}
```

The text shown above documents schema only; it is not a dataset. Do not commit personal interview data. Command: `python benchmarks/measure.py private_results.json > measured_metrics.json`. The event matcher uses positive temporal intersection, same session/role/type, and one-to-one greedy maximal overlap; document this lenient match rule and improve for your evaluation protocol. Report duration/timing separately. No supplied sample benchmark claims accuracy.
