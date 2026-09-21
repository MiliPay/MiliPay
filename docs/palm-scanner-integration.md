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

## 1. What the devices actually are

Three models are planned, all from the same "Advanced RGB + IR Palm Vein
Imaging Module" family, all quoting the same accuracy:

| Model | Role | Form | OS | Accuracy (vendor) |
| --- | --- | --- | --- | --- |
| **HF-VP930PRO** | MVP / prototype | USB scanner module, no screen | host is Android, Windows or Linux | FAR 0.0001%, FRR 0.01%, capacity 20,000 palms |
| **HF-HP605PV** | merchant till | 6" palm-vein POS terminal, EMV/PCI certified | **Android**, 2 GB RAM / 8 GB ROM | FAR 0.0001%, FRR 0.01% |
| **HF-FP08PV** | agent registration | 8" handheld biometric tablet, IP65, 10,000 mAh | **Android 13**, 4–16 GB RAM | FAR 0.0001%, FRR 0.01% |

All three recognise at 7–15 cm and quote 450 ms recognition time. HP605PV and
FP08PV are both multimodal (card / palm vein / QR / face) and both are Android,
which matters: **they run the same Android PalmSDK**, so a template enrolled on
the FP08PV and one captured on the HP605PV come from the same code path in the
same format. The riskiest version of question 2 in §7 — enrol on one platform,
verify on another — does not apply to the production pair.

It does still apply to the **MVP**: the VP930Pro is a bare USB module, and if
it is driven from Windows or Linux during prototyping it produces
`std::vector<float>` while the Android devices produce `byte[]`. Enrolments
captured during the MVP may therefore not be matchable on production hardware.
Treat MVP-era templates as disposable unless the vendor confirms otherwise.

VP930Pro host support:

| Host | Support | Notes |
| --- | --- | --- |
| Windows x86_64 | yes | must install `driver/WinUsb-InstallDriver.exe` first |
| Linux x86_64 / aarch64 / armv7l | yes | root, or run `scripts/setup_udev_rules.sh` once |
| Android 6.0+, arm64-v8a / armeabi-v7a | yes | USB host/OTG; runtime USB permission via `DtUsbManager` |

The SDK ships `libpalm_sdk.so` + `libdim_palm.so` and a ~31 MB model blob
(`config/palm_models_1.3.5.bin`). API surface is C++11. The Android SDK is a
thin Java layer over the same algorithm.

### 1.1 Palm vein or palm print? Both.

The module has **two cameras**, and the SDK returns a separate feature vector
from each:

| | camera | what it sees | SDK field |
| --- | --- | --- | --- |
| **Palm vein** | infrared | the vein pattern *beneath* the skin | `ir_features` |
| **Palm print** | RGB (colour) | the surface — lines, creases, texture | `rgb_features` |

The vendor is explicit that these are two different biometrics: the HF-PA28 in
the same catalogue is described as *"supporting palm print and palm vein
imaging"*.

The vein channel is the strong one. It is subsurface, so it cannot be lifted
from a surface the way a fingerprint can or photographed the way a palm print
can, and it is only present in a living hand — liveness is intrinsic rather
than bolted on. The print channel is a genuine second modality but it is
visible, so on its own it is the weaker of the two.

`RecognizeMode` decides which is compared, and `kBiModal` — the SDK's own
default for registration — uses both. **We store both**, which is why
`palm_templates` has `ir_features` and `rgb_features` and a constraint that
refuses a `kBiModal` row missing its RGB vector.

One caveat: `RegisterPalmInput.palm_rgb_img` is commented *"Input RGB (speckle)
image"*, which would suggest a structured-light depth pattern rather than a
plain colour image. The frame format contradicts it — `CaptureFrame.rgbData` is
documented as `8UC3`, three-channel 8-bit, i.e. ordinary colour — and this SDK
carries other stale comments from a face-recognition lineage (there is still a
`0x23001 Facial algorithm initialization failure` error code and an
`assets/` "Facial Algorithm Model File Directory" in the Android package). The
frame format is more likely right than the comment, but confirm it.

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

`PALM_MATCH_THRESHOLD=0.82` in `.env.example` was a number I made up months
ago. It is now the matcher's job to report `GetRecognitionThreshold()` and the
env var can only ever *tighten* what it reports — see `resolveThreshold()` in
`supabase/functions/_shared/match-math.ts`.

