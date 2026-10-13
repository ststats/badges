// 바깥 데이터(SOOP 게시판, 스타유니브 일정)를 잠깐 기억하는 도우미.
// ms 동안은 같은 답을 쓰고, 새로 받다가 실패하면 직전에 받은 답을 fallbackMs까지 대신 쓴다
// (커뮤니티에 깨진 이미지가 뜨지 않게).
export function keepFresh(load, { ms = 30000, fallbackMs = 6 * 3600 * 1000, label = '데이터' } = {}) {
    let request = null;
    let at = 0;
    let good = null;
    const get = () => {
        if (request && Date.now() - at < ms) return request;
        const mine = load().then(
            value => ((good = { at: Date.now(), value }), value),
            e => {
                if (good && Date.now() - good.at < fallbackMs) {
                    console.error(`${label} 실패, 직전 값을 씁니다: ${e.message}`);
                    return good.value;
                }
                throw e;
            }
        );
        request = mine;
        at = Date.now();
        mine.catch(() => { if (request === mine) request = null; });
        return mine;
    };
    get.forget = () => { request = null; };
    return get;
}
