const fs = require('fs');
const file = 'packages/shared/src/pages/dashboard/AgentSupportPage.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div className="lg:col-span-2 bg-white\\/\\[0\\.02\\].*?<\\/div>\\s*<\\!-- Search Box -->/s;
content = content.replace(
  /<div className="grid grid-cols-1 lg:grid-cols-3 gap-8">[\s\S]*?{.*?\/\* Search Box \*\//,
  \<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Search Box */\
);

content = content.replace(
  /Support & Live Chat/,
  "Walk-in Tickets & Search"
);

content = content.replace(
  /Manage incoming live chats and formal support tickets./,
  "Create tickets for physical walk-ins or track existing formal tickets."
);

fs.writeFileSync(file, content, 'utf8');
