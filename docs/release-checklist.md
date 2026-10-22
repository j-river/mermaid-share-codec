# Release checklist

The GitHub source repository is public. npm v0.1.0 remains a release candidate
until the maintainer completes registry authentication and publishing.

- [ ] Confirm npm account ownership and final package name; a registry E404 is not a reservation.
- [x] Confirm the GitHub repository destination and MIT license choice.
- [x] Run `npm run check`, `npm run test:package` and the real browser checks.
- [x] Inspect `.artifacts/package-report.json`, the tarball, and `git ls-files` in the clean project repository.
- [x] Verify source/config/keys and unrelated private site files are absent.
- [ ] Review README and homepage/repository/bugs URLs; remove the release-candidate note only when the real install path is available.
- [x] Create/push the reviewed GitHub repository.
- [ ] Publish from the maintainer's npm account with its required authentication.
- [ ] Install the public version in a new directory and verify both API and CLI.
- [ ] Configure trusted publishing only if requested, retaining a maintainer release gate.
- [ ] Switch the site's reviewed adapter from the local tarball to the exact registry version and run its regressions before deployment.

CI configuration alone is not evidence of a remote passing run. Do not mark
the site as deployed or a package as published based on a local smoke test.
