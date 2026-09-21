# Integrating the HFSecurity VP930 palm-vein scanner

Written 2026-09-21 from the vendor package on the founder's desktop
(`palm-VP930 local verify/`): the Windows/Linux and Android SDK user guides, the
`Windows & Linux SDK Process Description`, the LED effect table, and the actual
C++ headers and sample source extracted from
`vp930-sdk-linux-x86_64-v1.3.58-P.zip`.

No hardware has arrived yet. This document exists so that when it does, the work
is mechanical. It records what the SDK really does, where our current code
disagrees with it, and what we must ask HFSecurity before committing to a
design.

---

## 1. What the device actually is

The VP930 / VP930Pro is a **USB palm-vein camera module with an on-board
algorithm pipeline** — not a standalone terminal. It always hangs off a host.

| Host | Support | Notes |
| --- | --- | --- |
| Windows x86_64 | yes | must install `driver/WinUsb-InstallDriver.exe` first |
| Linux x86_64 / aarch64 / armv7l | yes | root, or run `scripts/setup_udev_rules.sh` once |
| Android 6.0+, arm64-v8a / armeabi-v7a | yes | USB host/OTG; runtime USB permission via `DtUsbManager` |

The SDK ships `libpalm_sdk.so` + `libdim_palm.so` and a ~31 MB model blob
(`config/palm_models_1.3.5.bin`). API surface is C++11. The Android SDK is a
thin Java layer over the same algorithm.

Two imaging paths are used together: **IR** (the vein pattern) and **RGB**
(colour, used for liveness and as a second modality).

---

## 2. Five facts that decide the architecture

These are the constraints that are not negotiable, each verified against the
headers or the sample rather than the prose.

### 2.1 Every algorithm call needs an *open device*

```cpp
// include/palm/palm_arithmetic.h
static int Create(std::shared_ptr<Device> device, std::shared_ptr<PalmCapture>* palm);
```

`PalmCapture` is constructed *from a device*, and the vendor's own sample guards
every algorithm entry point with an open-device check — including the two that
look like pure functions:

```cpp
// samples/src/sample/palm_device.cc
void PalmDevice::CompareFeaturesScore() {
  if (!is_open_) { std::cout << "[Test] open device first"; return; }
  ...
  palm_->ExtractPalmFeaturesFromImg(...);
  std::dynamic_pointer_cast<StreamPalm::ComparePalmCapture>(palm_)
      ->CompareFeaturesScore(ir_score, rgb_score, ...);
}
```

There is no device-free "compare these two vectors" entry point anywhere in
`compare_arithmetic.h`, `palm_arithmetic.h` or `arithmetic_device.h`.

**Consequence:** the sovereign matcher behind `PALM_MATCH_URL` cannot be a plain
Linux container. It needs a VP930 physically attached to the matching host, or a
headless/server build from HFSecurity. This is question 1 in §7.

### 2.2 The SDK does 1:1 only

```cpp
virtual int CompareFeaturesScore(float& ir_score, float& rgb_score,
                                 const std::vector<float>& ir_features_source,
                                 const std::vector<float>& ir_features_target,
                                 const std::vector<float>& rgb_features_source,
                                 const std::vector<float>& rgb_features_target,
                                 RecognizeMode recog_mode) = 0;
```

Exactly one pair, one score. There is no gallery, no enrol-to-database, no
identify. **1:N is entirely our problem** — see §5.

### 2.3 Algorithm calls require a licence written to the device

`ArithmeticDevice::WriteLicense(const std::string&)` /
`ReadLicense(std::string&)`. The Windows guide states plainly: *"Algorithm
related interfaces require a valid license to use."* Two error codes exist for
getting this wrong: `0x23008` (failed to obtain licence) and `0x42021`
(unactivated algorithm).

The licence lives **on the device**, which means the cost model is likely
per-unit. Confirm before pricing terminals.

### 2.4 Registration and verification are different calls with different bars

| | enrolment | verification |
| --- | --- | --- |
| call | `RegisterPalm(RegisterPalmOutput&, const RegisterPalmInput&)` | `ExtractPalmFeaturesFromImg(...)` |
| quality gates | strict — a separate set of `REGISTER_*` result codes with tighter thresholds | looser |
| extra outputs | `hash_ir_output`, `hash_rgb_output`, bounding boxes | none |

Use `RegisterPalm` **only** at enrolment. Using the looser call to enrol would
bank a poor template forever and quietly raise the false-reject rate for that
customer for the life of their account.

