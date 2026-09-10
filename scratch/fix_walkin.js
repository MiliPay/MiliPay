const fs = require('fs');
let code = fs.readFileSync('packages/shared/src/features/support/api.ts', 'utf8');

const target = '  if (error) throw error;\n  return data;\n}\n\nexport async function bumpTicketPriority';
const replacement = '  if (error) throw error;\n\n  await supabase\n    .from("ticket_messages")\n    .insert({\n      ticket_id: data.id,\n      sender_id: createdById,\n      sender_type: "staff",\n      content: "Hello! We created this formal ticket for your walk-in visit. You can track our progress and reply to us directly here.",\n    });\n\n  return data;\n}\n\nexport async function bumpTicketPriority';

code = code.replace(target, replacement);
fs.writeFileSync('packages/shared/src/features/support/api.ts', code);
