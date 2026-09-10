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

## Biometric & Hardware Strategy (VP930Pro Architecture)
- **Palm Vein Over Fingerprint**: Due to security vulnerabilities with standard fingerprint cloning, the core POS biometric authentication MUST utilize Palm Vein Recognition targeting the HFSecurity VP930Pro.
- **Frontend Integration (React Native)**: Because there is no official React Native SDK, the mobile app MUST use a custom Java Native Module bridge. The bridge will initialize the HFSecurity Android SDK (`PalmSdk`), capture the palm, and extract the raw `byte[]` arrays (`rgbFeature` and `irFeature`).
- **Data Transit & Format**: 
  - **Transit**: The Android bridge converts the raw byte arrays to **Base64 strings** to send over the network to the Node.js backend.
  - **Storage**: Supabase MUST store the palm scan features strictly as **`BYTEA` (Binary/Byte Array)** data types. Do NOT store them as raw strings in the database to save space and maintain precision.
- **Matching Engine (C++ Microservice)**: 1:N Biometric Matching MUST NOT be done natively in Node.js. To achieve lightning-fast in-memory looping, a dedicated **C++ Microservice** utilizing the HFSecurity Linux C++ SDK will be built. 
  - The Node.js backend handles business logic and delegates the matching task to the C++ Microservice.
  - The C++ Microservice loads the `BYTEA` templates into RAM as `std::vector<float>` and runs the proprietary `CompareFeaturesScore` algorithm across the dataset.

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
- **Edge Function Responsibility**: The Edge Function uses the Secret Key to exchange the code for an ccount_id via Mono's API, fetches the real banking details, and securely inserts the record into the public.linked_accounts table.
