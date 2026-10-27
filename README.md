# DonvitoCodes Receipt Lab

TypeScript + Bun CLI and local UI for receipt-image decisions using Liquid AI `d1` and `d1-ultra`. Each benchmark run uses exactly **one model** and produces its own JSON results file. The UI shows no generated results until you run the API or load a saved live report.

## Start

```sh
bun install --frozen-lockfile
bun run demo
```

Open the printed URL; use `PORT=4317 bun run demo` to choose another port. The local server binds to 127.0.0.1.

## Run and present results

1. Click **+ New run**, then select one or more receipts using checkboxes (or Select all) and **d1** or **d1-ultra**.
2. Enter your API key, or leave the field blank to use `LIQUID_API_KEY` from the server environment. The key is masked, cleared on submission/cancel, and excluded from results and browser storage.
3. Select **Run N receipts**. Each selected receipt makes **one paid API request** containing five questions. Progress is shown as receipts finish. The response, including any failure, is automatically saved as a unique timestamp/model/UUID JSON file in `results/`.
4. Load it later using **Saved runs → Load run** or **Load file**. No API key or API request is needed to present a saved report. Reports survive a server restart. Each file is loaded separately; results are never silently combined.

The UI shows the model, run time, full probabilities, ground truth where labeled, accuracy coverage, latency and known cost. **Export** downloads the currently loaded report. Matching receipt images from the local dataset are restored when loading saved files. For images outside this project, use **Choose local preview**; images are not embedded in JSON. Simulated reports are rejected by the UI. “Receipts” returns to the unrun dataset.

## CLI: one model per run

```sh
export LIQUID_API_KEY='liquid_your_key'
# Full local dataset, one model:
bun run bench --model d1
bun run bench --model d1-ultra
# Your labeled dataset:
bun run bench --model d1 --dataset /path/to/labels.json
# Optional additional copy at a chosen path:
bun run bench --model d1-ultra --out presentation.json
```

Default model is d1. Each command automatically writes `results/<timestamp>_<model>_<unique-id>.json`; `--out` creates an additional copy. The older `--models` spelling accepts a single model for compatibility; comma-separated model lists are rejected. Failed requests are saved too, and cause CLI exit code 1. Dataset/image preflight errors stop before any paid call and do not create a run report.

The UI and CLI both use the results/ folder in the directory where you launch them. Start both from the same directory to share saved runs. Results are local, ignored by Git, and may contain receipt metadata and model responses.

## Folders and adding new receipts

All data folders are relative to the **working directory where you launch the app**, not a fixed machine path. The UI and CLI follow the same rule:

```text
<launch-directory>/
  receipts/
    dataset.json
    images/
      new-receipt.jpg
  results/             # Created automatically when a run is saved
```

To add receipts:

1. Copy PNG, JPEG or WebP images into `./receipts/images/`.
2. Add one entry per new image to `./receipts/dataset.json`, preserving its existing entries. Use a unique ID and a path relative to the dataset file:

   ```json
   {"id":"receipt-057","image":"images/new-receipt.jpg","labels":{}}
   ```

3. Restart the app, then click **New run** to select the new receipts. Copying an image alone does not register it; the app reads the manifest at startup.

Leave labels empty until reviewed. To calculate accuracy, add booleans for valid/readable/policy/suspicious and one supported category label. Do not put ground truth in image filenames.

Normally, launch from the project directory with `bun run demo`. To keep your receipts in another directory, change into that directory and run the app using the path to its entry file:

```sh
cd /path/to/my-receipt-data
bun /path/to/d1-receipt-lab/src/demo.ts
# Or run the CLI against the same data and results folders:
bun /path/to/d1-receipt-lab/src/cli.ts --model d1
```

That directory must contain `receipts/dataset.json` and its referenced images. The app's HTML stays with its source code; you do not need to copy demo/ into the data folder. The server prints the resolved dataset/results locations when it starts. Explicit CLI `--dataset` and `--out` paths resolve from your working directory; image paths inside a dataset always resolve from that dataset's own directory. `bun --cwd <folder>` changes the working directory and therefore the data location.

