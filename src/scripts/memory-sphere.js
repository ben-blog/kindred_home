/**
 * Lazy memory sphere. The call page owns the data; this file only draws it.
 * Layout and accent come from the character, not from a name.
 * Emotion colors come from src/config/memory-emotions.js.
 */
import {
  memoryEmotionColor,
  memoryEmotionCss,
  memoryEmotionLabel,
  memoryEmotions,
} from '../config/memory-emotions.js';
import { memoryKindCss, memoryKindRgb } from '../lib/memory-kind.js';
import { clampZ, pinchZ, wheelZ, doubleTapZ, resetZoom } from '../lib/orb-zoom.js';
import { stepOrbMotion } from '../lib/orb-motion.js';
import { safeHttpUrl } from '../lib/safe-url.js';

const PULSE_MS = 980;

export async function mountSphere(root, call, options) {
  let reduced = options.reduced === true;
  let THREE;
  try {
    THREE = await import('three');
  } catch {
    return null;
  }

  const accent = safeColor(options.accent, '#ffffff');
  const layout = options.layout === 'void' ? 'void' : 'board';
  const mobile =
    options.mobile === true ||
    (options.mobile !== false && window.matchMedia('(max-width: 800px)').matches);
  const colorMode = options.colorMode === 'kind' ? 'kind' : 'emotion';
  const ratioCap = mobile ? 1.25 : 2;
  const drawCap = Number.isFinite(options.drawCap) ? options.drawCap : mobile ? 480 : 4000;
  const width = root.clientWidth || 220;
  const height = root.clientHeight || 220;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !mobile });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioCap));
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  root.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 20);
  camera.position.z = 4.05;
  const tilt = new THREE.Group();
  tilt.rotation.x = 0.22;
  tilt.rotation.z = 0.46;
  scene.add(tilt);
  const rig = new THREE.Group();
  tilt.add(rig);
  const orient = new THREE.Quaternion();
  orient.setFromEuler(new THREE.Euler(0, reduced ? 0.7 : 0.62, 0, 'XYZ'));
  rig.quaternion.copy(orient);
  const turnYaw = new THREE.Quaternion();
  const turnPitch = new THREE.Quaternion();
  const axisY = new THREE.Vector3(0, 1, 0);
  const axisX = new THREE.Vector3(1, 0, 0);
  let dragVx = 0;
  let dragVy = 0;
  let dragging = false;
  let dragPointer = null;
  let dragX = 0;
  let dragY = 0;
  let dragAt = 0;
  let dragMoved = 0;
  let releasedAt = -1e15;

  const accentColor = displayColor(THREE, accent);
  const globe = new THREE.SphereGeometry(1, mobile ? 32 : 64, mobile ? 18 : 40);
  const shell = shellMaterial(THREE, accentColor, 1);
  const back = shellMaterial(THREE, accentColor, 0);
  const frontMesh = new THREE.Mesh(globe, shell);
  const backMesh = new THREE.Mesh(globe, back);
  backMesh.renderOrder = 0;
  frontMesh.renderOrder = 1;
  rig.add(backMesh, frontMesh);

  const pointMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    uniforms: {
      uPixelRatio: { value: renderer.getPixelRatio() },
      uFit: { value: fitScale(width) },
    },
    vertexShader: `
      uniform float uPixelRatio;
      uniform float uFit;
      attribute vec3 color;
      attribute float aSize;
      varying vec3 vColor;
      varying float vFacing;
      void main() {
        if (aSize <= 0.0) {
          vFacing = 0.0;
          vColor = vec3(0.0);
          gl_PointSize = 0.0;
          gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          return;
        }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 viewNormal = normalize(normalMatrix * normalize(position));
        float front = smoothstep(-0.2, 0.85, viewNormal.z);
        vFacing = front;
        vColor = color * mix(0.5, 1.0, front);
        gl_Position = projectionMatrix * mv;
        float dist = max(0.35, -mv.z);
        float persp = 4.05 / dist;
        gl_PointSize = aSize * uFit * uPixelRatio * persp * mix(0.66, 1.05, front);
        gl_PointSize = clamp(gl_PointSize, 1.5, 48.0);
      }
    `,
    fragmentShader: `
      varying vec3 vColor;
      varying float vFacing;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d = length(uv);
        float disc = 1.0 - smoothstep(0.3, 0.5, d);
        float core = 1.0 - smoothstep(0.0, 0.18, d);
        if (disc <= 0.01) discard;
        vec3 rgb = mix(vColor, vec3(1.0), core * 0.08);
        float alpha = disc * mix(0.62, 1.0, vFacing);
        gl_FragColor = vec4(rgb, alpha);
      }
    `,
  });

  let pointsMesh = null;
  let lineMesh = null;
  let records = [];
  let version = '';
  let focusId = '';
  let retrieved = new Set();
  let cutoff = 0;
  let pendingCutoff = null;
  let marks = null;
  let frame = 0;
  let last = performance.now();
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.14;
  const pointer = new THREE.Vector2(2, 2);

  const label = document.createElement('p');
  label.className = 'call-memory-label';
  label.hidden = true;
  const legend = document.createElement('ul');
  legend.className = 'call-memory-legend';
  legend.setAttribute('aria-label', 'emotions');
  legend.hidden = true;
  root.append(label, legend);

  function resize() {
    const nextWidth = root.clientWidth || width;
    const nextHeight = root.clientHeight || height;
    if (nextWidth < 2 || nextHeight < 2) return;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratioCap));
    renderer.setSize(nextWidth, nextHeight, false);
    pointMaterial.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    pointMaterial.uniforms.uFit.value = fitScale(nextWidth);
    if (reduced) paint(performance.now());
  }

  function rebuild(next, nextVersion) {
    const previous = new Map(records.map((item) => [item.id, item]));
    const moved = version !== '' && nextVersion !== version;
    const arriving = previous.size > 0 && !moved;
    const now = performance.now();
    version = nextVersion;
    const crowd = pointSize(next.length, layout);
    records = next.map((point) => {
      const prior = previous.get(point.id);
      const raw = new THREE.Vector3(point.x, point.y, point.z);
      const length = raw.length();
      const target = length > 0 && length < 0.92 ? raw : raw.clone().normalize();
      const shown = prior
        ? prior.shown.clone()
        : target.clone().multiplyScalar(reduced || moved ? 1 : arriving ? 1.35 : 2.15);
      if (moved && prior) shown.copy(prior.shown);
      const born = !reduced && arriving && !prior ? now : prior?.born || 0;
      return {
        ...point,
        target,
        shown,
        born,
        color: pointColor(THREE, accent, point, layout, colorMode),
        size: crowd * intensityScale(point.intensity),
      };
    });
    if (pointsMesh) {
      rig.remove(pointsMesh);
      pointsMesh.geometry.dispose();
      pointsMesh = null;
    }
    if (!records.length) {
      cutoff = 0;
      pendingCutoff = null;
      paintLegend();
      if (reduced) paint(now);
      return;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(records.length * 3), 3)
    );
    geometry.setAttribute(
      'color',
      new THREE.BufferAttribute(new Float32Array(records.length * 3), 3)
    );
    geometry.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(records.length), 1));
    pointsMesh = new THREE.Points(geometry, pointMaterial);
    pointsMesh.renderOrder = 2;
    pointsMesh.frustumCulled = false;
    rig.add(pointsMesh);
    cutoff =
      pendingCutoff == null ? records.length : Math.max(0, Math.min(records.length, pendingCutoff));
    pendingCutoff = null;
    paintLegend();
    if (reduced) paint(now);
  }

  function isDrawn(index) {
    if (index < 0 || index >= cutoff) return false;
    const start = Math.max(0, Math.min(cutoff, records.length) - drawCap);
    return index >= start;
  }

  function paintLegend() {
    if (colorMode === 'kind') {
      paintKindLegend();
      return;
    }
    const present = memoryEmotions.filter((emotion) =>
      records.some((record) => record.emotion === emotion)
    );
    legend.replaceChildren();
    legend.hidden = present.length === 0;
    for (const emotion of present) {
      const item = document.createElement('li');
      const swatch = document.createElement('i');
      swatch.style.background = memoryEmotionCss(accent, emotion, 0.84, layout);
      const name = document.createElement('span');
      name.textContent = memoryEmotionLabel(emotion);
      item.append(swatch, name);
      legend.append(item);
    }
  }

  function paintKindLegend() {
    const present = [];
    for (const record of records) {
      if (record.kind && !present.includes(record.kind)) present.push(record.kind);
    }
    legend.replaceChildren();
    legend.hidden = present.length === 0;
    legend.setAttribute('aria-label', 'kinds');
    for (const kind of present) {
      const item = document.createElement('li');
      const swatch = document.createElement('i');
      swatch.style.background = memoryKindCss(accent, kind, layout);
      const name = document.createElement('span');
      name.textContent = kind;
      item.append(swatch, name);
      legend.append(item);
    }
  }

  function writeBuffers(now) {
    if (!pointsMesh) return;
    const position = pointsMesh.geometry.attributes.position;
    const color = pointsMesh.geometry.attributes.color;
    const size = pointsMesh.geometry.attributes.aSize;
    records.forEach((record, index) => {
      position.setXYZ(index, record.shown.x, record.shown.y, record.shown.z);
      let { r, g, b } = record.color;
      const pulse = pulseAmount(record, now);
      if (pulse > 0) {
        r += (1 - r) * pulse * 0.75;
        g += (1 - g) * pulse * 0.75;
        b += (1 - b) * pulse * 0.75;
      }
      if (retrieved.has(record.id)) {
        const glow = reduced ? 1 : 0.65 + Math.sin(now / 280) * 0.35;
        const mix = 0.35 + 0.65 * glow;
        r += (1 - r) * mix;
        g += (1 - g) * mix;
        b += (1 - b) * mix;
      }
      if (record.id === focusId) {
        r += (1 - r) * 0.8;
        g += (1 - g) * 0.8;
        b += (1 - b) * 0.8;
      }
      let scale = 1;
      if (marks) {
        const removedMark = marks.removed?.has(record.id);
        const added = marks.added?.has(record.id);
        const weakened = marks.weakened?.has(record.id);
        if (removedMark) {
          r = 0.72 + r * 0.15;
          g *= 0.22;
          b *= 0.22;
          scale = 0.72;
        } else if (added) {
          r += (1 - r) * 0.28;
          g += (1 - g) * 0.28;
          b += (1 - b) * 0.28;
          scale = 1.35;
        } else if (weakened) {
          r = r * 0.35 + 0.62;
          g *= 0.32;
          b *= 0.28;
          scale = 0.8;
        } else {
          r *= 0.16;
          g *= 0.16;
          b *= 0.16;
          scale = 0.55;
        }
      }
      color.setXYZ(index, r, g, b);
      size.setX(index, isDrawn(index) ? record.size * (1 + pulse * 1.25) * scale : 0);
    });
    position.needsUpdate = true;
    color.needsUpdate = true;
    size.needsUpdate = true;
  }

  function syncLines() {
    if (!lineMesh) return;
    const position = lineMesh.geometry.attributes.position;
    records
      .filter((record) => retrieved.has(record.id))
      .forEach((record, index) => {
        position.setXYZ(index, record.shown.x, record.shown.y, record.shown.z);
      });
    position.needsUpdate = true;
  }

  function drawLines() {
    if (lineMesh) {
      rig.remove(lineMesh);
      lineMesh.geometry.dispose();
      lineMesh.material.dispose();
      lineMesh = null;
    }
    const chosen = records.filter((record) => retrieved.has(record.id));
    if (!chosen.length) return;
    const positions = new Float32Array(chosen.length * 6);
    chosen.forEach((record, index) => {
      positions.set([record.shown.x, record.shown.y, record.shown.z, 0, 0, 0], index * 6);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    lineMesh = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: accentColor,
        transparent: true,
        opacity: layout === 'void' ? 0.34 : 0.42,
        depthWrite: false,
      })
    );
    lineMesh.renderOrder = 3;
    rig.add(lineMesh);
  }

  function hit() {
    if (!pointsMesh || pointer.x > 1) return null;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObject(pointsMesh);
    for (const item of hits) {
      if (!isDrawn(item.index)) continue;
      return records[item.index] || null;
    }
    return null;
  }

  function showLabel(record) {
    label.replaceChildren();
    if (!record) {
      label.hidden = true;
      return;
    }
    label.hidden = false;
    const name = document.createElement('span');
    name.textContent = record.label || record.kind;
    label.append(name);
    const emotion = memoryEmotionLabel(record.emotion);
    if (emotion) {
      const mood = document.createElement('span');
      mood.className = 'call-memory-emotion';
      const swatch = document.createElement('i');
      swatch.style.background = memoryEmotionCss(accent, emotion, record.intensity, layout);
      mood.append(swatch, document.createTextNode(emotion));
      label.append(mood);
    }
    const href = safeHttpUrl(record.url);
    if (!href) return;
    const link = document.createElement('a');
    link.className = 'call-memory-link';
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = href;
    label.append(link);
  }

  function paint(now) {
    writeBuffers(now);
    syncLines();
    renderer.render(scene, camera);
  }

  function turn(yaw, pitch) {
    if (!yaw && !pitch) return;
    turnYaw.setFromAxisAngle(axisY, yaw);
    turnPitch.setFromAxisAngle(axisX, pitch);
    orient.premultiply(turnPitch).premultiply(turnYaw);
    rig.quaternion.copy(orient);
  }

  function ensureFrame() {
    if (stopped || frame) return;
    last = performance.now();
    frame = requestAnimationFrame(animate);
  }

  const canvas = renderer.domElement;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', 'Memory sphere. Drag to turn; pinch or scroll to zoom.');
  const touches = new Map();
  let pinch = null;
  let tap = null;
  let suppressClick = false;
  function ndc(x, y) {
    const r = canvas.getBoundingClientRect();
    return new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, 1 - ((y - r.top) / r.height) * 2);
  }
  function zoomAt(next, clientX, clientY) {
    const z = clampZ(next);
    if (z === camera.position.z) return;
    const rect = canvas.getBoundingClientRect();
    const focal = ndc(clientX ?? rect.left + rect.width / 2, clientY ?? rect.top + rect.height / 2);
    camera.updateMatrixWorld();
    raycaster.setFromCamera(focal, camera);
    // Anchor the visible surface; empty-space gestures use its central plane.
    const anchor =
      raycaster.ray.intersectSphere(
        new THREE.Sphere(new THREE.Vector3(), 1),
        new THREE.Vector3()
      ) ||
      raycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
        new THREE.Vector3()
      );
    camera.position.z = z;
    const aim = () => {
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
    };
    aim();
    if (anchor) {
      // Solve the two screen coordinates while retaining lookAt(origin).
      const project = () => anchor.clone().project(camera);
      for (let i = 0; i < 8; i++) {
        const p = project(),
          ex = focal.x - p.x,
          ey = focal.y - p.y;
        if (Math.hypot(ex, ey) < 0.0005) break;
        const epsilon = 0.001;
        camera.position.x += epsilon;
        aim();
        const px = project();
        camera.position.x -= epsilon;
        camera.position.y += epsilon;
        aim();
        const py = project();
        camera.position.y -= epsilon;
        aim();
        const a = (px.x - p.x) / epsilon,
          b = (py.x - p.x) / epsilon,
          c = (px.y - p.y) / epsilon,
          d = (py.y - p.y) / epsilon;
        const det = a * d - b * c;
        if (Math.abs(det) < 1e-6) break;
        camera.position.x += Math.max(-0.4, Math.min(0.4, (ex * d - b * ey) / det));
        camera.position.y += Math.max(-0.4, Math.min(0.4, (a * ey - ex * c) / det));
        camera.position.x = THREE.MathUtils.clamp(camera.position.x, -3, 3);
        camera.position.y = THREE.MathUtils.clamp(camera.position.y, -3, 3);
        aim();
      }
    }
    dragVx = dragVy = 0;
    releasedAt = performance.now();
    paint(performance.now());
  }
  function reset() {
    camera.position.copy(resetZoom());
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    paint(performance.now());
  }
  function region(x, y) {
    const next = doubleTapZ(camera.position.z);
    if (next === 4.05) reset();
    else zoomAt(next, x, y);
  }
  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      zoomAt(
        wheelZ(camera.position.z, event.deltaY, event.deltaMode, canvas.clientHeight),
        event.clientX,
        event.clientY
      );
    },
    { passive: false }
  );
  call?.querySelectorAll('[data-zoom]').forEach((button) =>
    button.addEventListener('click', () => {
      if (button.dataset.zoom === 'reset') reset();
      else zoomAt(camera.position.z * (button.dataset.zoom === 'in' ? 0.8 : 1.25));
    })
  );
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!touches.size) suppressClick = false;
    canvas.setPointerCapture(event.pointerId);
    touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragVx = dragVy = 0;
    if (touches.size >= 2) {
      const [a, b] = [...touches.values()];
      pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), z: camera.position.z };
      dragging = false;
      dragPointer = null;
      suppressClick = true;
      return;
    }
    dragging = true;
    dragPointer = event.pointerId;
    dragX = event.clientX;
    dragY = event.clientY;
    dragAt = event.timeStamp;
    dragMoved = 0;
    canvas.classList.add('is-grabbing');
    showLabel(null);
    ensureFrame();
  });
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  function endDrag(event) {
    touches.delete(event.pointerId);
    if (pinch) {
      if (touches.size < 2) pinch = null;
      dragMoved = 100;
      dragging = false;
      dragPointer = null;
    } else if (dragPointer === event.pointerId) {
      dragging = false;
      dragPointer = null;
      if (event.type === 'pointerup' && dragMoved < 12 && !suppressClick) {
        const now = performance.now();
        if (
          tap &&
          now - tap.at < 280 &&
          Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 12
        ) {
          region(event.clientX, event.clientY);
          tap = null;
          suppressClick = true;
        } else tap = { at: now, x: event.clientX, y: event.clientY };
      }
    }
    if (!touches.size) canvas.classList.remove('is-grabbing');
    releasedAt = performance.now();
    ensureFrame();
  }

  renderer.domElement.addEventListener('pointermove', (event) => {
    if (touches.has(event.pointerId))
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      zoomAt(
        pinchZ(pinch.z, pinch.distance, Math.hypot(a.x - b.x, a.y - b.y)),
        (a.x + b.x) / 2,
        (a.y + b.y) / 2
      );
      return;
    }
    if (dragging && dragPointer === event.pointerId) {
      const dx = event.clientX - dragX;
      const dy = event.clientY - dragY;
      const dt = Math.max(0.016, (event.timeStamp - dragAt) / 1000);
      dragX = event.clientX;
      dragY = event.clientY;
      dragAt = event.timeStamp;
      dragMoved += Math.hypot(dx, dy);
      const sens = 0.007;
      dragVx = (dx * sens) / dt;
      dragVy = (dy * sens) / dt;
      turn(dx * sens, dy * sens);
      if (reduced) paint(performance.now());
      return;
    }
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
    const record = hit();
    showLabel(record);
    call?.dispatchEvent(new CustomEvent('memory-hover', { detail: { id: record?.id || '' } }));
  });
  renderer.domElement.addEventListener('pointerleave', (event) => {
    pointer.set(2, 2);
    if (label.contains(event.relatedTarget)) return;
    if (!focusId) showLabel(null);
  });
  label.addEventListener('pointerleave', (event) => {
    if (renderer.domElement.contains(event.relatedTarget)) return;
    if (!focusId) showLabel(null);
  });
  renderer.domElement.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    pointer.copy(ndc(event.clientX, event.clientY));
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    pointer.copy(ndc(event.clientX, event.clientY));
    if (dragMoved > 5) {
      dragMoved = 0;
      return;
    }
    const record = hit();
    focusId = record?.id || '';
    showLabel(record);
    if (reduced) paint(performance.now());
  });

  const observer = new ResizeObserver(() => resize());
  observer.observe(root);

  let stopped = false;
  function animate(now) {
    if (stopped) return;
    frame = requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!dragging && !pinch) {
      const step = stepOrbMotion({ vx: dragVx, vy: dragVy, releasedAt }, dt, { reduced, now });
      turn(step.dyaw, step.dpitch);
      dragVx = step.vx;
      dragVy = step.vy;
    }
    records.forEach((record) => record.shown.lerp(record.target, 0.08));
    paint(now);
    if (reduced && !dragging && dragVx === 0 && dragVy === 0) {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
    }
  }

  function holdStill() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    records.forEach((record) => record.shown.copy(record.target));
    paint(performance.now());
  }

  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  motion.addEventListener('change', () => {
    reduced = motion.matches;
    dragVx = 0;
    dragVy = 0;
    if (reduced) holdStill();
    else if (!frame) {
      releasedAt = -1e15;
      last = performance.now();
      frame = requestAnimationFrame(animate);
    }
  });

  if (reduced) holdStill();
  else {
    last = performance.now();
    frame = requestAnimationFrame(animate);
  }

  return {
    setMap(detail) {
      pendingCutoff = Number.isInteger(detail?.cutoff) ? detail.cutoff : null;
      const points = (Array.isArray(detail?.points) ? detail.points : []).filter(
        (point) => point && (colorMode === 'kind' || point.kind !== 'reflection')
      );
      const nextVersion = detail?.basisFingerprint
        ? String(detail.basisFingerprint)
        : detail?.basisVersion == null
          ? ''
          : String(detail.basisVersion);
      if (detail?.reset || (version && nextVersion && nextVersion !== version)) {
        records = [];
        version = '';
      }
      rebuild(points, nextVersion);
    },
    setCutoff(count) {
      const next = Math.max(0, Math.min(records.length, count | 0));
      if (!reduced && next > cutoff) {
        const now = performance.now();
        for (let index = cutoff; index < next; index += 1) records[index].born = now;
      }
      cutoff = next;
      if (reduced) paint(performance.now());
    },
    setMarks(next) {
      marks = next && typeof next === 'object' ? next : null;
      if (reduced) paint(performance.now());
    },
    showRetrieved(items) {
      retrieved = new Set(
        (items || [])
          .filter((item) => item && item.id && item.kind !== 'reflection')
          .map((item) => item.id)
      );
      drawLines();
      if (reduced) paint(performance.now());
    },
    focus(id) {
      focusId = id || '';
      const record = records.find((item) => item.id === focusId);
      showLabel(record || null);
      if (reduced) paint(performance.now());
    },
    stop() {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    },
  };
}