### 2.5 The matching threshold is the SDK's to give, not ours to guess

```cpp
virtual int GetRecognitionThreshold(float& ir_threshold, float& rgb_threshold,
                                    RecognizeMode recog_mode) = 0;
```

`PALM_MATCH_THRESHOLD=0.82` in `.env.example` is a number I made up months ago.
Replace it with the SDK value read at matcher start-up, per recognition mode,
and keep the env var only as an override that can *tighten* it.

---

## 3. Where our current code disagrees with the SDK

### 3.1 We store one string; the SDK produces nine fields

Live schema (verified against the database, not the migrations):

```
customers.palm_vein_template  text
customers.palm_simulated      boolean
customers.has_palm_template   boolean (generated)
```

`RegisterPalmOutput` actually yields:

| field | type | why we need it |
| --- | --- | --- |
| `ir_features` | `vector<float>` | the template we match on |
| `rgb_features` | `vector<float>` | **required for `kBiModal`** |
| `skeleton` | `vector<float>` | key points; useful for future re-scoring |
| `palm_type` | `int` | left/right — never compare across hands |
| `hash_ir_output` / `hash_rgb_output` | bytes | the guides say these are *"used for model switching"* — i.e. they are how a template survives a model upgrade |
| `score` | float | enrolment quality, worth keeping for audit |
| `palm_box`, `palm_center_box` | int[4] | capture geometry |
| `result` | `PalmDetectResult` | why a capture was rejected |

Most important: `RegisterPalmInput.recog_mode` **defaults to `kBiModal`**, which
needs both IR and RGB features at compare time. With one text column we can
never do bimodal. We are currently locked into the weakest mode by our schema.

### 3.2 We do not record the mode or the algorithm version

`matchPalm()` hardcodes `mode: "kRegIrVSIr"`. If enrolment ever runs in a
different mode, or the model blob is upgraded, matching silently degrades with
no way to tell which templates are affected. Store `recog_mode` and
`GetAlgorithmVersion()` **on each template row**.

### 3.3 `palmType` is documented inconsistently by the vendor

Within a single header, `palm_arithmetic.h`:

- `CapturePalmResult` → `// 0:left_palm 1:right_palm`
- `ExtractPalmFeaturesFromImg` → `@param[out] palm_type 0:right_palm 1:left_palm`
- `RegisterPalm` → `@param[out] palm_type 0: left palm, 1: right palm`

The Windows guide says 0 = right; the Android guide says 0 = left.

`packages/shared/src/features/biometrics/palmScanner.ts` currently asserts
`0 = left, 1 = right`. **Do not attach meaning to this value.** Store it,
compare like-for-like, and only label it in the UI once it has been confirmed
against real hardware.

### 3.4 Feature encoding differs between platforms

Linux/Windows return `std::vector<float>`; Android returns `byte[]`. If agents
enrol on a Windows laptop and merchants verify on an Android terminal, the
serialisation must be identical. Unconfirmed — question 2 in §7.

### 3.5 Our capture hints are a partial copy of the SDK's

`CAPTURE_HINTS` covers 7 of the 20+ values in `PalmDetectResult` / the Android
`Hint` enum. The full set, with the vendor's own English copy, is in §8.

---

## 4. The three integration surfaces

```
  (A) agent enrolment            (B) merchant checkout         (C) matcher
  Windows laptop or              Android POS/tablet            Linux host
  Android tablet + VP930         + VP930 over OTG              + VP930 + licence
        |                              |                             |
        | RegisterPalm                 | ExtractPalmFeaturesFromImg  |
        v                              v                             |
   enrol-customer  ---------->  process-payment  --- PALM_MATCH_URL ->|
   (Edge Function)              (Edge Function)                       |
        |                                                    CompareFeaturesScore
        v                                                             |
   customers.palm_* <----------------------------------------- templates in RAM
```

### (A) Agent enrolment

The agent portal is a Vite web app. It reaches the scanner through the native
bridge the rugged Android shell injects into the webview — the contract already
sketched in `palmScanner.ts` as `window.MiliPayPalmBridge`. For a Windows agent
kit the same contract is served by a small local HTTP/WebSocket daemon wrapping
the C++ SDK, so the web layer does not care which host it is on.

Call order:

```
DeviceManager::GetInstance()
  -> GetDeviceList()
  -> CreateDevice(info)
  -> Open()
  -> PalmCapture::Create(device, &palm)
  -> WriteLicense(...)            once, at provisioning
  -> SetPalmModelPath(config/)
  -> CapturePalmOnce(cb, timeout) // drives the live preview + hints
  -> RegisterPalm(out, in)        // in.recog_mode = kBiModal
  -> Close()
```