## Receipt dataset

All 61 source images were copied unchanged into `receipts/images/`. `receipts/dataset.json` contains 56 unique images; exact duplicates remain on disk but are benchmarked once. `receipts/inventory.json` records filenames, SHA-256 hashes and sample IDs. Labels are empty pending human review, so accuracy is N/A. The six original synthetic image fixtures remain under sample/ for testing only.

A dataset is a nonempty JSON array:

```json
[{"id":"receipt-001","image":"images/receipt.jpg","labels":{"valid":true,"readable":true,"category":"meals","policy":true,"suspicious":false}}]
```

Paths resolve relative to the dataset file. Labels can be omitted. Binary labels are booleans; category is meals, transport, lodging, office or other. Ground truth is never sent to the API. Positional image filenames filter the dataset by exact resolved path. `--threshold 0.7` changes the binary threshold (default 0.5, inclusive). `--timeout-ms 20000` changes the CLI timeout (default 30000).

## Five decisions

- valid (`noul`): purchase receipt containing merchant, date, items and total.
- readable (`noul`): all required fields can be reliably read.
- category (`choice`): primary purchase category.
- policy (`noul`): eligible under the fixed example reimbursement policy.
- suspicious (`noul`): visible alterations or arithmetic inconsistencies; not proof of fraud.

The example policy is in SGD: meals ≤50, transport ≤100, lodging ≤250, office ≤100; no alcohol/tobacco; readable required fields; other categories and unknown currency/amounts rejected. Review this policy for your receipts before interpreting policy predictions or assigning labels.

## Metrics, errors and limits

Binary reports include P(yes) and its complement. Choice retains every category probability, API-selected choice and separate confidence. Accuracy is correct / successfully scored labeled answers; coverage is scored / labeled. Missing labels are excluded; unavailable accuracy is null. Failed requests never count as scored labels.

Latency measures client round-trip time, excluding image loading. Mean/p50/p95 cover successful requests using nearest-rank percentiles; individual failures retain their timings. There is no warm-up, concurrency or retry. The UI runs receipts sequentially with a 15-second timeout per request, and streams progress so larger batches do not wait on one silent connection.

Published rates checked 2026-10-27: d1 $0.020/M input tokens, d1-ultra $0.042/M. Cost is reported aggregate usage.input_tokens × rate / 1e6; never multiply by the question count again. Missing usage gives unknown cost, not zero. Failed or timed-out requests may still have been charged; known costs and unknown counts are separate. These are calculations from published rates, not invoices.

PNG, JPEG and WebP signatures are supported. Files are conservatively limited to 3 MB and JSON requests to 4.5 MB. Pixel/patch/aspect constraints are validated by the API; resize oversized images before benchmarking. Invalid dataset/model/key/image inputs fail clearly. HTTP/network/timeout/JSON/schema failures are retained in reports without automatic retries. Keys and provider error bodies are not logged.

## Official API verification

See [API contract and sources](docs/API.md). Requests use Liquid's /decisions/v1/systemone endpoint, top-level base64 image data URLs, noul instructions and choice criteria maps. Responses use answers.<question>.noul or choice/probabilities/confidence, plus usage.input_tokens. Raw successful responses are retained. No OpenAI chat schema or gateway envelope is assumed.

Current hosted docs feature d1.1 and d1-ultra; the official original d1 launch post documents d1 vision calls. This project retains the requested d1 ID without silently switching models. Check actual availability with your key; 404/422 failures explain the caveat.

## Validation

```sh
bun test
bun run typecheck
```

Tests cover API contracts and probability validation, labels/paths, transport failures, billing/coverage/latency math, single-model enforcement, unique results persistence/reloading and traversal protection. Mocking is confined to explicit offline test workflows; the UI only presents live reports. No authenticated API calls were made during implementation. Review actual model availability and live behavior with your key.
