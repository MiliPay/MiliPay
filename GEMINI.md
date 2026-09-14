# Project Rules & Guidelines

## Design & Styling Guidelines
- **Color Consistency**: Always use the defined project brand colors (e.g., `signal`, `ledger`, `ink`, `status-info`, `status-warn`, `status-ok`, `status-fail`). 
- **Avoid Hardcoded Colors**: NEVER use raw Tailwind colors like `blue-400` or `red-500` unless explicitly requested. Ensure the UI remains cohesive and relies on the theme variables.

## Portal Terminology & Roles (STRICT)
Never mix up these three distinct portals and their associated roles:
1. **Agent Portal (`agent-portal`)**: Used strictly by **Field Agents** (`role: 'agent'`). Their job is to register customers in the field and handle physical walk-in complaints.
2. **Service Portal (`service-portal`)**: Used strictly by **Support Staff** (`role: 'support'`). Their job is to handle digital Live Chats coming from the mobile app.
3. **Admin Panel (`AdminPanel`)**: Used by **Admins/Super Admins** (`role: 'admin'`). They handle escalated, high-complexity tickets sent from either Field Agents or Support Staff.

## Ticketing Business Logic
All support workflows follow a Two-Tier resolution structure where a Formal Ticket ID (`TKT-XXXX`) is ONLY generated upon resolution or escalation.

**Workflow A: Online Live Chat (Support Staff)**
1. **Informal Chat**: Customer starts a Live Chat in the Mobile App. It drops into the `service-portal` queue. No Formal Ticket ID exists yet.
2. **Resolution (Solve)**: If Support Staff fixes it during the chat, they click "Solve". The system retroactively generates a Ticket ID (`TKT-XXXX`) for the archive and stamps `solved_by` with the Support Staff's ID.
3. **Escalation**: If Support Staff cannot fix it, they click "Escalate", enter a Subject/Title, and the system generates a Ticket ID. The ticket is moved to the `AdminPanel`.

**Workflow B: Physical Walk-in (Field Agent)**
1. **Physical Dialogue**: A customer physically approaches a Field Agent with a complaint.
2. **Formalize**: The Field Agent searches for the customer's name in the `agent-portal` and inputs the complaint details based on their dialogue.
3. **Resolution (Solve)**: If the Field Agent can solve it on the spot, they create and instantly "Solve" the ticket. It generates a Ticket ID and logs the Field Agent under `solved_by`.
4. **Escalation**: If the Field Agent cannot solve it, they create the ticket and immediately escalate it to the Admin. The generated ticket goes to the `AdminPanel`.

## Monorepo Architecture (STRICT)
This project is an **npm workspace monorepo**. You must respect the boundaries and shared nature of the codebase:
- **`packages/shared/`**: Contains the core logic, API calls, Supabase connections, global types, and shared React UI components. Changes here affect ALL web portals.
- **`mobile-app/`**: The React Native / Expo application for the customers.
- **`AdminPanel/`, `agent-portal/`, `service-portal/`, `website/`**: Independent web applications that consume the shared packages. Do not duplicate API calls or UI components inside these specific apps if they belong in the shared package.

## Communication Strategy (Cost Optimization)
- **Primary Method**: Email MUST be the primary default communication method for user onboarding, password generation, and authentication to optimize operational costs during the MVP phase.
- **Future SMS Architecture**: While SMS (e.g., via Termii) is disabled for standard onboarding to save costs, the system architecture and edge functions MUST be designed to easily toggle or re-integrate SMS in the future. Do not hardcode systems that rely exclusively on email without leaving room for a phone-based fallback.

