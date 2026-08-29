# Project Rules & Guidelines

## Design & Styling Guidelines
- **Color Consistency**: Always use the defined project brand colors (e.g., `signal`, `ledger`, `ink`, `status-info`, `status-warn`, `status-ok`, `status-fail`). 
- **Avoid Hardcoded Colors**: NEVER use raw Tailwind colors like `blue-400` or `red-500` unless explicitly requested. Ensure the UI remains cohesive and relies on the theme variables.

## Support Portal Business Logic
When implementing support ticketing features, the following strict lifecycle MUST be followed:
1. **Initial Customer Contact (Live Chat)**: The customer initiates a basic support chat from the app (no formal ticket ID is generated yet).
2. **Agent Triage**: A support agent picks up the chat and attempts to resolve the issue on the spot.
3. **Formal Ticket Creation (Agent-Side)**: If the issue requires deeper investigation, engineering support, or admin escalation, the **Support Agent** manually creates a formal Ticket (`TKT-XXXX`) from their dashboard to transition the chat into a tracked case.
4. **Time Tracking & SLAs**: The exact timestamp when the ticket is formally created and assigned is recorded. SLA tracking (Avg Resolution Time) applies to formally created tickets to monitor complex issue resolution. Tickets that remain `open` for more than a set threshold visually change color to prioritize urgent handling.
5. **Resolution**: The assigned agent marks the ticket as `resolved` when the issue is fixed.
6. **Escalation**: If the assigned agent cannot solve the issue, they can click "Escalate", which flags the ticket urgency as `high` and transfers the ticket to an **Admin** for resolution.
7. **Auto-Reopen**: If a user sends a new message in a `resolved` ticket, the ticket automatically transitions back to `in_progress`.

## Communication Strategy (Cost Optimization)
- **Primary Method**: Email MUST be the primary default communication method for user onboarding, password generation, and authentication to optimize operational costs during the MVP phase.
- **Future SMS Architecture**: While SMS (e.g., via Termii) is disabled for standard onboarding to save costs, the system architecture and edge functions MUST be designed to easily toggle or re-integrate SMS in the future. Do not hardcode systems that rely exclusively on email without leaving room for a phone-based fallback.

## Biometric & Hardware Strategy
- **Palm Vein Over Fingerprint**: Due to security vulnerabilities with standard fingerprint cloning, the core POS biometric authentication MUST utilize Palm Vein Recognition.
- **Target Hardware**: The system is targeted to interface with the HFSecurity VP930Pro Biometric Palm Vein Scanner Module. All biometric data models and SDK integrations must account for Palm Vein template structures rather than basic fingerprints.

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
