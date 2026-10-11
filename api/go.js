// /n/1 ~ /n/3: 누르는 순간의 최신 글로 보낸다. 못 읽으면 게시판으로.
import { boardUrl, postUrl } from '../src/lib.mjs';
import { config, query, recentPosts } from '../src/live.mjs';

export default async function handler(req, res) {
    const q = query(req);
    const i = Math.min(Math.max(Number(q.get('i')) || 1, 1), config.noticeCount) - 1;
    let target = boardUrl(config.soopId);
    try {
        const post = (await recentPosts())[i];
        if (post) target = postUrl(config.soopId, post.titleNo);
    } catch (e) {
        console.error(e);
    }
    res.statusCode = 302;
    res.setHeader('Location', target);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60');
    res.end();
}