## Biometric & Hardware Tiering Strategy (HFSecurity Ecosystem)
- **Field Agent Device (`HF-FP08PV`)**: Rugged Android 13 handheld tablet equipped with a 10,000mAh battery, IP65 protection, 4G LTE, OCR/MRZ camera for National ID (NIN) / passport capture, and built-in palm vein scanner. Used exclusively by Field Agents (`role: 'agent'`) for roaming on-site customer and merchant enrollment without carrying separate laptops.
- **Prototype / Development MVP (`HF-VP930Pro`)**: Multi-OS USB Type-C scanner module (Android/Windows 10+/Linux). Used for development, local testing, benchmarking the C++ matching engine, and rapid prototyping.
- **Merchant POS Terminal (`HF-HP605PV` - Primary, `HF-MP50` - Secondary)**:
  - **Primary (`HF-HP605PV`)**: Selected for commercial rollout due to **EMV & PCI Certification** (mandatory for financial switch/CBN regulatory compliance), larger 6.0" IPS display, 3000mAh battery (essential for Nigerian retail power stability), and ≤450ms biometric recognition.
  - **Secondary / Budget (`HF-MP50`)**: Android 11 POS terminal (5.5" display, 1800mAh battery, 4GB RAM + 64GB ROM) as a lower-cost alternative where PCI/EMV is not strictly enforced.
- **Future Enterprise Expansion (Desktop & Floor Kiosks)**: For high-volume supermarket chains (e.g. Shoprite, Spar, Ebeano), self-checkout Desktop Kiosks and Floor-Standing Kiosks with 58/80mm thermal receipt printers and integrated palm sensors.
- **Local SDK Over Third-Party Cloud (Data Sovereignty STRICT)**: Under CBN and NDPA regulations, NEVER stream biometric payloads to HFSecurity's third-party test demo cloud (`13.213.52.114:8080`). All biometric extraction and matching MUST use the **Local SDK (`palm-VP930 local verify`)** to maintain 100% data sovereignty, zero latency, and bank-grade privacy.
- **Frontend SDK Bridge (`PalmScannerModule.java`)**: Wraps `palm-android-sdk-v1.3.7.jar`:
  - Lifecycle: `PalmSdk.initialize()` -> `Device.create()` -> `mDevice.open()` -> `createStream(StreamType.RGB_IR)` -> `start()`.
  - Capture: `mDevice.capturePalm(ICapturePalmCallback, timeout)` extracts `CaptureFrame.irFeature` (`byte[]`), `rgbFeature` (`byte[]`), `score` (`float`), `palmType` (`0: left, 1: right`).
  - Real-Time Guidance Hints: Map SDK hints to UI prompts: `NO_PALM_DETECTED`, `BIG_POSE`, `QUALITY_ERROR`, `LIVENESS_ERROR`, `IR_DARKNESS` (move closer), `IR_OVER_EXPOSE` (move away), `PALM_IS_MOVING` (keep still).
  - Hardware LEDs: `setLedMode()` toggles `LED_GREEN_MODE` on approval, `LED_RED_MODE` on decline, `LED_BLUE_BREATH_MODE` during scan.
- **Data Transit & Storage**:
  - **Transit**: Converted to Base64 strings sent over HTTPS to Supabase Edge Functions.
  - **Storage**: Supabase stores palm features strictly as **`BYTEA` (Binary/Byte Array)** data types.
- **Matching Engine (C++ Microservice)**: 1:N Biometric Matching runs in a sovereign C++ Microservice utilizing the Linux SDK (`vp930-sdk-linux-x86_64-v1.3.58-P`):
  - In-Memory RAM Matching: Loads `BYTEA` templates as `std::vector<float>` in RAM.
  - Comparison: Executes `CompareFeaturesScore(ir_score, rgb_score, ir_src, ir_target, rgb_src, rgb_target, RecognizeMode::kRegIrVSIr)` in <200ms across the customer dataset.


## Scalability & Security (Enterprise Grade)
- **Zero Exposed Keys**: NEVER hardcode API keys, Supabase Service Role keys, or third-party secrets in the frontend or public repositories. They MUST be restricted to Edge Functions, environment variables, and the Supabase Vault.
- **Massive Scale Preparation**: All database queries, APIs, and Edge Functions must be designed to support millions of concurrent users without crashing.
- **Mandatory Defenses**: Every backend integration MUST include:
  1. Strict **Input Validation** (e.g., using Zod).
  2. **Rate Limiting** to prevent brute-force attacks and API abuse.
  3. **Caching** mechanisms for high-read data to reduce database load.
- **Step-by-Step Execution**: Development must proceed deliberately, step-by-step, with rigorous testing and no skipped steps to prevent critical crashes.

## Open Banking Integration (Mono)
- **Strict Sandbox Usage**: During development, NEVER build manual input forms to collect mock bank account numbers or credentials. You MUST use the official @mono.co/connect-react-native SDK configured with the Mono Sandbox Public Key.
- **Widget Flow**: The frontend must launch the Mono Connect widget in test mode, allowing users to select predefined scenarios (Success, Failed, 2FA) without typing fake credentials.
- **Secure Token Exchange**: The frontend must NEVER handle the Mono Secret Key or fetch account data directly. The widget must return an authentication code to the frontend, which is then securely passed to a Supabase Edge Function (e.g., link-mono-account).
- **Edge Function Responsibility**: The Edge Function uses the Secret Key to exchange the code for an  ccount_id via Mono's API, fetches the real banking details, and securely inserts the record into the public.linked_accounts table.

## Merchant Onboarding, Settlement & Mono Architecture
- **Merchant Verification**: Always verify merchant settlement bank accounts using Mono's Account Lookup API (`/v2/lookup/account`) against NIBSS in real-time. Never allow unverified bank accounts to be registered.
- **Split Payments & Sub-Accounts**: Each merchant is provisioned a Mono Sub-Account (`mono_subaccount_id`). Customer debits via Mono DirectPay automatically split the transaction (e.g., 98.5% to merchant settlement account, 1.5% platform fee to MiliPay revenue account).
- **Automated Payouts (Disbursements)**: Disburse funds to merchant commercial bank accounts via Mono Transfers API (Instant T+0 or Daily EOD batch NIP transfers).
- **Portal Responsibilities**:
  - **`agent-portal`**: Field Agents register physical merchants in person, verify physical store premises, and pair VP930Pro terminal serial numbers (`TID`).
  - **`AdminPanel`**: Admins manage KYB reviews, commission rates, merchant status (`active`, `suspended`), POS hardware allocation, and master settlement ledgers.

## Merchant POS Execution & Hardware (HFSecurity VP930Pro)
- **POS App Architecture**: The VP930Pro runs an Android POS app (React Native with custom Java SDK bridge `PalmScannerModule.java` wrapping HFSecurity `PalmSdk`).
- **Checkout Flow**:
  1. Cashier enters bill amount on VP930Pro touchscreen/keypad.
  2. Customer places palm 10-15cm above the dual-lens (NIR 850nm + RGB) sensor.
  3. Liveness check prevents spoofing (rejects photos, screens, 3D rubber hands).
  4. Device extracts `irFeature` raw byte array, converts to Base64, and sends to `process-payment` Edge Function.
  5. C++ Microservice matches palm in RAM (<200ms) to identify customer and linked Mono account.
  6. Mono executes DirectPay debit & split settlement.
  7. Built-in thermal printer produces Customer and Merchant receipts.

## Transaction Safety, Error Handling & Auto-Reversal Strategy
- **Insufficient Funds**: Mono returns `INSUFFICIENT_FUNDS`; VP930Pro screen turns RED with audible failure chime; no money moves; optional prompt to use backup linked account.
- **Network Timeouts & Failed Transactions**:
  - All payment requests use unique **Idempotency Keys** (`reference`) to prevent double charges.
  - Transactions use two-way webhook handshakes. If a bank network drops midway, Mono's automatic reversal engine refunds the customer within minutes instead of standard 14-day bank dispute cycles.
- **PIN Verification for High-Value Payments**: By default, transactions exceeding **₦10,000** require customer 4-digit MiliPay PIN verification on the terminal. However, the PIN security threshold is **customer-configurable** in the mobile app (can be adjusted between ₦0 and their Tier single transaction cap). If a customer raises their threshold to ₦25,000, any transaction of ₦20,000 is approved via palm scan alone without a PIN prompt; only transactions exceeding their personalized threshold will trigger a PIN challenge.
- **Offline & Hardware Safety**: Terminals feature dual connectivity (Wi-Fi + 4G SIM fallback). If offline, the terminal refuses to initiate a scan to prevent partial/orphaned states. Lost or stolen terminals hold no funds and can be blacklisted instantly from the Admin Panel.

## Customer KYC Tiers & Transaction Limits (STRICT)
All customer profiles follow a 3-tier risk and regulatory compliance framework aligned with CBN standards:

1. **Tier 1 (Basic / App Download)**:
   - **Qualification**: Basic customer profile / phone number before full biometric enrollment.
   - **Max Single Transaction**: ₦50,000.
   - **Max Daily Cumulative Limit**: ₦200,000 (resets at 00:00 West Africa Time / WAT).
   - **PIN Security**: Mandatory for transactions exceeding customer threshold (Default: ₦10,000).

2. **Tier 2 (Default on Enrollment - ACTIVE)**:
   - **Qualification**: Automatically granted the moment a customer registers with an Agent/Admin and their **NIN + Palm Vein Scan is confirmed**.
   - **Max Single Transaction**: ₦150,000.
   - **Max Daily Cumulative Limit**: ₦500,000 (resets at 00:00 WAT).
   - **PIN Security**: Mandatory for transactions exceeding customer threshold (Default: ₦10,000).

3. **Tier 3 (Enhanced KYC / Enterprise - COMING SOON)**:
   - **Qualification**: Requires **BVN Verification** (via Mono Account Lookup against NIBSS) + verified proof of address/utility bill.
   - **Max Single Transaction**: ₦250,000.
   - **Max Daily Cumulative Limit**: ₦1,000,000 (1M) (resets at 00:00 WAT).
   - **PIN Security**: Mandatory for transactions exceeding customer threshold (Default: ₦10,000).
   - **Status**: Displayed with "Coming Soon" badge across customer app and admin portals.

4. **Multi-Layer Enforcement Engine**:
   - `public.customers` and `public.users` must store `kyc_tier` (`int`, default `2`) and `pin_threshold` (`numeric(12,2)`, default `10000.00`).
   - `process-payment` Edge Function strictly validates:
     1. `amount <= TIER_LIMITS[kyc_tier].maxSingleTxn`
     2. If `amount > pin_threshold`, assert that `pin` was provided and valid.
     3. `(daily_spent + amount) <= TIER_LIMITS[kyc_tier].maxDailyVolume`
   - Mobile app allows user to configure `pin_threshold` with quick presets (₦2k, ₦5k, ₦10k Default, ₦25k, Max) guarded by biometric/PIN confirmation.

