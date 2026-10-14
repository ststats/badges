const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const validDeliveryLease = lease => UUID.test(lease || '');

// 완료 여부는 메모리가 아니라 마지막으로 영구 저장된 이력으로 판단한다.
export async function withDelivery({ lease = '', titleNo = '', run, loadState, report }) {
    if (!lease && !titleNo) return run();
    if (!validDeliveryLease(lease) || !/^[1-9]\d*$/.test(titleNo)) throw new Error('Invalid delivery input');
    let failure;
    try {
        await run();
    } catch (error) {
        failure = error;
    }
    let status;
    try {
        const state = await loadState();
        const done = state.done[titleNo];
        status = state.pending
            ? 'blocked'
            : (Number.isSafeInteger(done) && done > 0) || ['baseline', 'skipped'].includes(done)
              ? 'complete'
              : 'retry';
    } catch {
        // 이력 유실/조회 실패 상태에서는 새 자동 실행을 반복하지 않는다.
        status = 'blocked';
    }
    await report(lease, status);
    if (failure) throw failure;
}
