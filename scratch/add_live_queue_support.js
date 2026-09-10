const fs = require('fs');
const file = 'packages/shared/src/pages/dashboard/SupportDashboard.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  \import { fetchSupportTicketStats } from "@milipay/shared/features/support/api";\,
  \import { fetchSupportTicketStats } from "@milipay/shared/features/support/api";
import { LiveChatQueue } from "@milipay/shared/components/support/LiveChatQueue";\
);

content = content.replace(
  \<span className="text-xl font-display text-status-ok">All Systems Go</span>
            </div>
          </div>
        </div>\,
  \<span className="text-xl font-display text-status-ok">All Systems Go</span>
            </div>
          </div>
        </div>

        {/* Live Chat Queue Addition */}
        <div className="pt-6">
          <div className="h-[500px]">
             <LiveChatQueue routePrefix="/complaints" />
          </div>
        </div>\
);

fs.writeFileSync(file, content, 'utf8');