### (B) Merchant checkout

Same sequence, but `ExtractPalmFeaturesFromImg` instead of `RegisterPalm`, and
the features go to `process-payment`. The merchant terminal is an Android host,
so this is the Android SDK (`capturePalmOnce` → `extractPalmFeaturesFromImg`).

The terminal must **never** hold the customer gallery. It sends features up; the
matcher decides.

### (C) The matcher

`supabase/functions/_shared/biometrics.ts` already fails closed when
`PALM_MATCH_URL` is unset, which stays correct. What changes is the
implementation behind it, and §2.1 means it needs hardware or a vendor headless
build.

---

## 5. The merchant 1:N problem

"Customer walks up, puts palm down, we know who they are" is **1:N
identification**. The SDK gives us 1:1 verification. Bridging that gap is on us,
and there are only two honest options:

**(a) Narrow to 1:1 first.** Customer enters phone number, taps a card, or
scans a QR, then the palm verifies that specific claimed identity. One
`CompareFeaturesScore` call. Works with what we have, bounded latency, and is
how most palm-payment deployments actually run.

**(b) True 1:N.** The matcher loops `CompareFeaturesScore` across the gallery.
Each call is a native algorithm invocation on a device-bound pipeline — the cost
per comparison is unknown until we can measure it, and it is unlikely to scale
to a national customer base without bucketing (by `palm_type`, by merchant
region, by a coarse vector prefilter) or a vendor-supplied index.

**Recommendation: ship (a), keep the `PALM_MATCH_URL` interface unchanged so
(b) can be swapped in behind it.** The interface already hides the difference —
`matchPalm()` returns a `customerId` either way. Adding an optional
`customerHint` to the request body is the whole change needed on our side.

---

## 6. What we can do now, before hardware arrives

None of this needs a scanner:

1. **Widen the schema.** A `palm_templates` table — one row per enrolled hand —
   carrying `ir_features`, `rgb_features`, `skeleton`, `palm_type`,
   `hash_ir`, `hash_rgb`, `recog_mode`, `algorithm_version`, `quality_score`,
   `enrolled_at`. Keep `customers.palm_vein_template` until it is migrated.
   Raw templates stay under the same column-grant lockdown as NIN/BVN.
2. **Extend the bridge contract** in `palmScanner.ts` to carry the full
   `RegisterPalmOutput`, and split `capturePalmTemplate()` into
   `registerPalm()` (enrolment) and `extractPalmFeatures()` (verification), per
   §2.4.
3. **Make the threshold SDK-supplied** — matcher reads
   `GetRecognitionThreshold()` at start-up and reports it in a health endpoint.
4. **Complete the hint table** from §8 so the capture UI gives the vendor's own
   guidance.
5. **Wire the LED feedback** from §9; it is the only feedback a customer gets at
   a merchant counter.
6. **Decide (a) vs (b)** in §5 — this is a product decision, not a technical one.

Items 1–5 are safe to build now. They change no behaviour while
`isScannerAvailable()` is false, which it is everywhere today.

---

## 7. Questions for HFSecurity

Ordered by how much they change the design.

1. **Can the algorithm run headless?** We want a Linux matching service with no
   camera attached. The `Windows & Linux SDK Process Description` distinguishes
   an *offline version* from a *cloud version* call flow — is the cloud version
   a different SDK build, and does it lift the open-device requirement on
   `ExtractPalmFeaturesFromImg` / `CompareFeaturesScore`?
2. **Are feature vectors interoperable across platforms?** Android returns
   `byte[]`, Linux/Windows `std::vector<float>`. Is it the same buffer, and can
   a template enrolled on Windows be matched on Android?
3. **Licence model.** Per device, per seat, or per deployment? Perpetual or
   annual? How is a licence issued, and can one be moved if a unit is replaced?
4. **Template stability across model versions.** The guides say
   `hash_ir_output` / `hash_rgb_output` are *"used for model switching"*. If
   `palm_models_*.bin` is upgraded, do existing templates still match, or must
   every customer re-enrol? This is an existential question for a payments
   rollout.
5. **Is there any 1:N / gallery API** in any SDK build, or a recommended
   indexing approach for large galleries?
6. **What is the feature vector length**, and is it fixed per recognition mode?
7. **Confirm `palm_type` semantics** — your own headers contradict each other
   (§3.3).
