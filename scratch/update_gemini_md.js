const fs = require('fs');

const file = 'GEMINI.md';
let content = fs.readFileSync(file, 'utf8');

const targetSection = ## Support Portal Business Logic
When implementing support ticketing features, the following strict lifecycle MUST be followed:
1. **Initial Customer Contact (Live Chat)**: The customer initiates a basic support chat from the app (no formal ticket ID is generated yet).
2. **Agent Triage**: A support agent picks up the chat and attempts to resolve the issue on the spot.
3. **Formal Ticket Creation (Agent-Side)**: If the issue requires deeper investigation, engineering support, or admin escalation, the **Support Agent** manually creates a formal Ticket (\TKT-XXXX\) from their dashboard to transition the chat into a tracked case.
4. **Time Tracking & SLAs**: The exact timestamp when the ticket is formally created and assigned is recorded. SLA tracking (Avg Resolution Time) applies to formally created tickets to monitor complex issue resolution. Tickets that remain \open\ for more than a set threshold visually change color to prioritize urgent handling.
5. **Resolution**: The assigned agent marks the ticket as \esolved\ when the issue is fixed.
6. **Escalation**: If the assigned agent cannot solve the issue, they can click "Escalate", which flags the ticket urgency as \high\ and transfers the ticket to an **Admin** for resolution.
7. **Auto-Reopen**: If a user sends a new message in a \esolved\ ticket, the ticket automatically transitions back to \in_progress\.;

const newSection = ## Portal Terminology & Roles (STRICT)
Never mix up these three distinct portals and their associated roles:
1. **Agent Portal (\gent-portal\)**: Used strictly by **Field Agents** (\ole: 'agent'\). Their job is to register customers in the field and handle physical walk-in complaints.
2. **Service Portal (\service-portal\)**: Used strictly by **Support Staff** (\ole: 'support'\). Their job is to handle digital Live Chats coming from the mobile app.
3. **Admin Panel (\AdminPanel\)**: Used by **Admins/Super Admins** (\ole: 'admin'\). They handle escalated, high-complexity tickets sent from either Field Agents or Support Staff.

## Ticketing Business Logic
All support workflows follow a Two-Tier resolution structure where a Formal Ticket ID (\TKT-XXXX\) is ONLY generated upon resolution or escalation.

**Workflow A: Online Live Chat (Support Staff)**
1. **Informal Chat**: Customer starts a Live Chat in the Mobile App. It drops into the \service-portal\ queue. No Formal Ticket ID exists yet.
2. **Resolution (Solve)**: If Support Staff fixes it during the chat, they click "Solve". The system retroactively generates a Ticket ID (\TKT-XXXX\) for the archive and stamps \solved_by\ with the Support Staff's ID.
3. **Escalation**: If Support Staff cannot fix it, they click "Escalate", enter a Subject/Title, and the system generates a Ticket ID. The ticket is moved to the \AdminPanel\.

**Workflow B: Physical Walk-in (Field Agent)**
1. **Physical Dialogue**: A customer physically approaches a Field Agent with a complaint.
2. **Formalize**: The Field Agent searches for the customer's name in the \gent-portal\ and inputs the complaint details based on their dialogue.
3. **Resolution (Solve)**: If the Field Agent can solve it on the spot, they create and instantly "Solve" the ticket. It generates a Ticket ID and logs the Field Agent under \solved_by\.
4. **Escalation**: If the Field Agent cannot solve it, they create the ticket and immediately escalate it to the Admin. The generated ticket goes to the \AdminPanel\.

## Monorepo Architecture (STRICT)
This project is an **npm workspace monorepo**. You must respect the boundaries and shared nature of the codebase:
- **\packages/shared/\**: Contains the core logic, API calls, Supabase connections, global types, and shared React UI components. Changes here affect ALL web portals.
- **\mobile-app/\**: The React Native / Expo application for the customers.
- **\AdminPanel/\, \gent-portal/\, \service-portal/\, \website/\**: Independent web applications that consume the shared packages. Do not duplicate API calls or UI components inside these specific apps if they belong in the shared package.;

if(content.includes(targetSection)) {
    content = content.replace(targetSection, newSection);
    fs.writeFileSync(file, content, 'utf8');
    console.log("Successfully updated GEMINI.md");
} else {
    console.log("Could not find the exact target section to replace.");
}
