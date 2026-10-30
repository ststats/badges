// 캄몬라이더 10분 경기: pg_cron이 2분마다 부르는 호출 중 10분 칸에 걸린 한 번만 녹화 작업(rider-race.yml)을 띄운다.
export const RACE_EVERY_MIN = 10;

// 호출이 2분 간격이라 매 10분의 0~1분에 걸린 호출 하나만 참이다(늦게 와도 한 칸에 한 번).
export const raceSlot = (date = new Date()) => date.getUTCMinutes() % RACE_EVERY_MIN < 2;

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
