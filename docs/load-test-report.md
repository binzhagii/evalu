# evalU load test report

Run: 2026-11-21T03:20:59.856Z · Node v24.21.0 · AMD Ryzen 5 5500GT with Radeon Graphics · 16 GB RAM

**35 simulated users at the same time.** Each signs in, loads their data and submits one evaluation (when they have one open).
All requests finished in **0.99 s**, with **0 server error(s)**; 17 evaluations were submitted.

| Request | Count | Average (ms) | 95th percentile (ms) | Slowest (ms) |
|---|---|---|---|---|
| Sign in | 35 | 274 | 483 | 483 |
| Load own data | 35 | 268 | 638 | 742 |
| Submit an evaluation | 17 | 251 | 637 | 637 |

Notes: the server runs on the same computer as the test, with the sample data. Sign-in is deliberately slow (scrypt password hashing protects stored passwords). This measures prototype capacity only; it is not an institution-wide load test.
