# Verification

Bun 1.2.17, TypeScript 5.8.3, macOS. 15 tests (93 assertions) and strict TypeScript checks pass. Tests cover wire contracts, costs/errors, single-model selection, independent results files, reloading, traversal protection and exclusion of simulated reports from the saved-run list.

61 real images were copied byte-for-byte; 56 unique images enter the dataset. The UI starts with zero results. No authenticated live calls were made during implementation. Actual model behavior and billing require the user's key.

Live UI runs use one receipt and one model. CLI runs may include the full dataset but exactly one model. Both write an independent results file; loading for presentation makes no request to Liquid.
