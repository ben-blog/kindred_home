/** Shared header/thread photo viewer. Native dialog supplies modality and focus trapping. */
export function mountPhotoViewer(root) {
  const dialog = root.querySelector('#call-viewer');
  const stage = dialog.querySelector('.call-viewer-stage') || document.createElement('div');
  stage.className = 'call-viewer-stage';
  const image = document.createElement('img');
  image.alt = '';
  stage.replaceChildren(image);
  dialog.querySelector('button').after(stage);
  const pointers = new Map();
  let scale = 1,
    x = 0,
    y = 0,
    gesture = null,
    opener = null,
    lastTap = null;
  function paint() {
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
  }
  function zoom(next, cx, cy) {
    const rect = stage.getBoundingClientRect(),
      old = scale;
    scale = Math.max(1, Math.min(4, next));
    const px = cx - rect.left - rect.width / 2,
      py = cy - rect.top - rect.height / 2;
    x = px - ((px - x) * scale) / old;
    y = py - ((py - y) * scale) / old;
    if (scale === 1) x = y = 0;
    paint();
  }
  function close() {
    dialog.close();
  }
  dialog.querySelector('button').addEventListener('click', close);
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || event.target === stage) close();
    if (event.target === image && scale === 1 && image.naturalWidth) {
      const r = stage.getBoundingClientRect();
      const fit = Math.min(r.width / image.naturalWidth, r.height / image.naturalHeight);
      const dx = Math.abs(event.clientX - r.left - r.width / 2);
      const dy = Math.abs(event.clientY - r.top - r.height / 2);
      if (dx > (image.naturalWidth * fit) / 2 || dy > (image.naturalHeight * fit) / 2) close();
    }
  });
  dialog.addEventListener('close', () => {
    scale = 1;
    x = y = 0;
    pointers.clear();
    gesture = null;
    lastTap = null;
    paint();
    opener?.focus({ preventScroll: true });
  });
  stage.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoom(
        scale *
          Math.exp(
            -event.deltaY *
              (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1) *
              0.002
          ),
        event.clientX,
        event.clientY
      );
    },
    { passive: false }
  );
  function start() {
    const pts = [...pointers.values()];
    if (pts.length >= 2) {
      const [a, b] = pts;
      gesture = {
        pinch: true,
        d: Math.hypot(a.x - b.x, a.y - b.y),
        scale,
        x,
        y,
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        moved: 0,
      };
    } else if (pts.length)
      gesture = { ...pts[0], baseX: x, baseY: y, at: performance.now(), moved: 0 };
  }
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture(event.pointerId);
    start();
  });
  stage.addEventListener('pointermove', (event) => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesture.pinch) {
      const [a, b] = [...pointers.values()];
      if (!b) return;
      const cx = (a.x + b.x) / 2,
        cy = (a.y + b.y) / 2;
      scale = gesture.scale;
      x = gesture.x;
      y = gesture.y;
      zoom(
        (gesture.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, gesture.d),
        gesture.cx,
        gesture.cy
      );
      x += cx - gesture.cx;
      y += cy - gesture.cy;
      gesture.moved = 100;
      paint();
    } else {
      const dx = event.clientX - gesture.x,
        dy = event.clientY - gesture.y;
      gesture.moved = Math.max(gesture.moved, Math.hypot(dx, dy));
      if (scale > 1) {
        x = gesture.baseX + dx;
        y = gesture.baseY + dy;
        paint();
      }
    }
  });
  function end(event) {
    if (!pointers.has(event.pointerId)) return;
    if (event.type === 'pointerup' && gesture && !gesture.pinch) {
      const dy = event.clientY - gesture.y;
      if (scale === 1 && dy > 90 && dy > Math.abs(event.clientX - gesture.x) * 1.3) {
        close();
        return;
      }
      if (gesture.moved < 12) {
        const now = performance.now();
        if (
          lastTap &&
          now - lastTap.at < 280 &&
          Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 12
        ) {
          zoom(scale > 1 ? 1 : 2.5, event.clientX, event.clientY);
          lastTap = null;
        } else lastTap = { at: now, x: event.clientX, y: event.clientY };
      }
    }
    pointers.delete(event.pointerId);
    gesture = null;
    if (pointers.size) {
      start();
      gesture.moved = 100;
    }
  }
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
  return (src, alt, trigger) => {
    if (!src) return;
    opener = trigger || document.activeElement;
    scale = 1;
    x = y = 0;
    paint();
    image.src = src;
    image.alt = alt || '';
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('button').focus();
  };
}