---

## 3. Where our code disagreed with the SDK

> **Status:** 3.1, 3.2 and 3.5 are fixed — see §11. 3.3 and 3.4 are open
> questions for the vendor, not things we can fix. This section is kept because
> it is the reasoning behind the schema, not a to-do list.

### 3.1 We stored one string; the SDK produces nine fields — FIXED

The schema before (verified against the live database, not the migrations):

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

### 3.2 We did not record the mode or the algorithm version — FIXED

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

### 3.5 Our capture hints were a partial copy of the SDK's — FIXED

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

## 5. 1:N — what is possible and what is not

First, a correction that changes the requirement. **"Enrol in Lagos, pay in
Sokoto" does not need 1:N.** Templates live in our database, not on the
scanner. A terminal in Sokoto captures a fresh palm, sends the features to the
matcher, and the matcher compares against the template enrolled in Lagos. The
device is stateless and interchangeable. 1:N versus 1:1 is only about *whether
the customer identifies themselves first*, not about where they enrolled.

With that said, the question "can we search 100 million in seconds" has two
separate answers, and only one of them is about speed.

### 5.1 The search: yes, comfortably

The SDK's `CompareFeaturesScore` is 1:1 and device-bound, so brute-forcing 100M
of them is out — at even 10µs per call that is over 16 minutes per transaction.
That is not how this is built.

Instead the matcher keeps the gallery as an approximate-nearest-neighbour index
in RAM (HNSW or IVF-PQ), retrieves the top *K* candidates by vector distance,
and then calls the SDK's `CompareFeaturesScore` on **those K only** to get the
authoritative score. K is small — 50 to 200.

At 100M vectors of, say, 512 float32 dimensions:

| | raw | PQ-compressed |
| --- | --- | --- |
| memory | ~205 GB | ~10–25 GB |
| ANN query | ~1–5 ms (HNSW) | ~5–50 ms (IVF-PQ) |
| SDK rescoring of K=100 | ~1–10 ms | same |

So sub-second end-to-end at 100M is achievable, and "seconds" is a comfortable
bar. **This part is an engineering problem with known solutions.**

One dependency: it assumes vector distance correlates with the SDK's score
well enough that the true match lands in the top K. That is how every modern
biometric embedding behaves, but it is an assumption about a model we cannot
see, and it has to be measured on real templates before it is relied on. It is
question 9 in §7.

### 5.2 The accuracy: no, not at 100M, and not because of us

This is the part that does not yield to engineering effort.

A 1:N search does not ask "does this palm match that person". It asks "does
this palm match *anybody*". If a single comparison has a false-accept rate of
*FAR*, then searching a gallery of *N* gives roughly **N × FAR** expected false
matches per search:

| gallery | FAR 1e-6 | FAR 1e-8 | FAR 1e-10 |
| --- | --- | --- | --- |
| 10,000 | 1 in 100 | 1 in 10,000 | 1 in 1,000,000 |
| 1,000,000 | 1 per search | 1 in 100 | 1 in 10,000 |
| 100,000,000 | 100 per search | 1 per search | 1 in 100 |

**HFSecurity publishes its own number, and it is the pessimistic end of that
range.** All three models quote **FAR 0.0001%** on the datasheet, which is
**1e-6** — one false accept per million comparisons. (FRR 0.01% = 1e-4, one
wrong rejection per ten thousand, which is fine.)

So the first column of that table is not a guess about our hardware. It is our
hardware:

| gallery searched | spurious candidates per scan, at the vendor's FAR 1e-6 |
| --- | --- |
| 100 | 1 in 10,000 scans |
| 1,000 | 1 in 1,000 scans |
| 10,000 | 1 in 100 scans |
| 1,000,000 | **1 every scan** |
| 100,000,000 | **100 every scan** |

To get a 1-in-a-million chance of billing the wrong person at 100M you would
need a FAR around 1e-14. Nothing in this class of device is within eight orders
of magnitude of that.

There is a second, blunter signal in the datasheet: the VP930Pro's stated
**capacity is 20,000 palms**. Other modules in the range say 10,000. That is
nominally about on-device storage in standalone mode, but it is also the
clearest statement of what the vendor built this for — and 20,000 is not
100,000,000. Worth asking them directly what gallery size they will stand
behind.

