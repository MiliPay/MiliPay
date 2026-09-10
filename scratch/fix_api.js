const fs = require('fs');
const file = 'packages/shared/src/features/support/api.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  'customers:customer_id ( first_name, last_name, phone ),',
  'customers ( first_name, last_name, phone ),'
);

content = content.replace(
  'staff_profiles:assigned_to ( full_name )',
  'staff_profiles!assigned_to ( full_name )'
);

fs.writeFileSync(file, content, 'utf8');
