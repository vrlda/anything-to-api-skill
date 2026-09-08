# Discovery and repair

Install or expose `skills/anything-to-api` to an agent. `/api <url>` means learn or update a local definition. Discovery is capability-driven: prioritize meaningful actions requested by the user instead of exhaustively crawling a site.

The agent inventories navigation, exercises safe representative flows, captures network traffic, correlates requests to UI actions, classifies dynamic values, independently replays candidates, generalizes arguments and outputs, writes a spec, validates it through bundled skill helper, then verifies read operations through runtime. These mechanics remain internal; user interacts through natural-language requests.

Write, destructive, financial, and external-communication actions require explicit user authorization before test execution. They may be documented from observation without causing the external effect.

On breakage, preserve the command name and arguments when possible. Re-observe its provenance flow, identify the smallest transport or extraction change, update validation metadata, and retry. Never replace working commands during an unrelated repair.
