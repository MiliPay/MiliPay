# Project Rules & Guidelines

## Design & Styling Guidelines
- **Color Consistency**: Always use the defined project brand colors (e.g., `signal`, `ledger`, `ink`, `status-info`, `status-warn`, `status-ok`, `status-fail`). 
- **Avoid Hardcoded Colors**: NEVER use raw Tailwind colors like `blue-400` or `red-500` unless explicitly requested. Ensure the UI remains cohesive and relies on the theme variables.

## Support Portal Business Logic
When implementing support ticketing features, the following strict lifecycle MUST be followed:
1. **Ticket Creation**: User creates a ticket from the app. A unique `ticket_id` is generated, and the status defaults to `open`.
2. **Assignment & Resolution Tracking**: When a support agent opens an `open` ticket, it automatically assigns the ticket to them and changes the status to `in_progress`.
3. **Time Tracking**: The exact timestamp when the ticket status changes to `in_progress` is recorded. This is used against the `resolved_at` timestamp to calculate the agent's **Avg Resolution Time**.
4. **Resolution**: The assigned support agent chats with the user and marks the ticket as `resolved` when the issue is fixed.
5. **Escalation**: If the assigned agent cannot solve the issue, they can click "Escalate", which flags the ticket urgency as `high` and transfers the ticket to an **Admin** for resolution.
6. **Auto-Reopen**: If a user sends a new message in a `resolved` ticket, the ticket automatically transitions back to `open` or `in_progress`.
7. **SLA Warnings**: Tickets that remain `open` for more than a set threshold visually change color (e.g., yellow, red) to prioritize urgent handling.
