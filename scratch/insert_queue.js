const fs = require('fs');
const file = 'packages/shared/src/pages/dashboard/AgentSupportPage.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add import
content = content.replace(
  'import { CreateTicketModal } from "@milipay/shared/components/support/CreateTicketModal";',
  'import { CreateTicketModal } from "@milipay/shared/components/support/CreateTicketModal";\\nimport { LiveChatQueue } from "@milipay/shared/components/support/LiveChatQueue";'
);

// Add grid columns
content = content.replace(
  '<div className="max-w-6xl mx-auto p-8 space-y-10 pb-32">',
  '<div className="max-w-7xl mx-auto p-8 space-y-10 pb-32">'
);

content = content.replace(
  '<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">',
  \<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <LiveChatQueue routePrefix="/support" />
          </div>\
);

fs.writeFileSync(file, content, 'utf8');
