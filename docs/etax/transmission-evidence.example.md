# Example T-O2 evidence (structure only — not tip / not NTA).
# Copy to data/etax/transmission-test/ and fill with real values after Windows --env test run.
# Do not commit real evidence. Do not use MOCK-NOT-NTA- or XU00S010.
schema_version: 1
# JSON form for orgos etax transmission-test record --from:
# {
#   "schema_version": 1,
#   "procedureCode": "RHO0010",
#   "env": "test",
#   "receiptNumber": "<NTA receipt>",
#   "requestId": "<host request id>",
#   "xmlHash": "sha256:...",
#   "submittedAt": "2026-09-21T00:00:00.000Z",
#   "hostMethodsCalled": ["SignToReport", "Send", "GetResponse"]
# }
