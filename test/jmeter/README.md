# JMeter Load Tests — P2P-EMRS API

## Test Plan

`p2p-emrs-load-test.jmx` — 4 concurrent user scenarios:

| Scenario | Threads | Endpoints |
|----------|---------|-----------|
| Auth Flow | 20 | POST /auth/login, GET /auth/me |
| Vehicle Browse | 50 | GET /vehicles/available (with + without location filter), GET /vehicles/:id, GET /reviews/vehicle/:id |
| Booking Flow | 10 | POST /auth/login, GET /bookings |
| Owner Flow | 5 | GET /vehicles/my-vehicles, GET /payments/owner-earnings, GET /owner-bookings |

## Performance Targets

| Endpoint category | Target p95 latency |
|-------------------|--------------------|
| Public reads (vehicles list) | < 500 ms |
| Location-filtered reads | < 800 ms |
| Authenticated reads | < 1 000 ms |
| Aggregation (earnings) | < 1 500 ms |

## Running

### Prerequisites

- Apache JMeter ≥ 5.6 installed (`brew install jmeter` on macOS)
- API server running locally (`npm run start:dev`)
- Seed data loaded (at least one vehicle and one user per role)

### Non-GUI (CI) mode

```bash
# Run and generate HTML report
jmeter -n \
  -t test/jmeter/p2p-emrs-load-test.jmx \
  -l test/jmeter/results/results.jtl \
  -e -o test/jmeter/results/report/

# Custom parameters
jmeter -n \
  -t test/jmeter/p2p-emrs-load-test.jmx \
  -l test/jmeter/results/results.jtl \
  -JBASE_URL=staging.dreamride.vn \
  -JPORT=443 \
  -JRAMP_UP=30 \
  -JDURATION=120
```

### GUI mode (debugging)

```bash
jmeter -t test/jmeter/p2p-emrs-load-test.jmx
```

## Results

Results are written to `test/jmeter/results/results.jtl` (gitignored).  
HTML dashboard generated at `test/jmeter/results/report/index.html`.
