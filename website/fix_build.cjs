const fs = require('fs');
['Home.tsx', 'About.tsx', 'Agents.tsx', 'Customers.tsx', 'Merchants.tsx'].forEach(file => {
  let content = fs.readFileSync('website/src/pages/' + file, 'utf8');
  content = content.replace(/import React(?:, \{[^}]*\})? from 'react';\n/g, '');
  content = content.replace(/import \{ Link \} from 'react-router-dom';\n/g, '');
  content = content.replace(/import \{ Users, Shield, Zap, CheckCircle2 \} from 'lucide-react';/g, 'import { Users, Shield, Zap } from \'lucide-react\';');
  fs.writeFileSync('website/src/pages/' + file, content, 'utf8');
});