function pulseAmount(record, now) {
  if (!record.born) return 0;
  const age = now - record.born;
  if (age < 0 || age >= PULSE_MS) return 0;
  return Math.sin((age / PULSE_MS) * Math.PI);
}

function shellMaterial(THREE, color, side) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    side: side === 1 ? THREE.FrontSide : THREE.BackSide,
    uniforms: {
      uColor: { value: color },
      uSide: { value: side },
    },
    vertexShader: `
      varying vec3 vObj;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      void main() {
        vObj = position;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormalW = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uSide;
      varying vec3 vObj;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      float gridLine(float coord) {
        float w = max(fwidth(coord), 0.0015);
        float d = abs(fract(coord - 0.5) - 0.5);
        return 1.0 - smoothstep(w * 0.15, w * 1.2, d);
      }
      void main() {
        vec3 p = normalize(vObj);
        vec3 n = normalize(vNormalW);
        vec3 viewDir = normalize(cameraPosition - vWorld);
        float face = clamp(abs(dot(n, viewDir)), 0.0, 1.0);
        float fresnel = pow(1.0 - face, 1.65);
        float lat = asin(clamp(p.y, -1.0, 1.0));
        float lon = atan(p.z, p.x);
        float latLine = gridLine(lat / (3.14159265 / 6.0));
        float lonLine = gridLine(lon / (3.14159265 / 4.0));
        lonLine *= smoothstep(0.98, 0.72, abs(p.y));
        float equator = 1.0 - smoothstep(0.0, max(fwidth(p.y) * 1.7, 0.004), abs(p.y));
        float grid = clamp(max(max(latLine, lonLine), equator), 0.0, 1.0);
        float rim = uSide * smoothstep(0.08, 1.0, fresnel);
        vec3 ink = vec3(0.015, 0.016, 0.022);
        vec3 lineColor = mix(uColor, vec3(1.0), 0.22);
        vec3 rgb = mix(ink, lineColor, clamp(grid, 0.0, 1.0));
        rgb = mix(rgb, uColor, rim);
        float alpha = uSide * 0.16 + grid * mix(0.28, 0.72, uSide) + rim * 0.78;
        gl_FragColor = vec4(rgb, clamp(alpha, 0.0, 0.94));
      }
    `,
  });
}

