import { currentCookie } from '../src/live.mjs';
import { sharedNoticeHandler } from '../src/shared-notices.mjs';

// Authenticated server-to-server reads only. The SOOP cookie and COOKIE_KEY stay in Vercel.
export default (req, res) => sharedNoticeHandler({ secret: process.env.BADGE_WRITE_SECRET, currentCookie })(req, res);