This is not a MiliPay limitation and not an HFSecurity limitation — it is why
Aadhaar does 1:N deduplication over 1.3 billion **offline, in batch, using ten
fingerprints plus two irises plus a face**, and still flags cases for human
adjudication. It is also why Amazon One and Tencent's palm payment both bind
the palm to an account at enrolment rather than identifying from the palm alone
against everyone.

Worth noting the table cuts the other way too: **the problem starts well before
100M**. At a million customers and FAR 1e-8, one scan in a hundred matches a
stranger. Pure 1:N is not something that works now and breaks later; it needs
the mitigation from the start.

### 5.3 What actually gets you there: partition the gallery

Gallery size is the dominant term, and it is the one we control. Ask the
customer for the **last few digits of their phone number** before they present
their palm. Each digit divides the gallery by ten.

Working rule: **keep the searched gallery at or below about 1,000.** At the
vendor's FAR that holds spurious candidates to roughly 1 in 1,000 scans, which
the ambiguity guard in §5.4 can then absorb.

| customers | digits needed | resulting gallery |
| --- | --- | --- |
| 100,000 | 3 | 100 |
| 1,000,000 | 4 | 100 |
| 10,000,000 | 5 | 100 |
| 100,000,000 | 6 | 100 |

Note what this says: **4 digits is right for the first million customers, not
forever.** The number of digits has to grow with the customer base, roughly
`log10(customers) - 4`. Build the keypad to take a configurable length rather
than hard-coding four, so it is a setting rather than a migration.

A few digits on a keypad is two or three seconds, and it buys more safety than
any threshold tuning available to us — more, even, than switching to bimodal.

The customer experience is still "palm to pay". They are not typing a phone
number, an account number or a PIN, and they can use any terminal anywhere in
the country, which was the actual requirement.

**Recommendation:** palm + 4 digits as the default, with full 1:1 (phone, card
or QR) available as a fallback when a scan is refused. Unpartitioned 1:N stays
in the interface and can be switched on per merchant once there is measured FAR
data from real hardware to justify it.

### 5.4 What is already built for this

The interface makes all three shapes the same call, so the product decision can
change without touching any caller:

| request | search | `palm_match_events.mode` |
| --- | --- | --- |
| `customerHint` set | 1:1 against that customer | `1:1` |
| `partitionKey` set | 1:N over the matching bucket | `1:N`, with `gallery_size` |
| neither | 1:N over everything | `1:N` |

Three safety properties are enforced in `_shared/match-math.ts`, which has zero
imports so the test suite runs the exact arithmetic that authorises payments:

1. **The threshold is the SDK's.** The matcher reports
   `GetRecognitionThreshold()`; `PALM_MATCH_THRESHOLD` may only raise it, never
   lower it. A bad deploy cannot make matching more permissive than the vendor
   allows.
2. **An unclear winner is refused.** If the best candidate is not ahead of the
   runner-up by `PALM_MATCH_MIN_MARGIN` (default 0.05), the result is
   `ambiguous` and the payment declines. Two people at 0.86 and 0.855 is a coin
   toss, and at a till a coin toss debits the wrong account. The guard applies
   to 1:N only — a 1:1 check has no field to be ambiguous within.
3. **Every attempt is recorded.** `public.palm_match_events` stores the top
   score, the runner-up, the threshold, the gallery size and the latency, with
   no biometric data. The margin between first and second place, tracked across
   the estate, is the early warning that a gallery has outgrown its threshold —
   and it shows up long before the first customer is charged for someone else's
   shopping. A 1:N system operated without this measurement is operated blind.

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
6. **Add the 4-digit entry step** to the merchant checkout UI and pass it as
   `partitionKey`. This is the single highest-value safety measure available
   and it needs no hardware to build.

Items 1–5 are done — see §11. They change no behaviour while
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
9. **Does plain vector distance (cosine or L2) on the feature vectors rank the
   same way `CompareFeaturesScore` does?** Our 1:N design retrieves candidates
   with an ANN index and rescores the top K with the SDK. That only works if
   the true match reliably lands in the top K. If the SDK applies a learned
   metric rather than a plain distance, we need to know before building the
   index.
10. **The datasheet says FAR 0.0001% — at what threshold, on what test
    population, and is that the 1:1 figure or a 1:N figure?** §5.2 is
    arithmetic on this number, so its provenance matters.
