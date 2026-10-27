# Official Liquid Decision API contract

Verified against official sources on 2026-10-27; not an authenticated live conformance certification.

- [Hosted API reference](https://docs.liquid.ai/lfm/models/d1): image inputs, question schemas, response examples, limits and usage.
- [Decision models](https://docs.liquid.ai/lfm/models/decision-models): primitives and hosted model context.
- [d1 launch](https://www.liquid.ai/blog/d1-decision-model): original d1 vision API example.
- [d1-ultra launch](https://www.liquid.ai/blog/d1-ultra): d1-ultra vision API example.
- [Pricing](https://www.liquid.ai/pricing): published input rates, d1 $0.02/M and d1-ultra $0.042/M.

## Wire contract

`POST https://api.liquid.ai/decisions/v1/systemone`, bearer authorization, JSON body. `model` selects the model, `state` provides context, `images` is a top-level array of base64 data URLs, `questions` maps names to typed questions. Binary is spelled `noul`, not `binary` or `boolean`; it takes `instructions` and no criteria. `choice` takes `instructions` and a named `criteria` object mapping option labels to descriptions. This project does not need the third primitive, `score`, whose criteria are an ordered array.

Minimal illustrative request (replace image placeholder):

```json
{
  "model": "d1-ultra",
  "state": "Evaluate the receipt image.",
  "images": ["data:image/png;base64,<BASE64_BYTES>"],
  "questions": {
    "valid": {"type": "noul", "instructions": "Is this a purchase receipt?"},
    "category": {
      "type": "choice",
      "instructions": "Classify the primary purchase.",
      "criteria": {"meals": "Restaurant food", "other": "Other purchase"}
    }
  }
}
```

Illustrative response (probabilities are invented, not observed):

```json
{
  "model": "d1-ultra",
  "answers": {
    "valid": {"type": "noul", "noul": 0.9},
    "category": {
      "type": "choice", "choice": "meals",
      "probabilities": {"meals": 0.8, "other": 0.2},
      "confidence": 0.7
    }
  },
  "usage": {"input_tokens": 2000, "output_tokens": 0}
}
```

Noul is a scalar P(yes); the CLI derives P(no). Choice includes the complete `probabilities` map, selected `choice`, and separate `confidence`. `usage.input_tokens` covers all billed questions/images; use it directly for cost. The adapter allows extra response fields and validates all five requested answers. A 0.01 sum tolerance accommodates rounding in probability maps; it never rescales them.

## Image constraints

The documentation also accepts `{ "content_type": "image/png", "base64": "..." }` in the images array. Remote URLs are not accepted. The CLI uses data URLs and a conservative PNG/JPEG/WebP subset; docs additionally list GIF. It sends one image per request, below the documented maximum of eight. Documentation lists a 4.5 MB JSON body limit, 10,000 aggregate 32×32 patches, and a maximum aspect ratio of 100. The CLI validates signature and body size; the provider validates dimensions and patch count.

Each question is billed separately for its text and all images. Documented image accounting is `ceil(ceil(width/32) * ceil(height/32) * 1.5)` tokens per image per question. This repository does not estimate text tokens or add image tokens to reported usage, preventing double counting.

## Version caveat

Hosted docs now use d1.1; the requested d1 ID is retained based on its official launch API example. Availability must be checked with your API key. HTTP 404/422 errors mention this caveat; there is no fallback to a different model. No gateway response format is assumed.
