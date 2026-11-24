/** Group by the viewer's calendar day; timestamps retain Seoul product time. */
export function dayKey(at) {
  const d = new Date(at);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
export function groupsTogether(previous, next) {
  return (
    !!previous &&
    previous.mine === next.mine &&
    dayKey(previous.at) === dayKey(next.at) &&
    next.at >= previous.at &&
    next.at - previous.at < 180_000
  );
}
export function nearBottom({ scrollHeight, scrollTop, clientHeight }, threshold = 64) {
  return scrollHeight - scrollTop - clientHeight <= threshold;
}