11. **The datasheet says capacity 20,000 palms.** Is that on-device storage in
    standalone mode, or the largest gallery the algorithm is claimed to
    separate reliably? What gallery size will you stand behind?
12. **Are FP08PV and HP605PV running the same algorithm and model blob as the
    VP930Pro?** A template enrolled on the FP08PV has to match on the HP605PV,
    and MVP enrolments captured via the VP930Pro on Windows have to survive the
    move to Android — or we plan to discard them.
13. **Is `palm_rgb_img` a plain colour image or a structured-light speckle
    pattern?** The header comment and the frame format disagree (§1.1).

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
---

## 11. What has been built

All of this landed before hardware arrived and changes no behaviour while
`isScannerAvailable()` is false, which it is everywhere today.

### Database — `20260921105235_palm_template_storage.sql` (applied)

`public.palm_templates`, one row per enrolled hand, holding `ir_features`,
`rgb_features` and `skeleton` as packed little-endian float32 in `BYTEA`, plus
`hash_ir`/`hash_rgb`, `recog_mode`, `algorithm_version`, `feature_dim`,
`quality_score`, `capture_result`, `palm_type` and `simulated`.

- RLS enabled **and forced**; `authenticated` has no table-wide SELECT, only a
  column grant covering the metadata. The feature columns are readable by
  `service_role` alone — verified by query, not assumed.
- Check constraints refuse the states that would produce an unmatchable
  template: `kBiModal` without an RGB vector, an active row whose
  `capture_result` was non-zero, a row with no features at all.
- A partial unique index allows one live template per hand; replaced templates
  are **retired, not deleted**, because "which template authorised this
  payment" has to stay answerable after a customer re-enrols.
- `palm_enrolment_state(customer_id)` returns metadata only, and restates the
  policies internally because `SECURITY DEFINER` bypasses them.

`public.palm_match_events` records the arithmetic of every match attempt — top
score, runner-up, threshold, gallery size, latency, decision — and no biometric
data. See §5.4 for why this is not optional.

### Edge functions

- `_shared/match-math.ts` — **new, zero imports**, so the Node test suite runs
  the exact arithmetic that authorises payments. Holds `resolveThreshold`,
  `resolveMargin`, `decideMatch`, `featuresSatisfyMode`.
- `_shared/biometrics.ts` — 1:1 / partitioned / full 1:N behind one call;
  SDK-supplied threshold; ambiguity guard; separate timeouts for 1:1 (3s) and
  1:N (8s).
- `enrol-customer` — accepts the structured `palm` payload, refuses a capture
  the SDK itself rejected (`captureResult != 0`) and a `kBiModal` enrolment
  missing its RGB vector, writes the template row. Still writes the legacy
  column; the payload is optional so field shells on the v1 bridge keep working.
- `process-payment` — passes `customerHint`/`partitionKey` through and records
  a match event on **both** the success and the failure path.

### Client

`packages/shared/src/features/biometrics/palmScanner.ts`:

- `registerPalm()` and `extractPalmFeatures()` split along the SDK's own
  register/verify boundary (§2.4). `capturePalmTemplate()` remains as a
  deprecated shim.
- Bridge contract v2, with a documented fallback to the v1 `capturePalm` so an
  un-updated Android shell degrades rather than breaks.
- `CAPTURE_RESULTS` — the complete 24-entry table, with `register` and
  `security` flags so liveness and reliability failures can be surfaced as the
  anti-spoof signals they are instead of generic retry noise.
- `PALM_LED_MODES` — the vendor's own nine values.

### Tests

`tests/palm-matching.test.ts`, 26 tests. The ones that matter:
the environment cannot loosen the SDK's threshold; a 1:N result whose runner-up
is within the margin is refused; that guard does **not** fire on a 1:1 check; a
NaN score is rejected rather than treated as passing.

Full suite: 63 tests. All four portals typecheck. The schema snapshot was
re-baselined and the drift auditor flags no new risks.

### Still to do

- The 4-digit entry step in the merchant checkout UI (§6 item 6) — the single
  highest-value safety measure, and it needs no hardware.
- The matcher service itself, which is blocked on vendor questions 1, 2 and 9.
- Migrating existing `customers.palm_vein_template` rows, which cannot happen
  until there are real templates to migrate.