function safeColor(value, fallback) {
  return /^#[0-9A-Fa-f]{6}$/.test(value || '') ? value : fallback;
}

function displayColor(THREE, hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  return new THREE.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function pointColor(THREE, accent, point, layout, colorMode) {
  if (colorMode === 'kind') {
    const tint = memoryKindRgb(accent, point.kind, layout);
    return { r: tint.r, g: tint.g, b: tint.b };
  }
  if (point.emotion) {
    const tint = memoryEmotionColor(accent, point.emotion, point.intensity, layout);
    if (tint) return tint;
  }
  const color = kindColor(THREE, accent, point.kind, layout).convertLinearToSRGB();
  return { r: color.r, g: color.g, b: color.b };
}

function kindColor(THREE, accent, kind, layout) {
  const color = new THREE.Color(kind === 'album_moment' ? '#FF6B4A' : accent);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  if (kind === 'album_moment') {
    if (layout === 'void') {
      hsl.s = 0.62;
      hsl.l = 0.72;
    } else {
      hsl.s = 0.78;
      hsl.l = 0.58;
    }
    return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
  }
  const hash = [...String(kind)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  hsl.h = (hsl.h + (hash % 6) * 0.07) % 1;
  if (layout === 'void') {
    hsl.s = Math.min(hsl.s, 0.45);
    hsl.l = 0.84;
  } else {
    hsl.l = Math.min(0.62, Math.max(0.42, hsl.l));
  }
  return new THREE.Color().setHSL(hsl.h, hsl.s, hsl.l);
}

function fitScale(canvasWidth) {
  return Math.min(1, Math.max(0.62, (canvasWidth || 260) / 260));
}

function pointSize(count, layout) {
  const base = layout === 'void' ? 13 : 14;
  const scale = Math.min(1, 20 / Math.sqrt(Math.max(count, 1)));
  return base * Math.max(0.46, scale);
}

function intensityScale(intensity) {
  if (typeof intensity !== 'number') return 1;
  return 0.58 + 0.74 * Math.min(1, Math.max(0, intensity));
}
