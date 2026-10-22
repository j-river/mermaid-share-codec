# Contributing

Keep the package focused on sharing and recovering Mermaid source. New renderers,
network services and site-specific business logic belong outside the core.

1. Use Node 22 or later and run `npm ci --ignore-scripts`.
2. Make the change with a behavioral or interoperability test when appropriate.
3. Run `npm run check` and `npm run test:package`.
4. If browser behavior changes, run the browser example and checks with `npm run demo`.

Never change a compatibility fixture merely to make a failing test pass. Record
where it came from and which upstream commit or UI version was observed.
Do not include real user diagrams, credentials or proprietary documents in tests.

Protocol compatibility means independently readable states, not identical
compressed bytes. Include renderer-specific settings only as inert data.
