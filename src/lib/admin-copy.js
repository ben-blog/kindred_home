export const adminCopy = {
  loading: '불러오는 중…',
  retry: '다시 시도',
  signOut: '나가기',
  signOutFail: '나가지 못했습니다. 다시 시도해 주세요.',
  tickTitle: 'Tick을 누르면 쌓인 warmth가 반영됩니다',
  irreversible: '되돌릴 수 없습니다',
  tickRunning: 'tick 진행 중…',
  tickBusy: '다른 tick이 진행 중입니다 (409). 잠시 뒤 다시 눌러 주세요.',
  tickFail: 'tick 실패 · 서버 응답 없음 ({status}). 다시 시도',
  worldFail: '세계 상태를 못 불러왔습니다 ({status})',
  previewFail: '다음 tick 예상을 못 불러왔습니다. 다시 시도',
  noWarmth: '대기 중인 warmth가 없습니다 · tick하면 energy만 {decay} 줄어듭니다',
  sent: '보냄 · 다음 tick에 반영',
  wait: 'Warmth · {minutes}분 뒤',
  warmthFail: 'warmth를 못 보냈습니다. 다시 시도',
  confirmPublish: '게시하면 갤러리에 바로 보입니다. 게시할까요?',
  noReview: '검토할 사진이 없습니다',
  untitled: '제목 없음',
  review: '검토',
  publish: '승인 · 게시',
  reject: '거절',
  rejectConfirm: '거절 확정',
  reasonRequired: '거절 이유를 적어 주세요',
  captionCreate: '캡션 만들기',
  captionReady: '캡션 준비됨',
  captionDraft: '캡션 생성 전',
  saving: '저장 중…',
  writing: '캡션 쓰는 중…',
  publishing: '게시 중…',
  rejected: '거절했습니다',
  saved: '저장했습니다',
  published: '게시했습니다',
  uploading: '올리는 중…',
  fail: '실패했습니다 · {detail}',
  queue: '검토 대기',
  album: '앨범',
  albumManage: '앨범 관리',
  albumDescription: '사진 업로드 · 캡션 편집 · 게시 기록',
  character: '캐릭터',
  picture: '사진',
  note: '메모 (선택, 한 줄)',
  upload: '올리기',
  title: '제목',
  technique: '기법',
  description: '설명',
  reason: '이유',
  main: '메인에 표시',
  save: '저장',
  regenerate: '캡션 다시 쓰기',
};
export function adminMessage(template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? '—'));
}
export function relativeTime(value, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(value).getTime()) / 60000));
  if (!Number.isFinite(minutes)) return '시간 미상';
  if (minutes < 1) return '방금';
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)}시간 전`;
  if (minutes < 2880) return '어제';
  return `${Math.floor(minutes / 1440)}일 전`;
}
