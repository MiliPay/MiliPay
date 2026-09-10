const fs = require('fs');
const file = 'packages/shared/src/pages/complaints/TicketDetailsPage.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  \const [newMessage, setNewMessage] = useState("");\,
  \const [newMessage, setNewMessage] = useState("");
  const [isEscalating, setIsEscalating] = useState(false);
  const [escalationSubject, setEscalationSubject] = useState("");\
);

content = content.replace(
  \const handleResolve = async () => {
    if (!ticket) return;
    await resolveTicket(ticket.id);
    await loadTicketAndMessages();
  };\,
  \const handleResolve = async () => {
    if (!ticket || !user) return;
    await resolveTicket(ticket.id, user.id);
    await loadTicketAndMessages();
  };\
);

content = content.replace(
  \const handleEscalate = async () => {
    if (!ticket) return;
    await escalateTicket(ticket.id);
    await loadTicketAndMessages();
  };\,
  \const handleEscalateClick = () => {
    setIsEscalating(true);
  };

  const handleConfirmEscalate = async () => {
    if (!ticket || !escalationSubject.trim()) return;
    await escalateTicket(ticket.id, escalationSubject.trim());
    setIsEscalating(false);
    setEscalationSubject("");
    await loadTicketAndMessages();
  };\
);

content = content.replace(
  \<Button onClick={handleEscalate} className="bg-transparent text-status-fail border border-status-fail/50 hover:bg-status-fail/10 gap-2">
                  <AlertTriangle className="w-4 h-4" /> Escalate to Admin
                </Button>\,
  \<Button onClick={handleEscalateClick} className="bg-transparent text-status-fail border border-status-fail/50 hover:bg-status-fail/10 gap-2">
                  <AlertTriangle className="w-4 h-4" /> Escalate to Admin
                </Button>\
);

content = content.replace(
  \Ticket {ticket.ticketId}\,
  \{ticket.ticketId ? \\\Ticket \\\\\\ : "Live Chat"}\
);

const modalHtml = \
      {/* Escalate Modal */}
      {isEscalating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/80 backdrop-blur-sm">
          <div className="bg-ledger border border-white/[0.1] rounded-3xl w-full max-w-md p-6 space-y-6">
            <h2 className="text-xl font-display text-white">Escalate to Admin</h2>
            <div>
              <label className="block text-sm font-medium text-ink-muted mb-2">Subject / Title</label>
              <input
                type="text"
                autoFocus
                value={escalationSubject}
                onChange={(e) => setEscalationSubject(e.target.value)}
                placeholder="e.g. Stuck Transfer - Requires DB Override"
                className="w-full bg-white/[0.05] border border-white/[0.1] text-ink px-4 py-3 rounded-xl focus:outline-none focus:border-signal/50"
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button onClick={() => setIsEscalating(false)} className="bg-transparent border border-white/[0.1] text-ink hover:text-white">Cancel</Button>
              <Button onClick={handleConfirmEscalate} disabled={!escalationSubject.trim()} className="bg-status-fail text-white">Confirm Escalate</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}\;

content = content.replace(
  \    </div>
  );
}\,
  modalHtml
);

fs.writeFileSync(file, content, 'utf8');
