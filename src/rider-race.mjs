// 캄몬라이더 10분 경기: pg_cron이 2분마다 부르는 호출 중 한 번만 녹화 작업(rider-race.yml)을 띄운다.
// 러너 준비·녹화·인코딩에 4~5분 걸려 정각 8분 전(:02, :12 …)에 띄우고, 작업이 다음 정각을 기다렸다 올린다.
export const RACE_EVERY_MIN = 10;
export const LEAD_MIN = 8;

// 호출이 2분 간격이라 매 10분의 2~3분에 걸린 호출 하나만 참이다(늦게 와도 한 칸에 한 번).
export const raceSlot = (date = new Date()) => (date.getUTCMinutes() + LEAD_MIN) % RACE_EVERY_MIN < 2;

// 최신 경기 커밋. 브랜치 이름 주소(raw)는 5분 캐시라 정각에 바뀌지 않아, 그 순간 커밋 주소로 보낸다.
export async function latestRaceSha(token, fetcher = fetch) {
    const response = await fetcher('https://api.github.com/repos/ststats/badges/git/ref/heads/rider-race', {
        headers: {
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('Race branch lookup failed');
    const sha = (await response.json())?.object?.sha;
    if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error('Race branch lookup failed');
    return sha;
}

export async function dispatchRace(token, fetcher = fetch) {
    if (!token) throw new Error('Missing GitHub dispatch credential');
    const response = await fetcher(
        'https://api.github.com/repos/ststats/badges/actions/workflows/rider-race.yml/dispatches',
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json',
                'X-GitHub-Api-Version': '2022-11-28',
            },
            body: JSON.stringify({ ref: 'main' }),
            signal: AbortSignal.timeout(10000),
        }
    );
    if (response.status !== 204) throw new Error('Workflow dispatch rejected');
}

// 최신 경기 주소를 얼마나 기억할지(초). 올라오는 순간(정각 직후 30초)에는 기억하지 않고 매번 확인하고,
// 그 밖에는 다음 정각을 넘지 않게 최대 60초만 기억한다(러너가 늦어 30초 뒤에 올라와도 1분 안에 바뀐다).
export const FRESH_SEC = 30;
export const KEEP_MAX_SEC = 60;
export function raceCacheSeconds(now = Date.now()) {
    const into = now % (RACE_EVERY_MIN * 60000);
    return into < FRESH_SEC * 1000 ? 0 : Math.min(KEEP_MAX_SEC, Math.floor((RACE_EVERY_MIN * 60000 - into) / 1000));
}