8. **Recommended `SetPsensorDistanceThreshold` values** for a counter-mounted
   unit at typical Nigerian indoor lighting.

---

## 8. Capture result codes (vendor's own English copy)

From `PalmDetectResult` in `palm_arithmetic.h` and the Android `Hint` enum.
`REGISTER_*` variants only fire during `RegisterPalm`.

| # | Enum | Message to show |
| --- | --- | --- |
| 0 | `NO_PALM_DETECTED` | No palm detected |
| 1 | `BIG_POSE` | Too big pose |
| 2 | `QUALITY_ERROR` | Please face your palm towards the camera |
| 3 | `REGISTER_QUALITY_ERROR` | Please open and straighten your palms |
| 4 | `LIVENESS_ERROR` | Please face your palm towards the camera |
| 6 | `IR_DARKNESS` | Please palm slightly closer |
| 7 | `IR_OVER_EXPOSE` | Please keep your palms slightly away |
| 8 | `RGB_DARKNESS` | Please palm slightly closer |
| 9 | `RGB_OVER_EXPOSE` | Please keep your palms slightly away |
| 10 | `REGISTER_IR_DARKNESS` | Please palm slightly closer |
| 11 | `REGISTER_IR_OVER_EXPOSE` | Please keep your palms slightly away |
| 12 | `REGISTER_RGB_DARKNESS` | Please palm slightly closer |
| 13 | `REGISTER_RGB_OVER_EXPOSE` | Please keep your palms slightly away |
| 14 | `LIVENESS_COLOR_GRAY_ERROR` | Please face your palm towards the camera |
| 15 | `RELIABILITY_IR_ERROR` | Please ensure your palms are clear and free from any abnormalities |
| 16 | `RELIABILITY_RGB_ERROR` | (as above) |
| 17 | `REGISTER_RELIABILITY_IR_ERROR` | (as above) |
| 18 | `REGISTER_RELIABILITY_RGB_ERROR` | (as above) |
| 23 | `UNEXPECTED_CENTER_BOX_POS` | Please place your palm in the centre of the screen |
| 24 | `ILLEGAL_ENV` | Illegal environment |
| 25 | `PALM_IS_MOVING` | Please keep your palm still |
| 0x4000 | `MANUALSTOP` | Manually stopped |
| 0x8000 | `TIMEOUT` | Capture timeout |
| 0x8888 | `INITIALIZING` | Initialising, please try again |

Liveness (4, 14) must be surfaced to the operator, not swallowed as a generic
retry — it is the anti-spoof signal.

Error codes worth special-casing: `0x21001` device not found, `0x2100C` device
not opened, `0x23008` licence failure, `0x42021` unactivated algorithm,
`0x80020` no palm box detected, `0x22010` timeout.

---

## 9. LED feedback — vendor's recommended mapping

From `Definition Table of Light Effect for Palm Brushing Module`. The number is
the value passed to `SetLedMode` / `setLedMode`.

| State | Effect | Value |
| --- | --- | --- |
| Standby | weak blue | 3 |
| Working | blue breathing | 15 |
| Palm recognition mode | combined effect | 20 |
| Module error (enumeration failure) | red steady | 1 |
| Identification failed | yellow steady | 4 |
| Too close | yellow flashing | 10 |
| Identifying | purple flashing | 11 |
| Identification success | purple steady | 5 |
| Scan mode | lights off | 0 |

`palmScanner.ts` currently exposes only `"green" | "red" | "blue_breath"`. Widen
it to these named states so the bridge can pass the vendor's values through.

---

## 10. Source material

All under `palm-VP930 local verify/` (not in this repo — it is ~900 MB of
vendor binaries):

- `windows user demo and code/doc/VP930 PalmSDK Windows User Guide_20250220.pdf`
- `Android user demo and code/PalmSDK-P Android User Guide_20250220.pdf`
- `windows user demo and code/doc/Windows & Linux SDK Process Description.pdf`
- `windows user demo and code/doc/Definition Table of Light Effect for Palm Brushing Module.pdf`
- `Linux sdk and demo/vp930-sdk-linux-x86_64-v1.3.58-P.zip` → `include/palm/*.h`,
  `samples/src/sample/*.cc` (the authoritative source; the PDFs lag the headers)
- `Android user demo and code/vp930_p_demo_v1.3.57_08131039.apk` — runnable demo
- `HFSECURITY Palm Vein Series---J.pdf` (repo root) — hardware datasheet

Where a guide and a header disagree, **the header wins**.
