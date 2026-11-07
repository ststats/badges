import { currentCookie } from '../src/live.mjs';
import { sharedNoticeHandler } from '../src/shared-notices.mjs';

// 인증된 서버끼리만 읽는다. SOOP 쿠키와 COOKIE_KEY는 Vercel 밖으로 나가지 않는다.
export default (req, res) => sharedNoticeHandler({ secret: process.env.BADGE_WRITE_SECRET, currentCookie })(req, res);
